# Delkon's Blog

A static Astro blog with a thermal receipt printer interface, inspired by [nooc.me](https://nooc.me). The printer housing, feed slot, textured paper, perforated edges, and torn footer frame articles and short notes. Light and dark palettes share the same design tokens.

The project builds on [Astro Cactus](https://github.com/chrismwilliams/astro-theme-cactus). It uses Astro, Tailwind CSS, Expressive Code, Pagefind, and generated RSS and social images. Pages remain static; browser scripts handle navigation controls, theme switching, and search.

## Development

Use pnpm. The executable command definitions live in [package.json](package.json).

| Command        | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `pnpm install` | Install dependencies                             |
| `pnpm dev`     | Start the development server                     |
| `pnpm check`   | Run Astro diagnostics, Biome, and anti-slop lint |
| `pnpm build`   | Generate `dist/` and the Pagefind search index   |
| `pnpm preview` | Serve the production build locally               |

Search requires a production build. Run `pnpm build` before previewing search. Run `pnpm preview --host 127.0.0.1 --port 4321` to inspect the build locally.

## Editing the site

- [src/site.config.ts](src/site.config.ts): identity, navigation, date formatting, and code themes.
- [src/styles/global.css](src/styles/global.css): style assembly. Imports Tailwind layers, the printer palette tokens, and component stylesheets, and carries fonts, view transitions, and motion. Dark colors override the same `--color-printer-*` variables under `html[data-theme="dark"]`.
- [src/styles/tokens/printer-palette.css](src/styles/tokens/printer-palette.css): canonical light printer palette. Build-time TS consumers read the matching constants from [printer-palette.ts](src/styles/tokens/printer-palette.ts); change both together.
- [src/styles/tokens/receipt-spacing.css](src/styles/tokens/receipt-spacing.css): shared spacing for receipt headings, sections, archive groups, and listing rows. Both palettes use the same rhythm; row geometry lives in `.receipt-row` in [receipt.css](src/styles/components/receipt.css).
- [src/styles/components/printer-housing.css](src/styles/components/printer-housing.css): printer housing and paper mechanics (desk backdrop, thermal texture, paper edges, geometry tokens).
- [src/styles/components/receipt.css](src/styles/components/receipt.css): shared receipt micro-typography for labels and links.
- [src/layouts/Base.astro](src/layouts/Base.astro): shared printer shell and paper layout.
- [src/components/printed/](src/components/printed/): printer-metaphor markup — the housing and paper viewport plus receipt sections and dividers. Component filing rules: [src/components/README.md](src/components/README.md).
- [tailwind.config.ts](tailwind.config.ts): article typography.
- [src/pages/index.astro](src/pages/index.astro): profile, example projects, articles, and notes.

The paper feed and status light respect reduced-motion preferences. The printer
housing is pinned to the viewport while scrolling, so the paper appears to
retract into the feed slot as you scroll down and feed back out when you scroll
up; sticky table-of-contents offsets and anchor scroll margins clear the pinned
housing. A stationary workbench backdrop behind the rounded housing masks the
scrolling sheet, including when resizing the window or expanding the mobile menu.
The workbench texture shares a fixed viewport origin with that backdrop. The
housing has an open feed slot that exposes the same scrolling sheet, so no fixed
paper strip or shading separates from the moving text. The implementation keeps the existing theme switch; the reference
site's lamp, snail, and draggable stickers are outside this version.

## Content

Example English and Chinese writing lives in `content/posts/` and `content/notes/`. Replace it with your own writing. Both languages share the existing routes; this version does not introduce locale prefixes or translation dictionaries.

[Content collection schemas](src/content.config.ts) are the source of truth for frontmatter. [Entry selection](src/data/entries.ts) provides published and standalone listings, backed by shared [ordering](src/data/ordering.ts) and [series membership](src/data/series.ts).

- Posts: `content/posts/**/*.{md,mdx}`; required `title`, `description`, and `publishDate`. Optional tags, pinned status, draft status, cover image, update date, and custom social image.
- Notes: `content/notes/`; required `title` and an ISO 8601 `publishDate` with timezone offset, for example `2026-10-02T14:05:00Z`.
- Tags: `content/tags/`; optional title and description. Match the filename to a tag used by a post.

Pagefind indexes articles and notes through `data-pagefind-body`; tag filters use the article masthead. Feeds are available at `/rss.xml` and `/notes/rss.xml`.

## Verification and deployment

Run `pnpm check` and `pnpm build` before shipping source or configuration changes. Inspect the production preview for layout and interaction changes. See [docs/testing.md](docs/testing.md) for test guidance and [AGENTS.md](AGENTS.md) for repository conventions and vendored lint boundaries.

The deployment target is configured in [wrangler.jsonc](wrangler.jsonc). Build output is generated in `dist/`; do not edit generated pages or the Pagefind index manually. CI checks are defined in [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Credits

- [Astro Cactus](https://github.com/chrismwilliams/astro-theme-cactus) provides the original blog foundation.
- [nooc.me](https://nooc.me) provides the visual reference for the thermal printer design.
- [ascii.rest](https://ascii.rest/) provides the static language logos, Tux, and 404 artwork; its MIT notice is preserved in [public/ascii/LICENSE](public/ascii/LICENSE).

MIT license; see [LICENSE](LICENSE).
