# Repository Instructions

## Working Agreement

- Use Chinese for conversation and English for code, comments, technical documentation, and commit messages. Follow the requested language and existing site conventions for blog content and UI copy.
- Inspection requests authorize reporting. Change requests authorize the complete fix, direct dependents, and relevant verification within scope. Preserve unrelated user changes.
- Inspect relevant source before asking questions. Ask when a material ambiguity, missing access, scope expansion, or high-impact action remains unresolved; continue authorized work that does not depend on the answer.

## Task Workflow

1. **Read context**: Read the repository README and any README in the target directory or its parents. Follow the task-specific references below. Verify paths and commands against source and configuration when documentation disagrees with them.
2. **Define done**: Identify the intended outcome and state material assumptions and acceptance criteria. For multi-step tasks, give a brief plan with a verification check for each step.
3. **Implement**: Make the smallest complete change that meets the acceptance criteria. Match local conventions and reuse existing capabilities. Remove code made obsolete by the task; keep additional features and architectural changes within the authorized scope.
4. **Verify**: Run focused checks during iteration, inspect failures, fix their causes, and rerun the affected checks. Apply the completion requirements under Verification before handing off.
5. **Report**: Explain the resulting behavior, checks performed, and remaining gaps. Prefer fixing reusable failures at the owning boundary or enforcing constraints with tooling; add agent instructions for stable conventions that tooling cannot express.

## Architecture and Ownership

- Preserve Astro's static-first architecture. Add browser JavaScript or framework integrations when required by the requested interaction.
- Keep route composition in pages, shared page structure in layouts, and reusable presentation in components. Keep content schemas, content selection, Markdown transformations, and site configuration with their existing owners.
- Fix a limitation in its owning module and update affected consumers. Discuss changes that exceed the authorized contract or require architectural restructuring.
- Keep browser code separate from build-time or server-only code. Validate external data at its entry point and keep secrets in server-only environment configuration.
- When changing a shared contract, trace all affected consumers, including generated pages, feeds, search, and metadata, and update those reached by the change.

## Verification

Use pnpm and treat `package.json` scripts as the executable source of truth.

- Before completing code or configuration changes, run `pnpm check` and `pnpm build`. Confirm the build's Pagefind postbuild step succeeds when search is affected.
- If `pnpm check` stops before reaching anti-slop, run `pnpm lint:anti-slop` separately. Run any other skipped verification stages independently so an earlier failure does not hide their results. Separate checks provide partial evidence; they do not make the failed aggregate check pass.
- For content changes, run `pnpm build` to validate collection schemas and generated routes. For instruction-only or documentation-only changes, check changed statements against their sources, verify referenced paths and links, and run `git diff --check`.
- Use existing formatter and lint tooling on changed files. Review autofix changes for scope and preserve unrelated user work. Before running repository-wide write commands, check their scope against the vendored-source boundary below.
- For logic changes, use relevant existing tests; when introducing test tooling, tie it to the behavior that needs verification and state what it covers. Inspect available scripts before naming a test command.
- Report failed commands and unresolved required checks explicitly. Distinguish failures introduced by the change from confirmed pre-existing failures, with file paths and diagnostics. Claim only what the verification establishes, and keep output concise while retaining actionable failure evidence.

### Lint and Vendored Sources

- Biome owns general lint and formatting; anti-slop adds the rules configured in [.oxlintrc.json](.oxlintrc.json). Keep Astro checks for framework and template diagnostics; anti-slop's script checks do not cover Astro templates.
- Preserve the pinned source under `tools/oxlint/anti-slop/` according to [its provenance and update procedure](tools/oxlint/anti-slop/UPSTREAM.md). Apply application autofixes to explicit application paths. When Biome includes the vendored tree, use read-only checks to report its diagnostics and targeted write commands for authored files.
- Fix application violations in their owning source. Treat changes to rule configuration or vendor scan exclusions as tooling changes with an explicit rationale; preserve the upstream source when resolving lint-tool integration issues.

### UI and Generated Output

- For UI behavior or layout changes, inspect the affected flow in the running site. Verify relevant interactions and states, including keyboard focus, responsive sizing, light and dark themes, scrolling, and reduced motion when animation changes.
- Check runtime errors. When browser inspection is unavailable, disclose the gap; static checks alone establish neither visual nor interaction correctness.
- Inspect affected production output when changing routes, content visibility, feeds, search, canonical URLs, or social metadata. Confirm intended entries are present and excluded entries remain excluded. Verify Pagefind search against a production build.

## Change Conventions

### Copy and Documentation

- Keep one canonical home per fact and link to it. Use source schemas, scripts, and configuration for current values; document stable contracts, rationale, procedures, and non-obvious constraints.
- Keep READMEs focused on orientation and entry points. Place detailed task-specific guidance in corresponding documents, with explicit conditions for reading them.
- After behavior changes, update affected copy, errors, documentation, agent instructions, and metadata to describe the final behavior.
- User-visible errors explain what happened and what the user can do next. Support comparative claims such as "faster" or "recommended" with project evidence.
- Comments explain rationale, invariants, safety constraints, or external quirks. Public API documentation describes observable contracts.

### Files and Commits

- Regenerate output such as `dist/` and `.astro/` through project tooling. Distinguish authored assets from generated files before editing.
- Keep commits focused and independently reviewable. Follow the conventional commit format and scope conventions established by repository history.

## Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Task-specific References

Read the relevant local sources before editing:

- **Tests**: Before writing, changing, reviewing, or deleting tests, read [docs/testing.md](docs/testing.md) for test value, boundary ownership, deterministic dependencies, regression evidence, and coverage standards.
- **Writing conventions**: Before writing or changing posts, notes, or tags, read [docs/writing.md](docs/writing.md) for tag naming and reuse rules, tag definition files, and post/note slug and title conventions.
- **Content or frontmatter**: [src/content.config.ts](src/content.config.ts) for collection loaders and schemas; [src/data/post.ts](src/data/post.ts) for post selection and ordering.
- **Site identity, navigation, dates, or code themes**: [src/site.config.ts](src/site.config.ts) for shared configuration; trace affected rendering and metadata consumers.
- **Styling or themes**: [src/styles/global.css](src/styles/global.css) and the affected component styles for existing tokens and theme behavior.
- **Markdown transformations**: [astro.config.ts](astro.config.ts) for processor registration and ordering; read the affected implementation in `src/plugins/`.
- **Build or deployment**: [package.json](package.json), [astro.config.ts](astro.config.ts), [wrangler.jsonc](wrangler.jsonc), and [.github/workflows/ci.yml](.github/workflows/ci.yml) for the build, deployment target, and CI checks.

Consult the corresponding Astro guide before working on these tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

Full documentation: https://docs.astro.build
