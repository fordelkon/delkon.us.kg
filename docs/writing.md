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

## Algorithm Articles

Apply these conventions when writing or reviewing [`content/posts/algorithm/`](../content/posts/algorithm/). Keep each article focused on its problem; use the following as review criteria, not mandatory headings.

- **Problem contract:** State the input assumptions and answer semantics that the method needs: ordering, duplicates, node existence, nonempty paths, or whether positions or values distinguish answers. Identify the invariant and explain initialization, progress, and termination; use a small counterexample where a tempting alternative breaks it.
- **Method and implementation:** Separate algorithm choices from language differences. Explain what each recursive return value or maintained state means, and why updates occur in that order. Comments should protect these invariants. State version requirements beside affected examples and use the existing problem interface unless an alternative contract is explicit.
- **Side effects and ownership:** Before code that changes or exposes input state, say whether it reuses, allocates, consumes, temporarily rewires, or restores objects. Distinguish an independent result from an alias. For C++ node operations, identify who owns new or detached nodes; qualify restoration and cleanup claims when early exits or allocation failures matter. State depth-dependent recursion limits where applicable.
- **Complexity:** Define the parameters and analyze the actual implementation. Separate auxiliary space from output storage, peak live space from cumulative allocation, and average, amortized, and worst-case bounds. Count copies, slices, reserved capacity, retained hash keys, and recursion frames; distinguish Python references from copied character data. Use one tree-height convention within an argument and distinguish node counts from edge counts. Parameterize the alphabet before treating it as fixed.
- **Evidence:** Follow the [reference rules](#references-and-footnotes). Verify textbook editions and sections; cite API guarantees separately from implementation details. Present original correctness arguments as derivations, and use background readings only for the concepts they explain. Historical attribution needs a direct source; performance comparisons beyond complexity need a reproducible benchmark and its conditions.
- **Connections:** At the point of reuse, link the earlier invariant and explain the changed constraint or state lifetime. Keep the local argument self-contained. Place substantial allocator, concurrency, or benchmark experiments outside the core solution, and distinguish their costs from the algorithm's.
- **Verification:** Exercise changed examples against the problem contract, including a case that exposes the previous defect. For mutation, also check topology, node identity, restoration, or result independence as appropriate. Build the site and inspect affected formulas and links; report separately which code was executed, which output was inspected, and which checks remain incomplete.

## Sources

These sources inform the tag policy above. Site-specific behavior is linked to its owning source or template.

- WordPress.com — [Categories vs. Tags](https://wordpress.com/support/posts/categories-vs-tags/) and [WordPress Learn: Categories vs. Tags](https://learn.wordpress.org/tutorial/categories-vs-tags-whats-the-difference/): the division of labor between broad sections and per-post topic tags.
- Yoast SEO Academy — [Category SEO course](https://academy.yoast.com/app/uploads/sites/4/2021/07/5_3_category_seo_ecommerce_seo_course.pdf) (PDF): per-post count discipline, singular tag forms, and the SEO cost of tag sprawl.
- Meituan engineering blog — [tag index](https://tech.meituan.com/tags.html): a tag page working as retrieval aggregation, the quality bar every tag page here is held to.
