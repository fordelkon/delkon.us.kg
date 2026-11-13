# Testing Principles

Read this document before writing, changing, reviewing, or deleting tests. Tests earn their maintenance cost by protecting observable behavior, meaningful invariants, or independent contracts. Repository completion checks belong to [agent guide](agent-guide.md#verification); available commands and CI execution belong to [package.json](../package.json) and [the CI workflow](../.github/workflows/ci.yml).

## Test Value Gate

Before writing, changing, or reviewing tests, read [test design and ownership](../.agents/skills/site-engineering/references/test-design.md).

### Choosing a Boundary for This Site

| Contract                              | Primary proof                                                                       | Distinct integration proof when affected                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Content schemas and normalization     | Real collection schema or loader with valid and invalid content fixtures            | Production build accepts intended content and generates the expected routes |
| Post visibility                       | Production selection behavior with published and draft entries                      | Generated pages, feeds, and search expose only intended entries             |
| Table of contents and data transforms | Public function outputs for representative and edge-case inputs                     | Rendered links target the headings produced by the content pipeline         |
| Markdown transformations              | Real processor with small fixtures; assert meaningful HTML structure and attributes | The affected page renders the transformed content correctly                 |
| Search                                | Production index queried through the actual search integration                      | A reader finds a published article and opens its result                     |
| Themes and navigation                 | Observable state and accessible controls                                            | Keyboard use, relevant viewports, theme persistence, and browser navigation |

Choose only the proofs needed by the changed contract. A module test and a browser test may coexist when they protect different failure modes.

## Dependencies and Determinism

For dependency replacement, asynchronous behavior, or isolated fixtures, read [dependencies and determinism](../.agents/skills/site-engineering/references/test-dependencies.md).

- Verify Pagefind search using a production build and its generated index. Development mode does not load the search component, so a development preview cannot prove search behavior.

## Regression Evidence

For a bug fix, read [regression evidence](../.agents/skills/site-engineering/references/test-regressions.md).

## Maintaining Tests

Before deleting or consolidating tests, read [test retirement](../.agents/skills/site-engineering/references/test-retirement.md).

## Coverage and Tooling

- Inspect existing scripts and configuration before choosing commands. When adding test tooling, connect it to a concrete behavioral risk and configure its source scope and CI execution explicitly.
- Use coverage reports to identify untested production paths. Aim for the repository's 80% minimum when establishing coverage, and report measured metrics, included sources, exclusions, and any gap honestly.
- A threshold below the target is a regression floor, not proof that the target is met. Raise it as independent behavioral coverage is added. Keep production sources visible in reports and justify exclusions by their role.
- Coverage percentages supplement contract review. Improve them with meaningful assertions and independent scenarios; repeated assertions or tests that mirror implementation do not establish additional protection.
- Let configured lint rules enforce mechanical constraints, such as focused or skipped tests. Review still determines test value, fixture fidelity, and boundary ownership. Document enforcement only after it exists and has been verified against failing and passing examples.

## Completion Evidence

Run focused checks during iteration and the [repository completion checks](agent-guide.md#verification) before handoff. Report the protected contract, commands and outcomes, runtime observations when relevant, and unresolved verification gaps. Distinguish automated assertions from manual inspection and report coverage only when it was measured.
