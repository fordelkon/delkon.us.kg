# Agent Context Loading

## Entry points and prerequisites

Start with [AGENTS.md](../AGENTS.md) and follow its task-specific document links.
`CLAUDE.md` points to that same file. Project skills live under `.agents/skills/`,
with Claude aliases under `.claude/skills/`. The repository's working contracts
are available without installing any contributor's personal skills or plugins.

The optional Claude Code hook is registered in [project settings](../.claude/settings.json)
and implemented in [context.mjs](../.claude/hooks/context.mjs). It requires Node.js
and a client that supports and permits project hooks. The command resolves the
checkout through `CLAUDE_PROJECT_DIR`; no contributor-specific absolute path is
required. Keep each client's normal trust and permission controls enabled.

Clients without these hook or skill capabilities use the manual fallback below.
Discovery support and actual loading must be verified in the client being used.

## Claude Code hook contract

Claude Code's project `PreToolUse` hook receives `tool_name`,
`tool_input.file_path`, `cwd`, and optional `session_id`. It runs for `Read`,
`Edit`, and `Write`; shell tools do not trigger context routing. The hook does
not grant authorization, change permission settings, or format files.

Paths are resolved relative to the supplied working directory, with the project
root as fallback. Existing paths use their real path. For new paths, the hook
resolves the nearest existing ancestor and appends the missing suffix. Before
falling back to a parent, it uses `lstat` and `readlink` to follow dangling symbolic
links, including dangling parent directories and link chains, toward their target.
Thus an external target is excluded even when it does not exist yet; an internal
target receives its own path's contract. Only `ENOENT` and `ENOTDIR` permit
ancestor fallback; other filesystem errors surface. Native `ELOOP` errors propagate,
and manual dangling-link traversal is limited to 40 links before raising `ELOOP`.
The resolved path must remain inside the real project root.

Routing uses the resolved repository-relative path:

- Source paths under `src/`, plus `astro.config.ts`, `wrangler.jsonc`,
  `package.json`, `biome.json`, and `.oxlintrc.json`, receive
  [the agent guide](agent-guide.md).
- Paths in `test/`, `tests/`, or `__tests__/` directories, or with `.test.*` or
  `.spec.*` filenames, receive [the testing contract](testing.md). This takes
  precedence over source and content routing.
- Other paths under `content/` receive [the writing contract](writing.md).
- Maintenance paths under `.claude/hooks/` or `.agents/skills/`, root `AGENTS.md`
  and `CLAUDE.md`, and paths starting with `docs/agent-` receive this document and
  the agent guide. Test files in these maintenance paths also receive the testing
  contract.
- Unrelated paths and paths outside the repository receive no context.

Each selected document is emitted once per nonempty session ID and content hash,
using empty marker files under the operating system's temporary directory.
Changed documents can be emitted again; calls without a nonempty string session
ID always receive matching context. Duplicate document selections are collapsed.

A call emits at most one JSON object with `hookSpecificOutput.hookEventName` set
to `PreToolUse` and the combined text in `hookSpecificOutput.additionalContext`.
The total text stays strictly below 9,500 characters, including document prefixes,
separators, and notices. Whole documents are included when they fit after reserving
space for every selected document's notice. Otherwise an explicit notice directs
the client to read the full document; it never silently truncates a contract.
This applies independently of the current size of the writing contract.

## Manual fallback

For shell reads and clients without this hook, follow the root task index in
[AGENTS.md](../AGENTS.md) or [CLAUDE.md](../CLAUDE.md) and explicitly read the linked
contracts relevant to the task. If skill discovery is unavailable, read the
applicable `SKILL.md` directly under `.agents/skills/` and follow its referenced
contracts. For instruction, skill, or hook maintenance, explicitly read this
document and the agent guide; read the testing contract when changing tests.
These fallback reads do not depend on automatic hook or skill discovery.

## Verification

Run `node --test .claude/hooks/context.test.mjs` after changing routing, output,
or session behavior. Tests copy the hook and contracts into temporary projects
using `CLAUDE_PROJECT_DIR`; they do not mutate live documents or canaries.
Apply [the repository verification contract](agent-guide.md#verification) for the
other checks required by the change.

Passing subprocess tests establishes the hook's behavior, not whether a client
loads project settings or includes the emitted context. Verify discovery and
real-session loading separately, following [context review](agent-context-audit.md).
If a client cannot run a probe, record that gap and keep the manual fallback.
Do not change credentials, permissions, or plugins merely to make the probe pass.
