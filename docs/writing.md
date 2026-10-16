# Writing Conventions

Read this document before writing or changing posts, notes, or tags. It records the conventions this site applies to its content vocabulary; the research behind each rule is linked under Sources.

## Tags

A tag is a reusable category that aggregates posts for retrieval, not a label describing one post. Write tag slugs as lowercase ASCII with hyphens between words (`machine-learning`). The slug is the tag's identity everywhere: post frontmatter, URLs, and tag definition files.

- Give each post **3–4 tags** naming its topic areas and language ecosystems — enough to place the post, few enough that every tag page stays a meaningful aggregation.
- Reuse an existing tag whenever the overlap is real; a synonym tag (`js` beside `javascript`, `并发` beside `concurrency`) splits one topic's retrieval across two pages.
- Put a post's unique angle in its title or description instead of the tags: a one-off tag that no future post would reuse cannot aggregate anything.
- Use the singular form (`tag`, `database`): single nouns keep URLs short and read naturally on a tag page.
- Retire a tag by removing it from every post and deleting its definition file; a tag left with no published post generates no page in production.

## Titles, Descriptions, and Slugs

- Keep titles within 60 characters.
- Write a description that stands alone in RSS, archive previews, and meta tags: state what the post covers, not what it is about to do.
- Choose a kebab-case filename slug that names the topic (`concurrency-task-scheduling-collaboration`), not the date.

## Sources

- WordPress.com — [Categories vs. Tags](https://wordpress.com/support/posts/categories-vs-tags/) and [WordPress Learn: Categories vs. Tags](https://learn.wordpress.org/tutorial/categories-vs-tags-whats-the-difference/): the division of labor between broad sections and per-post topic tags.
- Yoast SEO Academy — [Category SEO course](https://academy.yoast.com/app/uploads/sites/4/2021/07/5_3_category_seo_ecommerce_seo_course.pdf) (PDF): per-post count discipline, singular tag forms, and the SEO cost of tag sprawl.
- Meituan engineering blog — [tag index](https://tech.meituan.com/tags.html): a tag page working as retrieval aggregation, the quality bar every tag page here is held to.
