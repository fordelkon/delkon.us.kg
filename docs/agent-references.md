## Source map

- **Tests**: Before writing, changing, reviewing, or deleting tests, read [docs/testing.md](testing.md) for test value, boundary ownership, deterministic dependencies, regression evidence, and coverage standards.
- **Writing conventions**: Before writing or changing posts, notes, or tags, read [docs/writing.md](writing.md) for tag naming and reuse rules, tag definition files, and post/note slug and title conventions.
- **Content or frontmatter**: [src/content.config.ts](../src/content.config.ts) for collection loaders and schemas; [src/data/post.ts](../src/data/post.ts) for post selection and ordering.
- **Site identity, navigation, dates, or code themes**: [src/site.config.ts](../src/site.config.ts) for shared configuration; trace affected rendering and metadata consumers.
- **Styling or themes**: [src/styles/global.css](../src/styles/global.css) and the affected component styles for existing tokens and theme behavior.
- **Markdown transformations**: [astro.config.ts](../astro.config.ts) for processor registration and ordering; read the affected implementation in `src/plugins/`.
- **Build or deployment**: [package.json](../package.json), [astro.config.ts](../astro.config.ts), [wrangler.jsonc](../wrangler.jsonc), and [.github/workflows/ci.yml](../.github/workflows/ci.yml) for the build, deployment target, and CI checks.

## Astro references

Consult the corresponding Astro guide before working on these tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

Full documentation: https://docs.astro.build
