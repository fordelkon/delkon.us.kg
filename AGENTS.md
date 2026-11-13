# Repository Instructions

## Working agreement

- Use Chinese for conversation and English for code, comments, technical documentation, and commit messages. Follow the requested language and existing site conventions for blog content and UI copy.
- Inspection requests authorize reporting. Change requests authorize the complete fix, direct dependents, and relevant verification within scope. Preserve unrelated user changes.
- Inspect relevant source before asking questions. Ask when a material ambiguity, missing access, scope expansion, or high-impact action remains unresolved; continue authorized work that does not depend on the answer.
- State the intended outcome, material assumptions, and evidence needed to establish completion.

## Architecture and files

- Fix a limitation in its owning module and update affected consumers. Discuss changes that exceed the authorized contract or require architectural restructuring.
- Keep commits focused and independently reviewable. Follow the conventional commit format and scope conventions established by repository history.

## Verification

Before handing off changes, apply [the verification contract](docs/agent-guide.md#verification), including the vendored-source boundary when formatting or linting. Report resulting behavior, command outcomes, and unresolved checks; distinguish introduced failures from confirmed pre-existing failures with actionable diagnostics. Partial checks do not establish aggregate success.

## Task context

- Task planning and execution: [working method](docs/agent-guide.md#working-method).
- Source or configuration changes: [agent guide](docs/agent-guide.md).
- UI behavior or layout changes: [UI verification](.agents/skills/site-engineering/references/ui-verification.md).
- Routes, visibility, feeds, search, canonical URLs, or social metadata: [production output](.agents/skills/site-engineering/references/production-output.md).
- Writing, changing, reviewing, or deleting tests: [testing principles](docs/testing.md).
- Posts, notes, or tags: [writing conventions](docs/writing.md).
- Documentation or user-facing errors: [documentation contract](.agents/skills/site-engineering/references/documentation.md).
- Starting or managing the development server: [background server commands](docs/agent-guide.md#development).
- Locating source owners or consulting Astro guidance: [source map and Astro references](docs/agent-references.md).
- Maintaining agent instructions, skills, or context hooks: [context loading](docs/agent-context-loading.md).

When project hooks are enabled, Claude Code can load matching context through [.claude/hooks/context.mjs](.claude/hooks/context.mjs). Other clients use the task links above; documents in `docs/` do not load merely because they exist.
