# Agent Guide

Task-specific project contracts. Load the sections relevant to the change.

## Architecture

- Preserve Astro's static-first architecture. Add browser JavaScript or framework integrations when required by the requested interaction.

- Keep browser code separate from build-time or server-only code. Validate external data at its entry point and keep secrets in server-only environment configuration.

- Keep route composition in pages, shared page structure in layouts, and reusable presentation in components. Keep content schemas, content selection, Markdown transformations, and site configuration with their existing owners.

## Shared contracts

- When changing a shared contract, trace all affected consumers, including generated pages, feeds, search, and metadata, and update those reached by the change.

## Verification

Use pnpm and treat `package.json` scripts as the executable source of truth.

- Before completing code or configuration changes, run `pnpm check` and `pnpm build`. Confirm the build's Pagefind postbuild step succeeds when search is affected.

- If `pnpm check` stops before reaching anti-slop, run `pnpm lint:anti-slop` separately. Run any other skipped verification stages independently so an earlier failure does not hide their results. Separate checks provide partial evidence; they do not make the failed aggregate check pass.

- For content changes, run `pnpm build` to validate collection schemas and generated routes. For instruction-only or documentation-only changes, check changed statements against their sources, verify referenced paths and links, and run `git diff --check`.

## Vendored sources

- Regenerate output such as `dist/` and `.astro/` through project tooling. Distinguish authored assets from generated files before editing.

- Use existing formatter and lint tooling on changed files. Review autofix changes for scope and preserve unrelated user work. Before running repository-wide write commands, check their scope against the vendored-source boundary below.

- Biome owns general lint and formatting; anti-slop adds the rules configured in [.oxlintrc.json](../.oxlintrc.json). Keep Astro checks for framework and template diagnostics; anti-slop's script checks do not cover Astro templates.

- Preserve the pinned source under `tools/oxlint/anti-slop/` according to [its provenance and update procedure](../tools/oxlint/anti-slop/UPSTREAM.md). Apply application autofixes to explicit application paths. When Biome includes the vendored tree, use read-only checks to report its diagnostics and targeted write commands for authored files.

- Fix application violations in their owning source. Treat changes to rule configuration or vendor scan exclusions as tooling changes with an explicit rationale; preserve the upstream source when resolving lint-tool integration issues.

## UI verification

For UI behavior or layout changes, read [UI verification](../.agents/skills/site-engineering/references/ui-verification.md).

## Production output

For routes, content visibility, feeds, search, canonical URLs, or social metadata, read [production output](../.agents/skills/site-engineering/references/production-output.md).

## Documentation

When changing documentation or user-facing errors, read [the documentation contract](../.agents/skills/site-engineering/references/documentation.md).

## Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Source map

When locating source owners or consulting Astro guidance, read [the source map and Astro references](agent-references.md).

## Astro references

Before Astro tasks, consult the corresponding [Astro reference](agent-references.md#astro-references).

## Working method

1. **Read context**: Read the repository README and any README in the target directory or its parents. Follow the task-specific references below. Verify paths and commands against source and configuration when documentation disagrees with them.

2. **Define done**: Identify the intended outcome and state material assumptions and acceptance criteria. For multi-step tasks, give a brief plan with a verification check for each step.

3. **Implement**: Make the smallest complete change that meets the acceptance criteria. Match local conventions and reuse existing capabilities. Remove code made obsolete by the task; keep additional features and architectural changes within the authorized scope.

4. **Verify**: Run focused checks during iteration, inspect failures, fix their causes, and rerun the affected checks. Apply the completion requirements under Verification before handing off.

5. **Report**: Explain the resulting behavior, checks performed, and remaining gaps. Prefer fixing reusable failures at the owning boundary or enforcing constraints with tooling; add agent instructions for stable conventions that tooling cannot express.

## Context loading

When maintaining agent instructions, skills, or the context hook, read [context loading](agent-context-loading.md).
