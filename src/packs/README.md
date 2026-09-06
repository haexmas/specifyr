# Vocabulary Packs

Each `<name>.json` in this directory is one vocabulary pack conforming to
`VocabularyPackSchema` in `src/vocabulary/pack.ts`.

- `generic.json` is authoritative — its top-level node types are the ones
  Slice 2's `bucket.ts` supports for filesystem persistence. A cross-slice test
  (`tests/vocabulary/integration.test.ts`) fails if the two drift.
- `python.json`, `typescript.json`, `vue.json` cover common architectural
  concepts for those stacks.
- `angular.json`, `c.json`, `cpp.json`, `rust.json`, `java.json`, `go.json`
  are seed packs. Expert domain fill-in (idiomatic node types + edge kinds
  per language) is a follow-up.

Packs are shipped in the npm tarball under `dist/packs/` (copied by
`scripts/copy-packs.mjs` after tsc emit).
