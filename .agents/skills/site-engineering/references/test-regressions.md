## Regression Evidence

For a bug fix:

1. Write a scenario at the owning boundary that reproduces the reported behavior.
2. Run it against the pre-fix implementation and confirm failure for the intended reason.
3. Repair the owner and rerun the scenario to confirm the expected outcome.
4. Run relevant sibling checks and the repository completion checks.

If pre-fix reproduction is unavailable, report the evidence gap and what the new check actually establishes. Add checks at other layers only for distinct risks. A passing build establishes build success; assertions on generated artifacts or browser behavior are needed to establish those contracts.
