# Reviewing Agent Context

Use this guide when changing repository instructions, skills, or context hooks,
or reassessing them after a client or model upgrade. It requires only the
repository and the client being evaluated; personal skills and plugins are optional.
For the current entrypoints and hook contract, read [context loading](agent-context-loading.md).

## Define the review

Identify the intended behavior, affected clients, and evidence needed to establish
completion. Distinguish repository guidance from user-level configuration and
client-provided instructions. Repository changes do not authorize changes to
someone's personal configuration, credentials, permissions, or plugin installation.

List each proposed repair, deletion, move, or rewrite with its source, destination
when applicable, reason, and expected behavior change. Resolve uncertain changes
with the maintainer before implementation. Preserve preferences, rejected approaches
and their reasons, environment assumptions, silent traps, read-only and no-upload
constraints, irreversible-operation rules, and dated decisions.

Keep personal installation inventories, usage history, machine paths, and recovery
snapshots outside the repository. Preserve historical records verbatim before
replacing them with reusable guidance; publish only repository-relevant material.

## Measure and migrate

Record the exact pre-edit working tree, including existing uncommitted changes.
Keep snapshots private, capture only relevant files, and exclude secrets and
unrelated conversations. A rollback must compare current files with the recorded
post-edit state before overwriting later work.

Separate always-loaded instructions, skill descriptions, and conditionally read
references. Report the measurement method and units. Unicode source characters,
tokens, billing, and observed client injection are different measurements; count
symlink aliases separately from unique resolved-source costs.

For usage evidence, distinguish installed, enabled, listed, invoked, and read.
Count structured tool calls and successful reads, deduplicate by call identifier,
and use an explicit timezone-aware cutoff. A read can be inspection rather than
adoption, and missing records do not prove non-use. Record history gaps, including
unavailable clients and uncheckpointed database data. Never infer use from name
mentions alone.

Move conditional material verbatim and capture that checkpoint before shortening
its entrypoint. Keep authorization constraints intact. Each moved contract needs
an explicit task trigger in a reachable index or skill. Documents are not loaded
merely because they exist. Do not remove a compatibility entrypoint until every
relevant client is proven to load its replacement.

Account for every removed nonblank source line against the agreed disposition.
Record intentional behavior changes separately from equivalent rewrites. A passing
line ledger establishes accounting; it does not establish semantic equivalence.

## Verify the result

- Check local links, heading fragments, symlinks, and discovery metadata. Exercise
  selectors with existing matching and nonmatching files; a local glob check does
  not establish a client's native rule-loading behavior.
- Apply [the repository verification contract](agent-guide.md#verification).
  For hook changes, also run the checks in [context loading](agent-context-loading.md#verification).
- Have an independent reviewer compare disappeared original text with reachable
  replacements without first reading the migration's claimed equivalences.
- Test loading in independent fresh positive and negative sessions. Use temporary,
  unpredictable markers that are absent from the task prompt. Confirm the positive
  task loads the intended reference and the negative task does not. Inspect tool
  traces, then remove only the temporary files created for the experiment.
- Preserve the normal configuration during probes. Do not disable permissions,
  plugins, or invocation policies to manufacture a pass. Missing credentials or
  access remain explicit verification gaps; they do not authorize configuration changes.

Record client and available model versions, operating system, UTC timestamps,
commands and outcomes, approvals, recovery evidence, and unverified behavior.
Keep machine-specific artifacts private. Source inspection, native discovery,
hook subprocess tests, and real-session loading prove different things; report
which evidence was actually collected and retain fallbacks for unresolved clients.
