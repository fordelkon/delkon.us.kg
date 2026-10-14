# Upstream Source

- Repository: https://github.com/dmmulroy/anti-slop
- Commit: `13909c9e07590f5a85d93c62712259fe14a883f7`
- Source directory: `skills/install-anti-slop/assets/anti-slop/`
- Installed directory: `tools/oxlint/anti-slop/`

The generic entry point, rules, shared helpers, and Stylistic vendor files are copied unchanged. The optional Effect plugin and upstream tests are omitted. The upstream root MIT license is preserved as `LICENSE`; nested Stylistic license and provenance are preserved in `vendor/eslint-stylistic/`.

Oxlint and its plugin helpers use matching exact versions in the root package manifest. Enabled rules and scan exclusions are owned by the root `.oxlintrc.json`. Biome remains the existing general lint and formatting tool. Oxlint processes JavaScript/TypeScript and supported framework script sections; it does not validate Astro templates.

For updates, compare the pinned source with the desired upstream revision, review changes, preserve licenses, and verify the configured rules with both passing and failing inputs before recording the new commit here.
