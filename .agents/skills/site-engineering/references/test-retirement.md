## Maintaining Tests

Before deleting or consolidating a test, record:

- Its name, location, and the regression it can detect.
- The production callers and contract it protects.
- The remaining independent proof, or evidence that the contract is obsolete.
- Relevant history explaining why it exists.
- The support code that becomes obsolete and the focused checks needed after removal.

Preserve candidates whose purpose remains uncertain. Investigate baseline failures as possible product bugs before weakening assertions or deleting tests. Consolidate repeated setup when it represents the same domain scenario, and remove support code made obsolete by the same change.
