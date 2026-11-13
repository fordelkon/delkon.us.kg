# Writing Conventions

Read this document before writing or changing posts, notes, or tags. It defines the shared editorial policy. Templates apply that policy through field guidance, syntax, and copyable examples; they do not define separate rules.

- [Post template](../content/TEMPLATE-post.md): article frontmatter, tag conventions, and shared Markdown examples.
- [Note template](../content/TEMPLATE-note.md): note frontmatter and a shorter set of examples.
- [Content schemas](../src/content.config.ts): executable field requirements and validation. If a template disagrees with the schema, correct the template.
- [Verification](../AGENTS.md#verification): required checks before publishing changes.

## Choosing a Format

Use a post for a developed article and a note for a focused observation or solution. Let the subject determine the length and headings. Keep template guidance and unused examples out of published content.

## Tags

A tag is a reusable category that aggregates posts and notes for retrieval, not a label describing one post. The slug is the tag's identity everywhere: entry frontmatter, URLs, and tag definition files.

- Choose reusable topic or language tags that help retrieval; do not add tags to meet a quota. Use singular names and lowercase ASCII slugs with hyphens; see the [post template](../content/TEMPLATE-post.md) for examples.
- Reuse an existing tag whenever the overlap is real; a synonym tag (`js` beside `javascript`, `并发` beside `concurrency`) splits one topic's retrieval across two pages.
- Put a post's unique angle in its title or description instead of the tags: a one-off tag that no future post would reuse cannot aggregate anything.
- Retire a tag by removing it from every post and note and deleting its definition file; a tag left with no published entry generates no page in production.

## Series

- Use a series for an ordered tutorial or a curated topic collection. Posts and notes can belong to the same series; tags remain independent retrieval facets.
- Series members also appear in chronological home-page and archive listings. Membership never removes an entry from those flows or from pinning.
- Definitions may declare `tags` for links to topic pages and an `order` of qualified member keys (`post/concurrency/example` or `note/concurrency/example`). Listed members come first; unlisted members use oldest-first publication order. Duplicate or unknown order keys fail the build, including references to absent local files. Do not reference unpublished local-only files in committed definitions.
- Topic collections may declare `sections` with a `tag` and `title`. Entries belong to the first matching section, appear once, and unmatched entries remain in a final section. Previous/next navigation stays within the current section. Tutorials without sections navigate the complete sequence.
- Follow the [series setup instructions](../content/TEMPLATE-post.md#series). Membership and ordering are owned by [series selection](../src/data/series.ts). Preserve existing file locations and URLs when changing the reading order.
- Tag definitions may declare `group` (`topic`, `concept`, or `language`) and an optional numeric `featured` rank for the compact archive topic navigation. Use English technical terms for tag titles (for example, `binary-tree` and `dynamic-programming`) and canonical language names (`C++`, `Python`, `Rust`, `Go`). Display names come from tag titles; URLs and Pagefind filter values retain their slugs. Unknown tags still appear under concepts using their slug.

## Titles, Descriptions, and Slugs

- Write a description that stands alone in RSS, archive previews, and meta tags: state what the post covers, not what it is about to do.
- Name the post after its topic: the slug identifies the subject, not the date.

## Emphasis

- The theme renders strong text with a highlighter band, so every bold is visually loud: reserve bold for term definitions and genuine key claims.
- Keep the English gloss outside the bold Chinese term. Follow the [emphasis examples](../content/TEMPLATE-post.md#emphasis-and-cross-references) to avoid ambiguous Markdown boundaries.

## Cross-references

- Link every titled mention of a sibling post; a mention rendered as plain text reads like a dead end. Ordinal mentions ("第二篇讲了…") stay plain text.
- Link important conceptual dependencies at the point of use: a reused definition, a prerequisite for the argument, or a mechanism applied in a new setting. Review the body as well as series navigation; an ordinal mention can stay plain while the concept beside it carries the link.
- Give each concept a primary explanatory home and link to the relevant section, using the concept or explanatory phrase as link text. Include forward references where an explanation is deliberately deferred, and confirm the target fulfills that promise.
- Keep the local argument understandable with a short reminder; let the link provide depth. Connect related mechanisms while preserving differences in their guarantees, APIs, and abstraction levels.
- Link at the first substantive use in a discussion; repeat when a later section creates a distinct need to revisit the explanation. Verify fragments against generated heading IDs after a build, including inbound links when headings change.

## References and footnotes

- Cite sources with footnotes at the claims they support, and annotate which claims each source backs. Follow the [footnote example](../content/TEMPLATE-post.md#references) for marker placement and the generated reference section.
- Match each source to the claim’s language, API, version, and scope. A source showing one version’s behavior does not establish when that behavior began; cross-language comparisons need evidence for each language.
- Reuse the same marker label when one source supports several passages; each citation site still gets its own back-reference.
- Entries with no natural citation site in the body (general further reading, course schedules, convenience tools) go into a hand-written further-reading section instead.

## Mathematics

For mathematical notation and formulas, read [mathematics](../.agents/skills/site-writing/references/math.md).

## Code Examples

- Keep examples that demonstrate interleaving, timing, or lifecycle (races, deadlock, async wakeups) as complete, runnable programs; pure API-semantics examples work as function-level snippets.
- Pick the language — C++, Rust, Go, or Python on this site — that carries the concept most clearly, instead of forcing one language across the series; when an example switches languages, the text states why.
- Show a fix or refactor as a focused diff instead of re-pasting the whole file. Keep enough context to understand the change, and put a short explanation of the reason directly above it. Use the [code examples](../content/TEMPLATE-post.md#code-examples) for fence syntax and highlighting options.

## Algorithm Articles

Before writing or reviewing [`content/posts/algorithm/`](../content/posts/algorithm/), read [algorithm conventions](../.agents/skills/site-writing/references/algorithms.md).

## Sources

These sources inform the tag policy above. Site-specific behavior is linked to its owning source or template.

- WordPress.com — [Categories vs. Tags](https://wordpress.com/support/posts/categories-vs-tags/) and [WordPress Learn: Categories vs. Tags](https://learn.wordpress.org/tutorial/categories-vs-tags-whats-the-difference/): the division of labor between broad sections and per-post topic tags.
- Yoast SEO Academy — [Category SEO course](https://academy.yoast.com/app/uploads/sites/4/2021/07/5_3_category_seo_ecommerce_seo_course.pdf) (PDF): per-post count discipline, singular tag forms, and the SEO cost of tag sprawl.
- Meituan engineering blog — [tag index](https://tech.meituan.com/tags.html): a tag page working as retrieval aggregation, the quality bar every tag page here is held to.
