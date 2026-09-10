# Phase 1 Data Model: IST Inheritance Edges

## Existing entities (unchanged)

### Node

Defined in `src/core/schemas.ts:26`. Every symbol emitted by the extractor. Relevant fields for this feature:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable id `istNodeId(relativePath, name)`. Symbols with duplicate names in one file get `#2`, `#3`, … suffix. |
| `type` | string | One of `module`, `class`, `interface`, `type-alias`, `enum`, `function`. This feature emits edges only from `class` / `interface` nodes. |
| `name` | string | The declared identifier (e.g., `AuthService`, `User`). Used as the "exported name" for cross-file resolution. |
| `path` | string \| undefined | Repo-relative file path where the symbol is declared. Present on all non-module IST nodes; module nodes use `name` as their path. |

**No schema change.** New edge-type values (`extends`, `implements`) fit the existing `type: z.string().min(1)`.

### Edge

Defined in `src/core/schemas.ts:42`. Directed relationship between two nodes.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `istEdgeId(fromId, toId, edgeType)` — the edge-type constituting id makes the same-pair-different-type edges distinguishable. |
| `from` | string | Source node id. For inheritance: the deriving class or interface. |
| `to` | string | Target node id. For inheritance: the parent class, extended interface, or implemented interface. |
| `type` | string | `imports` (existing), `extends` (new), `implements` (new). |

## New in-memory-only entities (per extraction run, not persisted)

### RawInheritance

Pure data record produced by `extractInheritance*`. Consumed by the resolution pass.

| Field | Type | Notes |
|---|---|---|
| `relativePath` | string | The file the deriving symbol lives in. |
| `fromSymbolName` | string | The name of the class or interface declaring the clause. Same value that ends up as the `name` field on the source node. |
| `targetName` | string | The identifier being extended or implemented, with generic wrappers stripped (`Base<T>` → `"Base"`). Namespace-qualified targets (`Foo.Bar`) never enter this record — they are dropped by the extractor. |
| `edgeType` | `"extends"` \| `"implements"` | Which relationship this record represents. |

### RawImport (extended)

Existing type in `src/extractors/typescript/extract-imports.ts:4`. Feature widens it with a `bindings` field.

| Field | Type | Notes |
|---|---|---|
| `fromRelative` | string | Existing. |
| `specifier` | string | Existing. Consumed by pass 2 (imports edges). |
| `bindings` | `RawImportBinding[]` | **New**. Empty for side-effect imports (`import "./polyfill"`). |

### RawImportBinding (new)

| Field | Type | Notes |
|---|---|---|
| `local` | string | Name as used in the importing file. For `import { Foo as Bar }`, this is `"Bar"`. |
| `imported` | string | Name exported from the target module. For the same import, this is `"Foo"`. `"*"` for namespace imports (`import * as NS`), `"default"` for default imports. |

### SymbolIndex

Built once after pass 1, before pass 3. Not persisted.

| Field | Type | Notes |
|---|---|---|
| `get(filePath, exportedName)` | `string \| undefined` | Returns the node id of the symbol exported as `exportedName` from `filePath`, if any. Backed by `Map<filePath, Map<exportedName, nodeId>>`. |

### FileImportIndex

Built once per file, on demand during pass 3. Not persisted.

| Field | Type | Notes |
|---|---|---|
| `get(localName)` | `{targetFile, exportedName} \| undefined` | Returns the target file + exported-name pair the local name is bound to in this file, if it's an import. |

### SameFileSymbols

Built once per file being resolved during pass 3. Not persisted.

Simple `ReadonlyMap<string, string>` (local symbol name → local node id) — no wrapper type.

## New relationships in the emitted Model

For each `RawInheritance` that resolves to a target node id (`toId`) different from its source (`fromId`), pass 3 emits an `Edge`:

- `extends` edge — from a class node to its parent class node.
- `extends` edge — from an interface node to each of its parent interface nodes (interfaces can extend multiple).
- `implements` edge — from a class node to each interface it implements (classes can implement multiple).

**Deduplication**: `(fromId, toId, edgeType)` triples are collapsed at emit time. A source class that repeats the same target (e.g., `class Foo implements Bar, Bar`) produces one edge. Same class extending same target under a different name (via re-exports) is not deduped at raw-record level; the id-triple dedup at emit is where it collapses.

## Data flow (extraction)

```text
Files (repo walk)                                   [existing]
  │
  ▼
Pass 1 — per file:
  parseTypeScript(source) → tree                    [existing]
  extractSourceFromTree(tree)     → Node[]          [existing]
  extractImportsFromTree(tree)    → RawImport[]     [WIDENED]
  extractInheritanceFromTree(tree)→ RawInheritance[][NEW]
  │
  ▼
Pass 2 — resolve imports:                           [existing, no change]
  RawImport[] + walked file set + moduleIdByPath
    → Edge[] (type: "imports")
  │
  ▼
Pass 3 — resolve inheritance:                       [NEW]
  Build SymbolIndex from allNodes                   (once)
  For each file:
    Build FileImportIndex from that file's imports  (once per file)
    Build SameFileSymbols from that file's nodes    (once per file)
    For each RawInheritance in that file:
      resolveSymbol(...)  → toId | undefined
      Skip if undefined or toId === fromId
      Dedupe by (fromId, toId, edgeType)
      Emit Edge (type: "extends" | "implements")
```

## Data flow (canvas rendering)

```text
Model.edges  (with new extends/implements alongside imports)
  │
  ▼
aggregateEdges(...)                                  [MODIFIED]
  → AggregatedEdge[] with new types: Set<string>
  │
  ▼
flowEdges computed                                   [MODIFIED]
  Pick style per aggregate:
    types.size === 1 && has "extends"     → solid  smoothstep
    types.size === 1 && has "implements"  → dashed smoothstep
    otherwise                              → imports style (fallback)
  Selection-dim rules unchanged.
```

## Data flow (Neighbors sidebar)

```text
Model.edges (all types)
  │
  ▼
neighborsOf(nodeId, nodes, edges)                    [WIDENED]
  Single pass:
    edge.type === "imports"    → imports / importedBy
    edge.type === "extends"    → extends / extendedBy
    edge.type === "implements" → implementsList / implementedBy
  │
  ▼
Six named lists on Neighbors interface
  │
  ▼
Sidebar template                                     [MODIFIED]
  Six <section v-if="…length"> blocks (empty sections hidden per FR-010).
```
