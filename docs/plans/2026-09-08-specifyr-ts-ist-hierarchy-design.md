# IST/SOLL/PLAN Hierarchy Design

**Status:** Validated design, not an implementation plan. Break into sequential
implementation slices via `writing-plans` before building.

## Problem

The current IST view renders every top-level symbol (function, class,
interface, type-alias, enum) as its own node, at the same visual weight as
module nodes — but symbol nodes carry **zero edges**. `extract.ts` only emits
module-to-module `imports` edges (`src/extractors/typescript/extract.ts:56-61`).
On a ~160-node repo, roughly half the graph is a disconnected grid of
unrelated boxes: no visual grouping, no way to answer "what does this module
contain" or "how do these pieces relate."

This is not a missing-polish problem — it's a missing-connectivity problem.
Folder/module grouping alone would not fix it; the symbol nodes need either a
containing relationship or to disappear from the flat graph entirely.

## Goal

The view should let a user answer, at any zoom level:
- What does this file contain?
- How do these two files/folders relate?
- Where in the tree does this thing I'm looking at live?

Without starting from a flat wall of tiles, and without requiring the whole
graph to be visible at once.

## Non-goals (explicitly out of scope for this design)

- **Cross-repo call chains / runtime tracing.** The motivating long-term
  vision (click an artifact in one repo's data explorer, see everything it
  triggers into another repo's backend, as a Gantt-like diagram) is real, but
  it requires actual runtime observation, not static import analysis. It's
  already the project's own later roadmap stage
  (`plans/001-editor-perspectives-and-state-comparison.md`, split into
  `plans/002-004` with explicit go/no-go gates), staged explicitly AFTER
  static cross-language call flow, which doesn't exist yet either. Deferred
  in full; revisit via its own brainstorm when its prerequisites are done.
- **Symbol-to-symbol edges** (calls, extends/implements). Symbols remain pure
  visual children with no edges of their own. Already flagged in the README
  as a later slice.
- **Persisting collapse state across reloads.** Reload = everything collapsed
  (default state). Natural annex to the already-planned "Layout persistence"
  slice, not this one.
- **A separate search field inside the tree.** The existing header search
  stays the only search, and keeps working flatly across all nodes
  regardless of tree state (see Search + Collapse below).
- **Multi-select** in tree or canvas.
- **Building the PLAN view itself** (endpoint, toggle, storage). Only
  ensuring the hierarchy mechanism doesn't hard-code SOLL/IST so PLAN can
  plug in later without touching this code again.
- **Icons in the tree.** Text + expand chevron, Tailwind-only, matching
  existing style.

## Data model

### Extractor change (minimal, one field)

`src/extractors/typescript/extract-source.ts` sets `path: relativePath` on
every symbol node it pushes (module nodes already carry their path as
`name`). One field, already optional on `NodeSchema`
(`src/core/schemas.ts:34`), no schema migration.

### Folders and files are not persisted Node objects

Folders are never part of the `Model` sent over the wire — they're a pure
rendering concept, synthesized client-side from path prefixes. Rationale: a
folder isn't a vocabulary entity a user would author in SOLL or drift-match
against IST; it's filesystem structure. Keeping it out of the core data model
keeps that model clean for the SOLL↔IST drift-matching work already on the
roadmap.

`buildHierarchy(nodes: Node[])` is a single, **view-agnostic** pure function:
flat node list → `Folder[] → File[] → Symbol[]` tree, driven only by `path`
(and, for IST, the `module` type marking a node as itself being a file). It
does not know or care whether `nodes` came from `/api/soll`, `/api/plan`
(once that exists), or `/api/ist`.

Two file-level cases:
- **IST module nodes** are real, selectable nodes — the file-level box in the
  tree/canvas is anchored to that real node (keeps existing Neighbors sidebar
  working, since imports edges reference module ids).
- **SOLL/PLAN nodes with a `path` but no dedicated "file" node type** — the
  file-level box is synthesized the same way folders are: a virtual
  container with no backing node. Clicking it expands/collapses only and
  explicitly clears `selectedNodeId` (there's no node to select), so a
  previous real-node selection cannot remain highlighted while navigating a
  virtual file.

Nodes with no `path` at all (neither SOLL nor IST) land in an implicit
"(no folder)" bucket at the root instead of disappearing. That bucket always
contains a synthetic "(no file)" child, keeping the promised
`Folder → File → Symbol` shape; pathless symbols are children of that virtual
file. The virtual file has no backing node, so clicking it also clears
`selectedNodeId` and only toggles its expansion state.

## Layout: three-pane, one shared selection

```text
┌─────────────┬──────────────────────────┬─────────────┐
│  Explorer   │         Canvas           │   Details   │
│  (new, tree)│ (Folder→File→Symbol,     │  (existing  │
│             │  nested wrapper boxes)   │  sidebar)   │
└─────────────┴──────────────────────────┴─────────────┘
```

This is Plan-001's original three-pane "Bedienkonzept" (Explorer /
Perspective / Details), arrived at from the practical direction rather than
speccing it up front.

- **Explorer (new):** plain text tree, folders + files only — **no symbols**.
  Putting symbols in the tree too would just move today's clutter problem
  from canvas to tree. The tree is a coarse navigation aid to file
  granularity; symbol detail stays canvas + sidebar's job. Built from the
  same `buildHierarchy()` as the canvas — no duplicated tree logic. Tree has
  its own local expand/collapse state, independent of canvas.
- **Canvas:** nested wrapper boxes, ELK-scoped per expanded container (see
  Layout stability below). Starts fully collapsed.
- **Details sidebar:** unchanged — existing `formatNodeDetails` + Neighbors
  sections, still reacts to `selectedNodeId`.

**`selectedNodeId` becomes the single shared truth**, settable from either
Explorer or Canvas:
- Explorer click on a file → `selectedNodeId` = that file (if IST module), or
  `selectedNodeId` = `undefined` (if virtual SOLL/PLAN file box — expand
  only). Canvas opens the path down to that file's wrapper box and fits the
  camera; the file's own box stays collapsed (shows a "12 symbols" badge)
  unless clicked again. The virtual-file transition from a real selection is
  covered by an interaction test and leaves the Details sidebar empty.
- Canvas click on a module → Explorer highlights that exact file.
- Canvas click on a symbol → Explorer highlights the file **containing** that
  symbol (resolved via the symbol's `path`), not a tree row for the symbol
  itself — the tree has no such row.
- The Explorer highlight always follows the current `selectedNodeId` to its
  owning file, not just on the initiating click — clicking a neighbor in a
  different file moves the highlight too.

## Canvas rendering: wrapper nodes, not floating boxes

A folder (or file, for SOLL/PLAN's virtual case) is a real Vue Flow
parent/group node (`parentNode` + `extent: 'parent'`) — a box that visually
contains its children, not a node floating separately from what it
represents. Collapsed, it's a small badge-sized box. Expanded, it grows to
contain its children's layout, anchored at a fixed point (see below) — it
never itself relocates when it grows.

## Edge aggregation

A real edge is always drawn between the **visible ancestors** of its two
endpoints, not the raw endpoints:

`resolveVisibleEndpoint(nodeId, collapseState)`:
1. Walk up the hierarchy from the real endpoint until hitting the first
   ancestor that is currently visible (not hidden inside a collapsed
   container).
2. Both endpoints of every real `imports` edge get resolved this way.
3. Dedupe by resulting `(from, to)` pair — multiple real edges between
   contents of the same two collapsed containers collapse to one visible
   edge.
4. Drop any edge whose resolved endpoints are equal (both land in the same
   visible container) — no self-loops from aggregation.

Purely a rendering derivative — recomputed client-side on every collapse
state change, never persisted. The Neighbors sidebar (Imports/Imported by)
is untouched by this and keeps working only with real, unaggregated
module-level edges — aggregation is a canvas-only concept.

## Layout stability: hybrid

Full ELK re-layout on every expand/collapse risks moving unrelated,
already-visible boxes elsewhere on the canvas — undermining the exact trust
this redesign is meant to build. Chosen approach:

- **Top-level wrapper positions are fixed and simple** (e.g., an alphabetical
  grid), computed independently of ELK. Each grid cell reserves a stable
  rectangle with a gap to its siblings and the canvas edges. Expanding a
  wrapper grows it from its collapsed badge into that reserved rectangle;
  sibling wrappers keep their anchors and never overlap it. If the scoped
  layout needs more room than the reserved rectangle, the wrapper keeps the
  same outer bounds and its content area scrolls locally. The canvas extent
  includes the complete grid, so overflow adds canvas scrolling rather than
  moving or clipping a top-level wrapper. The grid position only changes when
  the underlying set of top-level folders itself changes (repo switch, new
  file added) — never from expand/collapse.
- **Inside an expanded container, ELK runs scoped to just that container's
  children** — same `layered` algorithm as today, just invoked per expanded
  container instead of once globally. `useElkLayout`'s existing `inputKey`
  pattern applies per-container: the key includes a sorted recursive
  signature of every descendant's stable id, measured width/height,
  parentage, and expanded/collapsed state, plus the local edge endpoints.
  Thus a nested expansion invalidates every affected ancestor key even when
  node ids and edge endpoints are unchanged. Expanding folder A never touches
  folder B's already-computed internal arrangement, because each container
  still gets its own key over just its own subtree.

This sidesteps needing ELK's native compound/hierarchical layout mode
entirely — architecturally it's the same ELK call as today, scoped smaller
and invoked more than once, which is a meaningfully lower-risk technical bet
than one global hierarchical ELK computation plus Vue Flow parent-node
rendering glued together in one pass.

## Search + Collapse interaction

Enter on a search hit that's currently hidden inside a collapsed
folder/file auto-expands every ancestor down to it, then fits the camera —
same as today's behavior, extended to also open ancestor wrapper boxes.
Without this, Search's core promise ("start from anywhere") breaks the
moment the graph defaults to collapsed.

## Testing strategy

Pure, TDD-able logic (unit tests, following the existing project pattern):
- `buildHierarchy(nodes)` — empty list, root-level file with no folder, deep
  nesting, IST module-anchored files vs. SOLL/PLAN virtual files, and a mixed
  pathful/pathless input asserting that pathless symbols appear under the
  `(no folder) → (no file)` virtual parents.
- `resolveVisibleEndpoint` / edge aggregation — dedup, self-loop removal,
  partial collapse states.
- Top-level grid placement — deterministic given a folder set, with adjacent
  folders expanding independently without overlapping their reserved cells or
  the canvas edges.
- Per-container `useElkLayout` input keys — expanding a nested child with the
  same node ids and edge endpoints changes the ancestor key and recomputes
  the ancestor positions.

UI wiring (tree/canvas clicks, sync, expand/collapse): E2E bundle-content
guards plus manual smoke test, matching the pattern used for every prior
slice in this project — component-level Vue Flow interaction tests have
proven brittle and were skipped in Selection/Neighbors/Search/Repo Picker
for the same reason. The tree interaction coverage must include selecting a
real IST module, clicking a virtual SOLL/PLAN file, and asserting that
`selectedNodeId` is cleared and the Details sidebar no longer shows the old
node.

## Suggested slicing for implementation

Given the size, this is not one slice. Breakdown, tracked as implemented:

1. ✅ **Data model** — extractor `path` field + `buildHierarchy()` (TDD, no
   UI). Plan: `docs/plans/2026-09-08-specifyr-ts-slice-hierarchy-data.md`.
   Shipped: PR #20.
2. ✅ **Explorer tree UI** — read-only nav pane, `findFilePath()`,
   bidirectional sync with the existing flat canvas via `selectedNodeId` +
   `fitView` (interim — no nested wrapper boxes yet). Plan:
   `docs/plans/2026-09-09-specifyr-ts-slice-explorer-tree.md`. Shipped: PR #21.
3. ⬜ **Nested canvas wrapper boxes + hybrid layout** (biggest remaining
   chunk) — not started.
4. ⬜ **Edge aggregation** — not started.
5. ⬜ **Search + auto-expand integration** — not started. Note: tree-driven
   auto-expand-on-selection already landed in slice 2 for the *tree side*;
   this item is specifically about auto-expanding *canvas* wrapper boxes
   once slice 3 introduces them, so Search's jump-to-first-match keeps
   working once the canvas stops being flat.

Each slice follows the existing project pattern: implement → code-review
checkpoint → E2E guard → README bump → PR → wait for CodeRabbit → merge.
