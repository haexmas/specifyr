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
| `fromNodeId` | string | Stable id of the exact class or interface declaration that owns the clause, generated with the same duplicate-name suffix rules as `extractSourceFromTree`. This is the source identity used during resolution; it prevents same-named declarations from being conflated. |
| `fromSymbolName` | string | The declaration name, retained for diagnostics and fixture readability. It is not used to select the source node. |
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
| `get(filePath, exportedName)` | `readonly string[]` | Returns all node ids of exported classes or interfaces named `exportedName` from `filePath`, in stable source order. Backed by `Map<filePath, Map<exportedName, nodeId[]>>`; private declarations and `module`, `function`, `enum`, and `type-alias` nodes are never indexed. Export visibility is captured during pass 1 from the declaration's export modifier or equivalent source metadata. Resolution emits a target only when the candidate list has exactly one entry; ambiguous duplicate exports are dropped rather than selecting arbitrarily. |

### FileImportIndex

Built once per file, on demand during pass 3. Not persisted.

| Field | Type | Notes |
|---|---|---|
| `get(localName)` | `{targetFile, exportedName} \| undefined` | Returns the target file + exported-name pair the local name is bound to in this file, if it's an import. The subsequent `SymbolIndex` lookup follows in-repository re-export bindings transitively, including aliases, with a visited set to stop cycles. |

### SameFileSymbols

Built once per file being resolved during pass 3. Not persisted.

Simple `ReadonlyMap<string, readonly string[]>` (local class/interface symbol name → all matching local node ids) — no wrapper type. It includes private same-file declarations, but only `class` and `interface` nodes; all other node kinds are excluded. A same-file target is accepted only when its list has exactly one entry. The source side of each record is selected by `RawInheritance.fromNodeId`, never by this map's name lookup.

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
  Build SymbolIndex once from exported class/interface nodes only
  Precompute SameFileSymbols: Map<filePath, Map<name, nodeId>> once
  For each file:
    Build FileImportIndex from that file's imports  (once per file)
    Reuse that file's precomputed class/interface locals
    For each RawInheritance in that file:
      take fromId directly from RawInheritance.fromNodeId
      resolveSymbol(relativePath, targetName, ...) → toId | undefined
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
