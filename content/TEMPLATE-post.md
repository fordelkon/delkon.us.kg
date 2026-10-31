---
title: "文章标题（最长 60 字符）"
description: "一两句话的文章描述，会用在 /posts/ 列表预览、RSS 和元数据里。"
publishDate: "1 Jan 2026"
tags: ["python", "algorithm", "data-structure"]
pinned: false
draft: true
# ---- 可选字段，不用就保持注释或整行删除 ----
# slug: "custom-slug"          # 覆盖由文件名派生的 URL slug
# updatedDate: "1 Feb 2026"    # 显示为 publishDate 旁的 "Updated" 徽标，并用于元数据
# ogImage: "./og.png"          # 显式社交卡片图；缺省时自动生成 /og-image/<slug>.png
# coverImage:                  # 正文顶部 hero 图（astro:assets），与 og:image 无关
#   alt: "封面图描述"
#   src: "./cover.png"         # 相对本文件的路径，取消注释后必须是真实存在的图片
---

<!--
Post template — copy this file into content/posts/<slug>.md, fill it in, and
remove this tutorial comment and all unused examples before publishing.

Keep this master template outside the published collections. The loader in
src/content.config.ts reads content/posts/**/*.{md,mdx}, so this file is not
validated as a published post.

The filename (minus .md) becomes the URL slug after astro's slugification
(lowercased, punctuation stripped, spaces -> hyphens); a frontmatter `slug:`
field can override it.

Frontmatter schema (see src/content.config.ts):
- title:        required, max 60 chars
- description:  required; used for meta description, og:description, RSS and
                the /posts/ archive previews (homepage and tag-page lists do
                not render it)
- publishDate:  required, any date string; NOT validated — an unparseable
                value silently becomes Invalid Date, so double-check it
- tags:         optional, array of strings, deduplicated and lowercased
- pinned:       optional, default false; shows post in the homepage pinned
                section (max 3, MAX_PINNED_POSTS in src/data/post.ts) and on
                the /posts/ archive pages
- draft:        optional, default false; drafts render in dev with a red
                "(Draft)" label, but in production are excluded from pages,
                RSS and the OG-image routes
- coverImage:   optional, { alt, src } where src is an image path relative to
                the file; renders as the in-post hero only — it does NOT feed
                og:image
- ogImage:      optional, string path used for social card metadata; if
                omitted, a 1200x630 OG image is auto-generated from the title
                and updatedDate/publishDate at /og-image/<slug>.png — setting
                ogImage replaces that generated image entirely
- updatedDate:  optional; rendered alongside publishDate as an "Updated"
                badge, and used instead of publishDate for
                article:published_time and the OG image date

Editorial policy: docs/writing.md. Use the field guidance above and syntax
examples below to apply it. Tag examples include `python`, `database`, and
`machine-learning`; check content/tags/ and existing post tags before adding one.
Filename slugs use kebab-case naming the topic, such as
`concurrency-task-scheduling-collaboration`, rather than a date.
-->

## Series

For a series member, copy this template into `content/posts/<series>/<slug>.md` (or the note template into `content/notes/<series>/<slug>.md`). Add `content/series/<series>.md` with optional `title` and `description` frontmatter; its body introduces the series. A directory without a definition remains ordinary content, and an empty series is not listed. Preserve the `<series>/` prefix when overriding a member's slug. Posts and notes with the same top-level directory share a series.

## Emphasis and Cross-references

Write bilingual terms as **中文**（English）, with the gloss outside the bold span. Putting fullwidth punctuation at the end of a bold span before more CJK text can prevent CommonMark from recognizing it. Link titled references to sibling entries, for example [《文章标题》](/posts/example/); an ordinal mention such as “第二篇” can stay plain text.

正文从这里开始。行内格式：`code`、**加粗**、_斜体_、~~删除线~~、[链接](https://astro.build)（外部链接自动加 `target="_blank"` 和 `rel="noreferrer"`）。

## 二级标题

标题自动生成锚点 id 并带 autolink，是生成 TOC 的基础。

### 三级标题

段落文本。

- 列表项
- 列表项
  - 嵌套列表项

1. 有序列表项
2. 有序列表项

- [ ] 未完成任务
- [x] 已完成任务

> 引用块。

| 表头一 | 表头二 |
| ------ | ------ |
| 单元格 | 单元格 |

## Mathematics

Use `$...$` for inline math. Put each `$$` delimiter on its own line for display math. In tables, use `\lvert` and `\rvert` instead of bare `|` characters, which split cells. Escape currency dollar signs as `\$` outside code spans and code blocks.

KaTeX typesets formulas at build time; unsupported or invalid TeX fails the build. Correct the reported formula and rerun `pnpm build`. The site provides formula styles and fonts, and display formulas support horizontal scrolling and keyboard focus.

行内公式：$O(n \log n)$。金额写成 \$50；代码中的 `$` 保持原样。

$$
E = mc^2
$$

| 含义       | 公式                 |
| ---------- | -------------------- |
| 字符集大小 | $\lvert\Sigma\rvert$ |

## Code Examples

````ts
// 代码块，由 Expressive Code 高亮；fence 后可加 meta：
// ```ts title="文件名" ins={2} del={3} frame="terminal"
const example = "hello";
````

```diff lang="ts" title="改动前后"
// diff 围栏：lang 属性写真实语言以保留语法高亮，+/- 前缀标记增删行，
// title 提供文件名页签；直接粘贴 git diff 输出也可（---/+++/@@ 元数据不受破坏）。
// 对改动的解释紧贴改动行上方写短注释，别夹在增删行中间或堆在围栏开头
- const old = "before";
+ const next = "after";
```

:::note
admonition 容器，支持 note / tip / important / caution / warning 五种类型。
:::

:::tip[自定义标题]
方括号可覆盖默认标题。
:::

::github{repo="withastro/astro"}

GitHub 仓库卡片（leaf 指令，**两个冒号**）：`repo`（owner/name）或 `user` 属性，仓库地址 URL 也可直接传入。注意 `:github` 单冒号是行内 text 指令，独立成段会被还原成纯文本，不渲染卡片。

![正文图片的 alt 文本](./example.png)

独占一段的图片会被 unwrap 出段落单独排版（coverImage 是 frontmatter 字段，与此无关）。

## References

Place the footnote marker immediately before the sentence's closing punctuation. Annotate the source with the claim it supports. The pipeline supplies the reference heading and backlinks; do not add a manual `## 参考文献` heading. Put uncited further reading in a separate `## 延伸阅读` list.

带脚注的句子[^1]。

[^1]: [来源标题](https://example.com)——说明该来源支持正文中的哪个论点。

---

分隔线。

写作完成后记得：删掉文件顶部的 HTML 注释块，把 `draft` 改为 `false`（或删除该字段），删除不需要的示例段落，然后运行 `pnpm build` 验证。
