---
title: "Untangling My Markdown Rendering Pipeline"
description: "How a blog post travels from a raw .md file to rendered HTML, and where each remark and rehype plugin earns its keep."
publishDate: "12 Mar 2026"
tags: ["markdown", "astro", "tooling"]
pinned: true
---

_Editor's note: this is an example placeholder article for layout preview. The "pipeline" described here is a plausible illustrative setup, not a record of this site's actual configuration._

Every post on a site like this starts life as a plain Markdown file and ends up as static HTML. Between those two points sits a pipeline that blog authors tend to rearrange more times than they would like to admit. This example post walks through how such a pipeline is usually put together, and why.

## The shape of the pipeline

Astro hands Markdown to the unified ecosystem, where text flows through two kinds of plugins:

- **Remark plugins** operate on the abstract syntax tree as Markdown: headings, lists, footnotes, and so on.
- **Rehype plugins** operate on the tree as HTML: elements, attributes, class names.

Order matters. A remark plugin that adds directives runs before anything that expects HTML, and a syntax highlighter should run late, after every transformation that could touch code blocks.

## A small but useful plugin

The first plugin I reach for on every site is one that adds heading anchors. The whole implementation is a rehype visitor:

```ts
import rehypeSlug from "rehype-slug";

export default {
	markdown: {
		rehypePlugins: [rehypeSlug],
	},
};
```

With `rehype-slug` in place, every heading receives a stable `id`, which makes deep links and table-of-contents generation possible without any client-side JavaScript.

> The rule I follow: if a transformation can be done at build time, it never gets shipped to the browser. Static-first means the reader's device does no work the build machine could have done once.

## Plugins worth their weight

After a year of adding and removing, this is roughly what survived:

| Plugin | Layer | What it does |
| --- | --- | --- |
| `remark-gfm` | remark | Tables, strikethrough, task lists |
| `rehype-slug` | rehype | Heading anchors for deep links |
| `rehype-autolink-headings` | rehype | Adds links next to headings |
| Shiki | build | Syntax highlighting at build time |

The table is short on purpose. Every plugin is a dependency, a potential ordering bug, and a future upgrade migration, so each one has to justify itself.

## Debugging when something looks wrong

When rendered output surprises me, I dump the intermediate tree instead of guessing:

1. Reproduce with the smallest possible Markdown snippet.
2. Comment out plugins one at a time, rebuilding between each.
3. Print the tree after the suspect stage to see whether the input or the plugin is at fault.

More often than not the problem is plugin order — a highlighter running before a plugin that rewrites code fences, or an HTML-level plugin added to the remark list where it silently does nothing.

The pipeline is boring now, which is exactly how a pipeline should feel.
