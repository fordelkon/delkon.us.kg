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
