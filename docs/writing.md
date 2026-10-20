# Writing Conventions

Read this document before writing or changing posts, notes, or tags. It records the high-level conventions this site applies to its content; the concrete rules — exact formats, counts, and syntax — live in [TEMPLATE-post.md](../content/TEMPLATE-post.md), next to the frontmatter and examples they annotate. The research behind each rule is linked under Sources.

## Tags

A tag is a reusable category that aggregates posts for retrieval, not a label describing one post. The slug is the tag's identity everywhere: post frontmatter, URLs, and tag definition files.

- Give each post enough tags to place it, few enough that every tag page stays a meaningful aggregation.
- Reuse an existing tag whenever the overlap is real; a synonym tag (`js` beside `javascript`, `并发` beside `concurrency`) splits one topic's retrieval across two pages.
- Put a post's unique angle in its title or description instead of the tags: a one-off tag that no future post would reuse cannot aggregate anything.
- Retire a tag by removing it from every post and deleting its definition file; a tag left with no published post generates no page in production.

## Series

- A series groups posts or notes into a reading sequence; tags remain reusable topic filters.
- Place members under a matching top-level directory, such as `content/posts/concurrency/` or `content/notes/algorithm/`, and define that series in `content/series/<directory>.md`. Directories without a definition remain ordinary archive entries.
- Definition frontmatter supports an optional `title` and `description`; its Markdown body introduces the series on `/series/<directory>/`. Empty series generate no page.
- Members read in ascending publication-date order, with collection and ID breaking ties. Production series use the same draft filtering as posts; notes have no draft field.
- Archives and the home page collapse each series into a single folder row (date range, title, entry count, description) linking to `/series/<directory>/`; members never appear in the year or standalone flows, nor in the home page's pinned and latest sections. A series can span archive pages; its dedicated page and member navigation always include the full visible sequence.
- Post and note directories sharing a name belong to the same series. Custom slugs must retain the directory prefix to retain membership.

## Titles, Descriptions, and Slugs

- Write a description that stands alone in RSS, archive previews, and meta tags: state what the post covers, not what it is about to do.
- Name the post after its topic: the slug identifies the subject, not the date.

## Emphasis

- The theme renders strong text with a highlighter band, so every bold is visually loud: reserve bold for term definitions and genuine key claims.
- Bilingual term annotations follow a fixed format, built to survive CommonMark's right-flanking rule (the site's Rust-based markdown processor rules out the CJK-friendly plugin); use the exact form given in [TEMPLATE-post.md](../content/TEMPLATE-post.md).

## Cross-references

- Link every titled mention of a sibling post; a mention rendered as plain text reads like a dead end. Ordinal mentions ("第二篇讲了…") stay plain text.
- Link important conceptual dependencies at the point of use: a reused definition, a prerequisite for the argument, or a mechanism applied in a new setting. Review the body as well as series navigation; an ordinal mention can stay plain while the concept beside it carries the link.
- Give each concept a primary explanatory home and link to the relevant section, using the concept or explanatory phrase as link text. Include forward references where an explanation is deliberately deferred, and confirm the target fulfills that promise.
- Keep the local argument understandable with a short reminder; let the link provide depth. Connect related mechanisms while preserving differences in their guarantees, APIs, and abstraction levels.
- Link at the first substantive use in a discussion; repeat when a later section creates a distinct need to revisit the explanation. Verify fragments against generated heading IDs after a build, including inbound links when headings change.

## References and footnotes

- Cite sources with GFM footnotes: the marker sits at the claim the source supports, and the entry annotation states which claims the source backs. The markdown pipeline renders the reference section itself, one `↩` back-reference per citation site, so never hand-write that heading — exact syntax in [TEMPLATE-post.md](../content/TEMPLATE-post.md).
- Match each source to the claim’s language, API, version, and scope. A source showing one version’s behavior does not establish when that behavior began; cross-language comparisons need evidence for each language.
- Reuse the same marker label when one source supports several passages; each citation site still gets its own back-reference.
- Entries with no natural citation site in the body (general further reading, course schedules, convenience tools) go into a hand-written further-reading section instead.

## Code Examples

- Keep examples that demonstrate interleaving, timing, or lifecycle (races, deadlock, async wakeups) as complete, runnable programs; pure API-semantics examples work as function-level snippets.
- Pick the language — C++, Rust, or Go on this site — that carries the concept most clearly, instead of forcing one language across the series; when an example switches languages, the text states why.
- Show a fix or refactor as a `diff` fence with `+`/`-` line prefixes instead of re-pasting the whole file: `lang="…"` keeps syntax highlighting and `title="…"` names the file (exact syntax in [TEMPLATE-post.md](../content/TEMPLATE-post.md)). Keep context lines to what the change needs. Annotate the why as a short comment immediately above the changed line, not scattered mid-code.

## Sources

- WordPress.com — [Categories vs. Tags](https://wordpress.com/support/posts/categories-vs-tags/) and [WordPress Learn: Categories vs. Tags](https://learn.wordpress.org/tutorial/categories-vs-tags-whats-the-difference/): the division of labor between broad sections and per-post topic tags.
- Yoast SEO Academy — [Category SEO course](https://academy.yoast.com/app/uploads/sites/4/2021/07/5_3_category_seo_ecommerce_seo_course.pdf) (PDF): per-post count discipline, singular tag forms, and the SEO cost of tag sprawl.
- Meituan engineering blog — [tag index](https://tech.meituan.com/tags.html): a tag page working as retrieval aggregation, the quality bar every tag page here is held to.
