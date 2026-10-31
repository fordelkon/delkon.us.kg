---
title: "Note 标题（最长 60 字符）"
publishDate: "2026-10-16T12:00:00Z"
description: "可选；仅作为详情页的 meta description，列表一律展示正文开头。"
---

<!--
Note template — copy this file into content/notes/<slug>.md, fill it in, and
remove this tutorial comment and all unused examples before publishing.

Keep this master template outside the published collections. The loader in
src/content.config.ts reads content/notes/**/*.{md,mdx}, so this file is not
validated as a published note.

The filename (minus .md) becomes the URL slug after astro's slugification
(lowercased, punctuation stripped, spaces -> hyphens).

Frontmatter schema (see src/content.config.ts, "note" collection):
- title:        required, max 60 chars
- publishDate:  required, must be ISO 8601 with a UTC offset
                (e.g. "2026-10-02T14:05:00Z" or "2026-10-02T14:05:00+08:00")
- description:  optional; NOT used in list previews — the notes list and the
                homepage always render the beginning of the body instead
                (line-clamped). It only becomes the note detail page's meta
                description, with a date-based fallback when omitted.

Shared editorial policy: docs/writing.md. For shared Markdown details, use
TEMPLATE-post.md; the examples below demonstrate the same conventions.

Unlike posts, notes have no tags, draft, coverImage, ogImage, pinned or
updatedDate fields — a note is either published or deleted. Notes are also not
in the main RSS feed; they have their own feed at /notes/rss.xml.
-->

正文从这里开始。Note 适合聚焦的 TIL / 解题记录，按内容需要使用标题；列表预览按正文开头截断，所以第一段要先说重点。

行内格式：`code`、**加粗**、_斜体_、~~删除线~~、[链接](https://astro.build)。

- 列表项
- [x] 任务列表项

> 引用块。

| 表头一 | 表头二 |
| ------ | ------ |
| 单元格 | 单元格 |

## Mathematics

Use the [shared math syntax and troubleshooting guidance](TEMPLATE-post.md#mathematics). The examples below show inline math, display delimiters on separate lines, and cardinality notation that preserves table cells.

行内公式：$O(n \log n)$。金额写成 \$50；代码中的 `$` 保持原样。

$$
E = mc^2
$$

| 含义       | 公式                 |
| ---------- | -------------------- |
| 字符集大小 | $\lvert\Sigma\rvert$ |

```ts
// 代码块，由 Expressive Code 高亮
const example = "hello";
```

:::note
admonition 容器，支持 note / tip / important / caution / warning。
:::

::github{repo="withastro/astro"}

## References

Footnote placement and source annotations follow [the shared example](TEMPLATE-post.md#references).

带脚注的句子[^1]。

[^1]: [来源标题](https://example.com)——说明该来源支持正文中的哪个论点。

写作完成后，删除顶部教程注释和不用的示例，检查日期，然后运行 `pnpm build`。Notes 没有草稿开关，放入集合后会参与发布。
