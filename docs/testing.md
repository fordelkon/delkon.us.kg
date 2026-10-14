# Testing Principles

Read this document before writing, changing, reviewing, or deleting tests. Tests earn their maintenance cost by protecting observable behavior, meaningful invariants, or independent contracts. Repository completion checks belong to [AGENTS.md](../AGENTS.md#verification); available commands and CI execution belong to [package.json](../package.json) and [the CI workflow](../.github/workflows/ci.yml).

## Test Value Gate

Before adding or changing a test, answer all four questions:

1. What observable behavior, invariant, or independent contract does it protect?
2. What credible regression would make it fail?
3. Why would existing tests or verification not catch that regression? Extend an existing case or fixture when it already owns the contract.
4. Does it require a production export, flag, wrapper, or injection hook with no production caller? If so, exercise the existing production boundary instead.

A candidate is ready when all four answers identify a distinct risk and an independent way to detect it. Code changes or coverage increases alone do not justify a test.

Write the acceptance scenario before the implementation. Use a concise test title that states the condition and observable outcome; name the feature or unit in the enclosing group. One test should express one coherent scenario, with assertions for the outcomes needed to prove it.

## Behavior and Ownership

- Assert public outputs, user outcomes, and meaningful invariants, including relevant failure and edge cases. Tests should survive refactors that preserve behavior.
- Give each contract one primary test owner at the boundary that can prove it directly. Additional layers need a distinct integration, lifecycle, or delivery risk that the primary owner cannot reach.
- Use independently specified expected values. A helper under test, a copied private predicate, or a fake implementing the asserted result cannot establish correctness.
- Assert delegation only when invoking that dependency is itself an explicit public contract.
- Keep fixtures and test names aligned with the conditions actually exercised. Negative cases must fail because of the intended rule, rather than an unrelated guard.
- Source inspection is appropriate when it independently protects an externally meaningful key, byte, or path and remains valid after identifier-only refactors. Prefer executing the owning build or transformation when that proves the contract more directly.

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

- Keep internal dependencies real when proving their behavior: use the actual schema, Markdown processor, filesystem fixture, or build pipeline. Use isolated temporary directories for tests that write files, and clean them up after each scenario.
- Replace unreachable external services with controlled responses or fakes typed against their production contracts. Fakes provide inputs and failures; the production owner produces the result under assertion. Verify the relevant dependency contract when a test relies on its behavior.
- Stub browser APIs at the environment boundary when required, and explain the limitation. Use typed function stubs where the chosen test framework supports them.
- Test time-dependent logic with fake clocks. Coordinate asynchronous work through awaited results, events, or explicit signals. Browser tests wait for observable states, such as a visible search result, rather than fixed delays.
- Keep scenarios independent: isolate content fixtures, environment settings, browser storage, and generated output. Restore changed environment state and dispose resources even when assertions fail.
- Verify Pagefind search using a production build and its generated index. Development mode does not load the search component, so a development preview cannot prove search behavior.

## Regression Evidence

For a bug fix:

1. Write a scenario at the owning boundary that reproduces the reported behavior.
2. Run it against the pre-fix implementation and confirm failure for the intended reason.
3. Repair the owner and rerun the scenario to confirm the expected outcome.
4. Run relevant sibling checks and the repository completion checks.

If pre-fix reproduction is unavailable, report the evidence gap and what the new check actually establishes. Add checks at other layers only for distinct risks. A passing build establishes build success; assertions on generated artifacts or browser behavior are needed to establish those contracts.

## Maintaining Tests

Before deleting or consolidating a test, record:

- Its name, location, and the regression it can detect.
- The production callers and contract it protects.
- The remaining independent proof, or evidence that the contract is obsolete.
- Relevant history explaining why it exists.
- The support code that becomes obsolete and the focused checks needed after removal.

Preserve candidates whose purpose remains uncertain. Investigate baseline failures as possible product bugs before weakening assertions or deleting tests. Consolidate repeated setup when it represents the same domain scenario, and remove support code made obsolete by the same change.

## Coverage and Tooling

- Inspect existing scripts and configuration before choosing commands. When adding test tooling, connect it to a concrete behavioral risk and configure its source scope and CI execution explicitly.
- Use coverage reports to identify untested production paths. Aim for the repository's 80% minimum when establishing coverage, and report measured metrics, included sources, exclusions, and any gap honestly.
- A threshold below the target is a regression floor, not proof that the target is met. Raise it as independent behavioral coverage is added. Keep production sources visible in reports and justify exclusions by their role.
- Coverage percentages supplement contract review. Improve them with meaningful assertions and independent scenarios; repeated assertions or tests that mirror implementation do not establish additional protection.
- Let configured lint rules enforce mechanical constraints, such as focused or skipped tests. Review still determines test value, fixture fidelity, and boundary ownership. Document enforcement only after it exists and has been verified against failing and passing examples.

## Completion Evidence

Run focused checks during iteration and the [repository completion checks](../AGENTS.md#verification) before handoff. Report the protected contract, commands and outcomes, runtime observations when relevant, and unresolved verification gaps. Distinguish automated assertions from manual inspection and report coverage only when it was measured.
