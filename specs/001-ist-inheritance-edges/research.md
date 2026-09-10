# Phase 0 Research: IST Inheritance Edges

**Status**: Complete — no NEEDS CLARIFICATION markers in spec after `/speckit-clarify` session.

The spec's core mechanics (extractor pipeline, symbol id scheme, edge shape) are already grounded in existing code. This document captures the concrete pre-authoring investigation points that the implementer needs but that would be tedious to re-derive when writing tasks or code.

---

## R1: Tree-sitter node shape for TypeScript heritage clauses

**Decision**: walk `class_declaration` / `abstract_class_declaration` / `interface_declaration` → get the heritage container → get its type-identifier children (stripping generic wrappers).

**Rationale**: `tree-sitter-typescript` 0.23 exposes the following node types (verified against the shipped WASM grammar via `parser.ts`'s existing usage):

- **Class inheritance container**: `class_heritage` — appears as a named child of `class_declaration` and `abstract_class_declaration`. It contains one `extends_clause` (0 or 1) and one `implements_clause` (0 or 1).
  - `extends_clause` has one type expression as a named child. Can be a plain `identifier` / `type_identifier`, a `generic_type` (with a nested type identifier + type-arguments), or a `member_expression` (namespace access — `Foo.Bar`).
  - `implements_clause` has one or more type expressions as named children (comma-separated in source).
- **Interface inheritance container**: `extends_type_clause` — appears as a named child of `interface_declaration` (may occur once with multiple identifiers, since interfaces can extend multiple parents). Contains one or more type expressions with the same shape as above.

**Identifier extraction pattern** (applies to all three clause types):

```ts
function typeIdentifierOf(node: TsNode): string | undefined {
  if (node.type === "type_identifier" || node.type === "identifier") return node.text;
  if (node.type === "generic_type") {
    // First named child is the base identifier; skip type_arguments.
    const base = node.namedChildren[0];
    return base ? typeIdentifierOf(base) : undefined;
  }
  // member_expression (Foo.Bar) → deliberately dropped per spec's Edge Cases.
  return undefined;
}
```

**Alternatives considered**:
- **Tree-sitter query syntax** (`.query()` API): more elegant for pattern matching, but the existing extractor doesn't use queries — it uses simple `namedChildren` walks. Introducing queries here would be inconsistent for one small use case. Stick with the walk pattern.
- **Full TS compiler API (`ts.createSourceFile`)**: rejected — would double the parse cost per file and introduce a second parser dependency. tree-sitter is already good enough for structural extraction; type-inferred resolution (`calls` edges) is out of scope for this feature.

## R2: The current extractor pipeline (extract.ts:17-69)

**Decision**: extend the existing 2-pass structure to 3 passes; collect raw inheritance records inside pass 1's per-file loop (alongside `RawImport`s), resolve them in a new pass 3 (after imports edges are emitted).

**Rationale**: the current shape is:

- **Pass 1** (`extract.ts:24-36`): for each file → `parseTypeScript(source)` → tree → `extractSourceFromTree` (nodes) + `extractImportsFromTree` (raw imports). Trees are consumed and discarded per file — no long-lived tree cache.
- **Pass 2** (`extract.ts:40-62`): resolve raw imports against the walked file set; look up module ids by path; dedupe by `(fromId, toId, "imports")`; emit edges.

Adding inheritance as a third pass would need the trees back — expensive to re-parse. The cheap fix: **also produce raw inheritance records in pass 1's per-file loop**, so the tree is still in hand. Then pass 3 (after pass 2) resolves them using data already built (`allNodes`, walked file set, plus a new import-binding index built from pass 1's now-richer `RawImport`s).

The `Edge` interface accepts arbitrary type strings (`src/core/schemas.ts:50`: `type: z.string().min(1)`), so no schema change is needed for the two new values.

**Alternatives considered**:
- **Rewrite as visitor with plugins**: overkill. The 3-pass structure is 70 lines total and reads linearly.
- **Cache trees keyed by file path**: unnecessary — reads add memory pressure for no benefit when pass-1 can do all tree walking.

## R3: Cross-file symbol resolution mechanics

**Decision**: build the export and same-file indices once (after pass 1, before pass 3), then per-record lookup with the priority order `same-file locals > imported names > drop`. Each raw record carries the exact source node id, so duplicate-named declarations cannot be conflated.

**Rationale**:
- **Symbol index** — `Map<filePath, Map<exportedName, nodeId>>`. Precomputed once by iterating pass-1 declarations and retaining only exported `class` / `interface` nodes. Private declarations and `module`, `function`, `enum`, and `type-alias` nodes are excluded, so an import cannot resolve to an unsupported or private target.
- **Per-file import binding index** — `Map<filePath, Map<localName, {targetFile, exportedName}>>`. Built by iterating pass-1 `RawImport`s: for each import's `bindings` (see R4), resolve its `specifier` via the existing `resolveImport`; if the specifier resolves to a repo file, add every binding as `localName → {targetFile, exportedName}` in the file's inner map. If the specifier doesn't resolve (external package), skip its bindings — they can't produce in-repo inheritance edges. When resolving a binding, follow `export { Name as Alias } from "./next"` and equivalent local re-exports transitively, preserving aliases and using a visited `(filePath, exportedName)` set to terminate cycles.
- **Same-file locals index** — precomputed once as `Map<filePath, Map<localName, nodeId>>`, retaining only `class` / `interface` nodes. Pass 3 reuses the inner map for each file rather than filtering `allNodes` per file. Raw inheritance records carry `fromNodeId`; source resolution uses that id directly, while the name map is used only for target lookup. Add fixtures for duplicate-named sources and for function, enum, and type-alias targets to prove they are excluded.

