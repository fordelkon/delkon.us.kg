# Sticker Asset Naming

Use a lowercase sticker ID followed by an explicit variant suffix in `public/stickers/`. Keep the ID stable when renaming or replacing artwork: it identifies the sticker in saved positions.

## What the browser reads

[HTML `srcset`](https://html.spec.whatwg.org/multipage/images.html#srcset-attributes) takes a URL and an optional density (`x`) or intrinsic width (`w`) descriptor. [CSS `image-set()`](https://drafts.csswg.org/css-images-4/#image-set-notation) takes a URL and a resolution separately; the specification uses `foo-2x.png` as an example, not a requirement. A suffix makes an asset easier to identify, but it never replaces the descriptor. [Chrome's responsive image guide](https://web.dev/learn/images/descriptive) distinguishes density candidates for a common display size from width candidates for images whose display size varies.

## Site convention

| Artwork          | Filename examples                                                                | Meaning of the suffix                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desk stickers    | `deepseek-1x.webp`, `deepseek-1.5x.webp`, `deepseek-2x.webp`, `deepseek-3x.webp` | Nominal density relative to the 112 × 168 px `1x` candidate. CSS `image-set()` and the WebGPU artwork's `srcset` use the same densities. The highest-density asset supplies the CSS fallback and the peel outline.   |
| Housing stickers | `chatgpt-44w.webp`, `chatgpt-64w.webp`, `chatgpt-112w.webp`                      | Intrinsic pixel width. The same image can cover different effective densities as CSS changes the displayed decal size, so a fixed `x` suffix would be misleading. CSS media queries still decide which file to load. |

Existing artwork was renamed without re-encoding. When replacing artwork, keep the same dimensions and transparency; if dimensions or the intended density change, update the filename and the matching candidate or media rule together.
