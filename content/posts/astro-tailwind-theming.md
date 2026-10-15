---
title: "Theming a Static Blog with Astro and Tailwind"
description: "A pragmatic approach to light and dark themes: design tokens, one CSS variable layer, and almost no JavaScript."
publishDate: "28 May 2026"
updatedDate: 3 Oct 2026
tags: ["css", "astro"]
---

Most blog theming problems are really token problems. Once colors, spacing, and type sizes live behind a stable layer of CSS variables, light mode, dark mode, and future redesigns all become one-file changes. This example post describes a common pragmatic setup.

_Editor's note: this is an example placeholder article for layout preview; the setup described is illustrative rather than a record of this site's actual styles._

## One layer of variables

The whole theme hangs on a small set of custom properties defined at the root, with a dark-mode override in a single media query:

```css
:root {
	--color-bg: oklch(98% 0 0);
	--color-text: oklch(18% 0 0);
	--color-accent: oklch(58% 0.16 250);
}

@media (prefers-color-scheme: dark) {
	:root {
		--color-bg: oklch(20% 0 0);
		--color-text: oklch(92% 0 0);
	}
}
```

Components never mention concrete colors. They read `var(--color-text)` and friends, which means the theme switcher below only has to change variables, not hunt down hardcoded hex values.

## Switching themes without a framework

Tailwind's `dark:` variant can be driven by a class instead of the media query, which lets a small inline script run before first paint:

```html
<script>
	const stored = localStorage.getItem("theme");
	const dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
	document.documentElement.classList.toggle("dark", dark);
</script>
```

Because the script is inline and synchronous, it runs before first paint and avoids the usual flash of the wrong theme. The toggle button itself writes to `localStorage` and flips the same class — that is the entire runtime cost.

## Where the discipline pays off

- **Dark mode is a diff, not a rewrite.** Overriding six variables is cheaper than auditing every component for stray colors.
- **Contrast is testable.** With `oklch()`, nudging lightness is predictable; keeping body text above WCAG AA in both themes is a matter of checking lightness values rather than re-deriving palettes.
- **Redesigns stay local.** Changing the accent color or type ramp touches one file, and every page follows.

> The best measure of a theming setup is how few files a "small tweak" touches. If a color change spans five components, the token layer is not doing its job.

## Choosing semantic tokens

Naming tokens by purpose keeps component styles readable. These examples distinguish page surfaces from text and interactive controls:

| Token | Purpose | Check in both themes |
| --- | --- | --- |
| `--color-bg` | Page surface | Separation from raised surfaces |
| `--color-text` | Reading text | Contrast against its background |
| `--color-accent` | Links and controls | Contrast and recognizable focus states |

## What I would do differently

If I started today, I would define the type scale with `clamp()` from the beginning instead of retrofitting fluid sizes later, and I would resist adding more than two font families no matter how tempting a display face looks in a specimen sheet. Theming is mostly an exercise in restraint, and the CSS variable layer is just the mechanism that makes restraint enforceable.