Priority order rationale: TypeScript's own resolution shadows imports with same-scope declarations. `class Foo {}; class Bar extends Foo {}` where `Foo` is also imported means the local `Foo` wins. This matches the language semantics; getting it wrong would emit misleading edges.

**Alternatives considered**:
- **On-demand resolution without indices**: O(n²) for large graphs. Skip.
- **Single flat index with priority baked in**: harder to reason about; separate indices with an explicit priority order at the call site is cleaner.

## R4: Widening RawImport to carry local + imported names

**Decision**: extend `RawImport` from `{fromRelative, specifier}` to `{fromRelative, specifier, bindings: RawImportBinding[]}` where `RawImportBinding = {local: string, imported: string}`. Preserve backward compat by leaving `specifier` in place — pass 2's `imports`-edge emission does not touch bindings.

**Rationale**: cross-file inheritance resolution needs to know **which local names are bound to which exported names** for each import. Four import forms in TS:

| Source | `bindings` |
|---|---|
| `import { Foo, Bar as Baz } from "./x"` | `[{local: "Foo", imported: "Foo"}, {local: "Baz", imported: "Bar"}]` |
| `import * as NS from "./y"` | `[{local: "NS", imported: "*"}]` |
| `import D from "./z"` | `[{local: "D", imported: "default"}]` |
| `import "./polyfill"` (side-effect) | `[]` |

Only the named-import case (first row) can carry an in-repo inheritance target that this feature resolves. The namespace + default cases are recorded but deliberately drop out of resolution (see spec's Edge Cases: `Foo.Bar` namespace and default-import-aliased inheritance both silently drop). Side-effect imports still contribute their `imports` edge via pass 2's specifier-based dedup — that behavior stays.

**Alternatives considered**:
- **Build the binding index inside `extract.ts` from scratch**: duplicates AST-walking logic. Put the binding extraction in `extract-imports.ts` next to the existing walk.
- **Break the RawImport shape**: rejected — pass 2 code stays identical this way.

## R5: Edge-aggregation extension for edge-type awareness

**Decision**: add a `types: Set<string>` field to `AggregatedEdge` (in `edge-aggregation.ts`). When two raw edges collapse into one aggregate, union their type sets. `flowEdges` picks styling from `types.size === 1` (single-type aggregate → that type's style) or falls back to the imports style (mixed aggregate) per spec FR-011a.

**Rationale**: today's `AggregatedEdge` has `{id, from, to, count}` with no type info (see spec-time note in the code comment). The dominant-type debate happened during `/speckit-clarify` Q2 and landed on the fallback approach — Option D. This is the smallest data-shape change that lets the canvas honor it.

**Selection-dim rules** (`edge-aggregation.ts::visibleAncestors`): unchanged. Dim adjacency depends on endpoint membership in the selection's ancestor chain, not on edge type.

**Alternatives considered**:
- **Emit separate aggregate edges per type**: reintroduces the line-count clutter that aggregation solves. Rejected during `/speckit-clarify` Q2.
- **Store `dominantType` field instead of `types`**: loses information — a follow-up feature (e.g., showing a "mixed" indicator on hover) would have to reconstruct. Set is cheap.

## R6: Neighbors composable — widening without breaking

**Decision**: extend `Neighbors` interface from `{imports, importedBy}` to also include `extends`, `extendedBy`, `implementsList`, `implementedBy` (note the `implementsList` — `implements` is a reserved word in TS strict mode). Iterate edges once with a `switch` on `edge.type`, distribute into the six buckets, sort each bucket by node name.

**Rationale**: the current `neighborsOf` (`frontend/composables/neighbors.ts:17-57`) hardcodes `edge.type !== "imports"` as its filter. A single-pass edge walk with a type-dispatch replaces that cleanly. The `Set<string>` accumulation + one final sort pattern already used stays as-is.

Callers: the only call site is `pages/index.vue`'s `neighborIds` computed (`pages/index.vue:98-104`), which unions all neighbor ids into a Set for the dim-computation. That call site becomes: union across all six buckets — one loop, no logic change.

**Alternatives considered**:
- **Add a second `neighborsOf` function** for inheritance while keeping the imports one: doubles the pass over edges. Widening the single function is faster and simpler.
- **Return a `Map<edgeType, Node[]>`**: more flexible for future edge types but forces template code to know the discriminator strings. Named fields are what Vue templates read cleanly.
