# Writing Conventions

Read this document before writing or changing posts, notes, or tags. It defines the shared editorial policy. Templates apply that policy through field guidance, syntax, and copyable examples; they do not define separate rules.

- [Post template](../content/TEMPLATE-post.md): article frontmatter, tag conventions, and shared Markdown examples.
- [Note template](../content/TEMPLATE-note.md): note frontmatter and a shorter set of examples.
- [Content schemas](../src/content.config.ts): executable field requirements and validation. If a template disagrees with the schema, correct the template.
- [Verification](../AGENTS.md#verification): required checks before publishing changes.

## Choosing a Format

Use a post for a developed article and a note for a focused observation or solution. Let the subject determine the length and headings. Keep template guidance and unused examples out of published content.

## Tags

A tag is a reusable category that aggregates posts for retrieval, not a label describing one post. The slug is the tag's identity everywhere: post frontmatter, URLs, and tag definition files.

- Give each post 3–4 reusable topic or language tags. Use singular names and lowercase ASCII slugs with hyphens; see the [post template](../content/TEMPLATE-post.md) for examples.
- Reuse an existing tag whenever the overlap is real; a synonym tag (`js` beside `javascript`, `并发` beside `concurrency`) splits one topic's retrieval across two pages.
- Put a post's unique angle in its title or description instead of the tags: a one-off tag that no future post would reuse cannot aggregate anything.
- Retire a tag by removing it from every post and deleting its definition file; a tag left with no published post generates no page in production.

## Series

- Use a series for entries that form a reading sequence; tags group entries by topic. Posts and notes can belong to the same series.
- Members read from oldest to newest by publication date. Keep the sequence understandable through explicit conceptual links, not only previous/next navigation.
- Series members appear through their series folder rather than as standalone archive or home-page entries. Follow the [series setup instructions](../content/TEMPLATE-post.md#series) when adding members. Membership and ordering are owned by [series selection](../src/data/series.ts) and [entry ordering](../src/data/ordering.ts).

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

Choose notation by what the passage explains: a mathematical relationship, a piece of code, or an ordinary quantity. A number or variable name alone does not require a formula.

- Use math for complexity bounds in prose and tables, equations, recurrences, sums, products, factorials, powers, mathematical intervals, and constraints used in an argument. Keep the notation consistent throughout that argument, including its variable definitions.
- Keep ordinary counts, dates, durations, measurements, percentages, problem numbers, versions, and numeric examples in prose. A quantity belongs in math when it participates in a formula or bound; “26 letters” can stay prose while a character-set cardinality belongs in math.
- Use inline code for identifiers, types, API calls, literal input/output, language operators, and expressions quoted from an implementation. Preserve code blocks. A mathematical nonnegative-input constraint uses an inequality; an explanation of `if (n >= 0)` keeps the exact code. Likewise, a recurrence uses math while a call such as `fibonacci(n - 1)` remains code.
- Use inline math for short expressions within a sentence or table cell. Use display math for a central equation, a derivation, or an expression that needs its own line. Keep a formula inside a sentence when a separate block would interrupt the explanation. Keep titles and frontmatter readable as plain text; do not add formula markup merely to style a number.
- Define each mathematical symbol when first introduced, state its domain or bounds when relevant, and explain its connection to code when names differ. Formatting must preserve the original meaning: distinguish equality from an upper bound and retain conditions such as average-case versus worst-case complexity.

Verify formulas in the production build before publishing, including table structure and long expressions at narrow widths. Follow the [post math examples](../content/TEMPLATE-post.md#mathematics) or [note math examples](../content/TEMPLATE-note.md#mathematics) for delimiter syntax, escaping, and table handling.

## Code Examples

- Keep examples that demonstrate interleaving, timing, or lifecycle (races, deadlock, async wakeups) as complete, runnable programs; pure API-semantics examples work as function-level snippets.
- Pick the language — C++, Rust, Go, or Python on this site — that carries the concept most clearly, instead of forcing one language across the series; when an example switches languages, the text states why.
- Show a fix or refactor as a focused diff instead of re-pasting the whole file. Keep enough context to understand the change, and put a short explanation of the reason directly above it. Use the [code examples](../content/TEMPLATE-post.md#code-examples) for fence syntax and highlighting options.

## Sources

These sources inform the tag policy above. Site-specific behavior is linked to its owning source or template.

- WordPress.com — [Categories vs. Tags](https://wordpress.com/support/posts/categories-vs-tags/) and [WordPress Learn: Categories vs. Tags](https://learn.wordpress.org/tutorial/categories-vs-tags-whats-the-difference/): the division of labor between broad sections and per-post topic tags.
- Yoast SEO Academy — [Category SEO course](https://academy.yoast.com/app/uploads/sites/4/2021/07/5_3_category_seo_ecommerce_seo_course.pdf) (PDF): per-post count discipline, singular tag forms, and the SEO cost of tag sprawl.
- Meituan engineering blog — [tag index](https://tech.meituan.com/tags.html): a tag page working as retrieval aggregation, the quality bar every tag page here is held to.
