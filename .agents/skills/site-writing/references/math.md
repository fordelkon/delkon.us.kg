## Mathematics

Choose notation by what the passage explains: a mathematical relationship, a piece of code, or an ordinary quantity. A number or variable name alone does not require a formula.

- Use math for complexity bounds in prose and tables, equations, recurrences, sums, products, factorials, powers, mathematical intervals, and constraints used in an argument. Keep the notation consistent throughout that argument, including its variable definitions.
- Keep ordinary counts, dates, durations, measurements, percentages, problem numbers, versions, and numeric examples in prose. A quantity belongs in math when it participates in a formula or bound; “26 letters” can stay prose while a character-set cardinality belongs in math.
- Use inline code for identifiers, types, API calls, literal input/output, language operators, and expressions quoted from an implementation. Preserve code blocks. A mathematical nonnegative-input constraint uses an inequality; an explanation of `if (n >= 0)` keeps the exact code. Likewise, a recurrence uses math while a call such as `fibonacci(n - 1)` remains code.
- Use inline math for short expressions within a sentence or table cell. Use display math for a central equation, a derivation, or an expression that needs its own line. Keep a formula inside a sentence when a separate block would interrupt the explanation. Keep titles and frontmatter readable as plain text; do not add formula markup merely to style a number.
- Define each mathematical symbol when first introduced, state its domain or bounds when relevant, and explain its connection to code when names differ. Formatting must preserve the original meaning: distinguish equality from an upper bound and retain conditions such as average-case versus worst-case complexity.

Verify formulas in the production build before publishing, including table structure and long expressions at narrow widths. Follow the [post math examples](../../../../content/TEMPLATE-post.md#mathematics) or [note math examples](../../../../content/TEMPLATE-note.md#mathematics) for delimiter syntax, escaping, and table handling.
