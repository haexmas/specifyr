# Slice Nested Canvas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace the current flat Vue Flow canvas with nested wrapper boxes
built from the same `buildHierarchy()` output the Explorer already uses.
Top-level wrapper positions are a stable, ELK-independent alphabetical grid;
inside each *expanded* wrapper, ELK's existing `layered` algorithm runs
scoped to just that container's children. Wrappers start fully collapsed
(small badges); clicking a wrapper on the canvas — or a file in the Explorer
tree — auto-expands the ancestor chain and fits the camera. The graph never
re-lays out globally: expanding folder A never moves folder B.

**Architecture:**
- One new pure helper `computeGridPlacement()` deterministically places
  top-level wrappers into a uniform alphabetical grid. Fixed cell size, gap
  to neighbours and canvas edges — never influenced by expand state.
- One pure `layoutContainer(nodes, edges)` (extracted out of the existing
  `useElkLayout`) wraps a single ELK `.layout()` call. `useElkLayout` keeps
  its current single-graph public API and delegates to it, so existing
  tests stay untouched.
- One new composable `useNestedElkLayout({ hierarchy, expandedIds, edges })`
  does a **bottom-up** traversal per canvas render: for each expanded
  container it calls `layoutContainer` scoped to its immediate children,
  using each child's size (badge-size when collapsed, own bounding-box when
  expanded). Every container gets its own `inputKey` covering the recursive
  descendant expand-state + local edges, so a nested expansion invalidates
  every affected ancestor's cached layout but leaves unrelated siblings
  alone. Output: a flat `Map<nodeId, { x, y, width, height, parentId? }>`
  that `pages/index.vue` maps to Vue Flow `parentNode` + `extent: 'parent'`
  nodes.
- `pages/index.vue` rewrites its `flowNodes`/`flowEdges` computeds to emit
  the nested structure; a second `expandedCanvasIds = reactive(Set)` mirrors
  the Explorer's expand-state pattern but is independent of it (per design
  doc: tree and canvas expand states are separate).

**Tech Stack:** Vue 3 (composables, `reactive` Set), Vue Flow parent-node
support (`parentNode` + `extent: 'parent'`), elkjs (existing dependency,
same `layered` algorithm), Vitest.

**Reference — the redesign this fits into:**
`docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md` — see
specifically the "Canvas rendering: wrapper nodes, not floating boxes" and
"Layout stability: hybrid" sections. This is slice 3 of the 5-slice
breakdown at the bottom of that doc. Slices 1-2 have shipped (PRs #20, #21).

**Deliberate scoping — deferred to later slices in this same redesign:**
- **Edge aggregation** (design doc's "Edge aggregation" section) — Slice 4.
  Interim behavior in THIS slice: `flowEdges` only emits an edge when BOTH
  endpoints are currently visible top-level or inside a currently-expanded
  container. Edges whose endpoints are hidden inside collapsed wrappers are
  silently dropped from the canvas. The Neighbors sidebar is untouched and
  keeps working on the full raw edge list (design doc: "aggregation is a
  canvas-only concept").
- **Search auto-expand** (design doc's "Search + Collapse interaction") —
  Slice 5. Interim: today's search behavior still applies to the *flat*
  node dimming logic, but `fitView` on Enter may target a node that lives
  inside a collapsed wrapper — the camera will fit to whatever coordinates
  Vue Flow has (i.e. the collapsed ancestor). Documented, not fixed here.
- **Full ELK compound-node / hierarchical layout mode.** Explicitly rejected
  by the design doc in favour of per-container scoped `layered` calls.
- **Symbol-to-symbol edges** (calls, extends/implements). Symbols remain
  edge-less children per design doc's non-goals.
- **Persistence of expand state across reloads.** Reload = fully collapsed,
  per design doc's non-goals.

**Deliberate scoping — new interim behavior specific to Slice 3:**
- **Wrapper outer size cap + internal scroll on overflow.** Per design
  doc: "If the scoped layout needs more room than the reserved rectangle,
  the wrapper keeps the same outer bounds and its content area scrolls
  locally." Applied uniformly to top-level AND nested wrappers so that
  container size never propagates bottom-up in a way that could move
  siblings. Implication: nested layouts use a fixed expanded-cell size
  (see the constants in Task 4), not a size derived from grandchildren.
- **Explorer↔canvas expand sync.** Selection-driven auto-expand
  (`selectionFilePath` watcher) now also seeds `expandedCanvasIds` so
  clicking a file in the tree opens its ancestor chain on the canvas.
  Manual folder toggling in the tree still does NOT toggle the canvas
  (per design doc: two independent expand states); only the shared
  selection path does.
- **Explorer click on a file leaves that file collapsed on the canvas.**
  Only ancestor folders auto-expand. Clicking the wrapper on the canvas
  is what opens the file's own contents. (Design doc: "the file's own
  box stays collapsed unless clicked again.")
- **Virtual (SOLL/PLAN) file wrappers.** Both today's `SOLL` view (via
  `virtual` file entries created by `buildHierarchy`) and the still-to-
  come `PLAN` view get correct wrapper rendering by construction — this
  slice does nothing SOLL/PLAN-specific.

---

## Task 1: Branch + plan doc commit

**Step 1:** Create the branch:

```bash
git checkout -b ts/slice-nested-canvas
```

**Step 2:** Commit this plan doc (already written to
`docs/plans/2026-09-09-specifyr-ts-slice-nested-canvas.md`):

```bash
git add docs/plans/2026-09-09-specifyr-ts-slice-nested-canvas.md
git commit -m "Add Slice Nested Canvas plan: wrapper boxes + hybrid layout"
```

---

## Task 2: `computeGridPlacement()` helper (TDD)

**Files:**
- Create: `frontend/composables/grid-placement.ts`
- Create: `tests/frontend/grid-placement.test.ts`

**Contract:**

```typescript
export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridPlacementOptions {
  /** Columns to lay out top-level wrappers across. */
  columns: number;
  /** Uniform cell width/height reserved per wrapper. */
  cellWidth: number;
  cellHeight: number;
  /** Horizontal + vertical gap between adjacent cells and to the canvas edges. */
  gap: number;
}

/**
 * Deterministically place top-level wrapper ids into a uniform grid.
 *
 * Ordering: ids arrive in the caller's chosen order (the page passes them
 * in the order `buildHierarchy` returned, which is already sorted
 * alphabetically with the `(no folder)` bucket last). This function
 * preserves that order — no re-sorting inside.
 *
 * The returned rectangles are absolute canvas coordinates; the first cell
 * sits at `(gap, gap)`, not the origin, so wrappers never touch the canvas
 * edge.
 */
export function computeGridPlacement(
  ids: readonly string[],
  options: GridPlacementOptions,
): Map<string, GridCell>;
```

**Tests to write (TDD — red first):**

1. Empty input → empty map.
2. Single id → single entry at `{ x: gap, y: gap, width: cellWidth, height: cellHeight }`.
3. Two ids with `columns: 2` → both in row 0, second one at `x: gap + cellWidth + gap`.
4. Three ids with `columns: 2` → first two in row 0, third at `y: gap + cellHeight + gap` in column 0.
5. Ids passed in a specific order are placed in that order (no re-sort).
6. Adjacent cells never overlap (assert `cell[n].x + cell[n].width + gap <= cell[n+1].x` for same-row neighbours; and analogously for row transitions).
7. First cell has `x >= gap` and `y >= gap` (no wrapper touches the canvas edge).
8. Determinism: two calls with the same ids + options return equal maps.

**Step 1:** Write the failing tests.

**Step 2:** Run, confirm red:

```bash
pnpm test tests/frontend/grid-placement.test.ts
```

Expected: FAIL — module not found.

**Step 3:** Implement `computeGridPlacement`. Style: match
`build-hierarchy.ts` — no Vue reactivity, `readonly` array params, minimal
comments (only where a why is non-obvious, per repo conventions).

**Step 4:** Run, confirm green. Then run the full suite too:

```bash
pnpm test tests/frontend/grid-placement.test.ts
pnpm test
```

**Step 5:** Commit:

```bash
git add frontend/composables/grid-placement.ts tests/frontend/grid-placement.test.ts
git commit -m "Add computeGridPlacement: stable alphabetical grid for top-level wrappers (TDD)"
```

---

## Task 3: Extract pure `layoutContainer()` from `useElkLayout`

**Files:**
- Modify: `frontend/composables/useElkLayout.ts`
- Create: `frontend/composables/layout-container.ts`

Reason: the nested composable needs to invoke ELK N times per render
(once per expanded container). Today's `useElkLayout` couples the ELK
call to a Vue `watchEffect` + Ref inputs. Extract the underlying async
call so both composables can share it without re-implementing the graph
conversion + result mapping.

**Contract:**

```typescript
import type { AdapterEdge, AdapterNode } from "./elk-adapter.js";

export interface ContainerLayoutInput {
  nodes: AdapterNode[];
  edges: AdapterEdge[];
  /**
   * Per-node measured size. Defaults to the constant NODE_WIDTH/NODE_HEIGHT
   * used by the current flat layout when a size is missing — same semantic
   * as `modelToElkGraph`'s constants today. The nested composable
   * overrides these per child (badge size vs. expanded-cell size).
   */
  sizeOf?: (nodeId: string) => { width: number; height: number };
}

export interface ContainerLayoutOutput {
  /** Absolute positions relative to the container's own top-left. */
  positions: Map<string, { x: number; y: number }>;
  /** Overall bounding box ELK produced for the children. */
  contentSize: { width: number; height: number };
}

/**
 * Single ELK `.layout()` call over a flat child set. Pure with respect to
 * the caller — no Vue reactivity, no cached instance state; a fresh ELK
 * instance is created per call. Suitable for both the top-level flat
 * layout (via `useElkLayout`) and the per-container nested layout (via
 * `useNestedElkLayout`).
 */
export async function layoutContainer(
  input: ContainerLayoutInput,
): Promise<ContainerLayoutOutput>;
```

**Implementation notes:**
- Move the `import ELK from "elkjs/lib/elk.bundled.js"` here.
- Reuse the existing `modelToElkGraph` + `elkResultToPositions` from
  `elk-adapter.ts`. The one behavioural change: extend `modelToElkGraph`
  to accept a per-node `sizeOf` override (defaulting to today's fixed
  `NODE_WIDTH`/`NODE_HEIGHT`). Add a small unit test for the override
  path in the existing `tests/frontend/elk-adapter.test.ts`.
- Compute `contentSize` by taking `max(x + width, y + height)` across
  the ELK-returned children.

**Refactor `useElkLayout` to delegate:**
- Keep its existing public signature (`nodes`/`edges` refs → `positions`,
  `pending`, `error`).
- Replace the inline `elk.layout(...)` call with `await layoutContainer(...)`.
- Keep the `inputKey` skip logic and the `runId` stale-run discard —
  those are Vue-side reactivity concerns, not part of the pure helper.

**Verify:**

```bash
pnpm test tests/frontend/elk-adapter.test.ts
pnpm test
pnpm typecheck
```

Existing 279 tests still green. New `sizeOf` test added.

**Commit:**

```bash
git add frontend/composables/layout-container.ts frontend/composables/useElkLayout.ts frontend/composables/elk-adapter.ts tests/frontend/elk-adapter.test.ts
git commit -m "Extract layoutContainer() from useElkLayout for reuse by nested layout"
```

---

## Task 4: `useNestedElkLayout()` composable

**Files:**
- Create: `frontend/composables/useNestedElkLayout.ts`
- Create: `tests/frontend/nested-elk-input-key.test.ts` (unit tests for
  the pure key-building helper only — the async ELK integration itself
  stays E2E-covered via the bundle guard, matching how `useElkLayout` is
  tested).

**Constants** (top of the new file, `export`ed for the test + page use):

```typescript
export const BADGE_WIDTH = 160;
export const BADGE_HEIGHT = 40;
/** Outer cap for an expanded wrapper (top-level or nested). Overflow scrolls. */
export const EXPANDED_CELL_WIDTH = 640;
export const EXPANDED_CELL_HEIGHT = 480;
/** Reserved space at the top of an expanded wrapper for its own header/label. */
export const HEADER_HEIGHT = 28;
/** Inner padding around scoped ELK children inside an expanded wrapper. */
export const CONTAINER_PADDING = 12;
```

**Contract:**

```typescript
import type { Ref } from "vue";
import type { HierarchyNode } from "./build-hierarchy.js";
import type { AdapterEdge } from "./elk-adapter.js";

export interface NestedLayoutEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

export interface UseNestedElkLayoutInput {
  hierarchy: Ref<HierarchyNode[]>;
  expandedIds: Ref<Set<string>>;
  edges: Ref<AdapterEdge[]>;
}

export interface UseNestedElkLayoutResult {
  layout: Ref<Map<string, NestedLayoutEntry>>;
  pending: Ref<boolean>;
  error: Ref<Error | undefined>;
}

export function useNestedElkLayout(
  input: UseNestedElkLayoutInput,
): UseNestedElkLayoutResult;
```

**Algorithm:**

Bottom-up recursive per render (triggered when the top-level `inputKey`
changes — see below):

1. Walk the hierarchy depth-first.
2. For a **leaf** (symbol, or collapsed folder/file):
   - Emit `{ width: BADGE_WIDTH, height: BADGE_HEIGHT }` at a placeholder
     position (filled in by the parent's layout).
3. For an **expanded folder/file wrapper**:
   - Recurse into children first (bottom-up).
   - Filter local edges to only those whose `from` AND `to` are direct
     children of this container in the hierarchy (aggregation is Slice 4;
     interim: only strictly-local edges participate).
   - Call `layoutContainer({ nodes, edges, sizeOf })` where each child's
     size comes from step 2/step 3.
   - Compute the wrapper's own size:
     `width = min(EXPANDED_CELL_WIDTH, contentSize.width + 2*CONTAINER_PADDING)`
     `height = min(EXPANDED_CELL_HEIGHT, contentSize.height + 2*CONTAINER_PADDING + HEADER_HEIGHT)`.
     If content exceeds either cap, the wrapper stays at the cap and
     internal scroll handles overflow (CSS on the wrapper node, see
     Task 5).
   - Store each child's absolute-within-wrapper position by translating
     ELK's coordinates by `(CONTAINER_PADDING, HEADER_HEIGHT + CONTAINER_PADDING)`.
4. For the **top-level list**:
   - Call `computeGridPlacement(topLevelIds, { columns, cellWidth: EXPANDED_CELL_WIDTH, cellHeight: EXPANDED_CELL_HEIGHT, gap: 24 })`.
     `columns` is a small integer derived from top-level count —
     `Math.min(topLevelCount, 4)` is fine for interim, no responsive logic
     yet.
   - For each top-level wrapper, its `x`/`y` come from the grid; its
     `width`/`height` come from its own computed step-3 size (or badge
     size if collapsed).
5. Emit a flat `Map<nodeId, { x, y, width, height, parentId? }>`.
   `parentId` is set for every non-top-level entry to the id of its
   immediate wrapper (folder or file). Top-level entries have no
   `parentId`.

**inputKey (the pure helper worth unit-testing):**

Export a helper `buildNestedInputKey(hierarchy, expandedIds, edges): string`
that returns a stable string covering:
- Every node id in the hierarchy, sorted.
- Which of those ids are currently in `expandedIds`.
- Sorted `${from}->${to}` for the edge list.

Property to test: a nested folder toggling its expand state must change
the top-level key, even when the node ids and edge endpoints are
identical. Also test: expanding folder A while folder B stays put
produces a different key than expanding both.

**Tests to write (TDD, key helper only):**

1. Empty hierarchy + empty expand set + empty edges → some stable value; two consecutive calls equal.
2. Expanding a deeply-nested folder id changes the returned key vs. same input with an empty expand set.
3. Expanding folder A only, vs. expanding folder B only (with the same hierarchy shape) → two DIFFERENT keys.
4. Same expand set represented as two different `Set` instances containing the same ids → same key (order-independent).
5. Two edges with the same endpoints but different ids → keys are still stable (design intent: edge ids don't drive layout, only endpoints do).

**Composable itself:** matches `useElkLayout`'s reactive shape — a
`watchEffect` that recomputes on `inputKey` change, guards stale results
with a `runId`, keeps the last-known-good layout on failure. No new
worker/threading concerns beyond what elkjs already imposes.

**Step 5:** Commit:

```bash
git add frontend/composables/useNestedElkLayout.ts tests/frontend/nested-elk-input-key.test.ts
git commit -m "Add useNestedElkLayout composable: bottom-up scoped ELK per container"
```

---

## Task 5: Canvas parent-node rendering + `pages/index.vue` rewrite

**Files:**
- Modify: `frontend/pages/index.vue`

This is the biggest step. The subagent implementing it must have the
design doc + this plan doc in context, must NOT redesign the layout
composable's contract, and must NOT invent new node types beyond what's
described below.

**Ordering:** do the changes in the order below; verify `pnpm typecheck`
after each numbered section.

### 5.1 Replace flat layout with nested layout

Delete:

```typescript
const layoutInput = computed(() => ({ ... }));
const { positions, pending: layoutPending } = useElkLayout({ ... });
```

Add:

```typescript
const expandedCanvasIds = reactive(new Set<string>());
watch([repoPath, view], () => expandedCanvasIds.clear());

const layoutEdges = computed(() =>
  data.value?.edges?.map((e) => ({ id: e.id, from: e.from, to: e.to })) ?? [],
);

const { layout, pending: layoutPending } = useNestedElkLayout({
  hierarchy,
  expandedIds: computed(() => expandedCanvasIds) as Ref<Set<string>>,
  edges: layoutEdges,
});
```

The header's "laying out…" indicator keeps working unchanged — it still
watches `layoutPending`.

### 5.2 Extend the selection-path watcher to seed canvas expand state

Change the existing:

```typescript
watch(selectionFilePath, (result) => {
  if (!result) return;
  for (const folderId of result.folderIds) expandedFolderIds.add(folderId);
});
```

to *also* open the canvas ancestors:

```typescript
watch(selectionFilePath, (result) => {
  if (!result) return;
  for (const folderId of result.folderIds) {
    expandedFolderIds.add(folderId);
    expandedCanvasIds.add(folderId);
  }
  // Note: the file itself stays collapsed on the canvas per design doc.
  // Clicking the wrapper on the canvas is what opens the file's contents.
});
```

### 5.3 Rewrite `flowNodes`

The new computed emits three flavours of Vue Flow node from the flat
`layout` map:

1. **Wrapper nodes** (any entry that appears as a `parentId` of another
   entry, OR any entry whose `HierarchyNode.kind` is `"folder"` or
   `"file"` — same set). For each, emit:
   ```typescript
   {
     id: <hierarchy id>,
     type: 'default',
     position: { x, y },
     data: { label: /* folder or file label */, kind: 'folder' | 'file', expanded: <bool> },
     style: { width: `${width}px`, height: `${height}px` },
     class: 'wrapper-node ' + (expanded ? 'wrapper-expanded' : 'wrapper-collapsed'),
     selectable: <hierarchyEntry.selectable>, // real module = true, virtual = false
     parentNode: <entry.parentId ?? undefined>,
     extent: entry.parentId ? 'parent' : undefined,
   }
   ```
2. **Symbol leaf nodes** (still show today's per-type colored boxes):
   emit as they do today (default type, `nodeTypeClasses(node.type)`,
   dim class based on `neighborIds` / `matchIds`), PLUS `parentNode`
   pointing at the immediate file wrapper's id and `extent: 'parent'`.
   Position + size come from the `layout` map entry for this symbol id.
3. **Symbol nodes whose wrapper is currently collapsed:** skip — do not
   emit. They will render again once the wrapper is expanded.

Preserve today's dimming (`opacity-30`) rules for the visible symbol
leaves. Wrappers themselves are not dimmed by search/selection.

**Vue Flow order requirement:** parent nodes must appear in the
`nodes` array *before* their children. Sort the emitted array by
"parent-depth ascending" (top-level wrappers first, then their
children, etc.). A stable way: walk the hierarchy in the order used by
the layout, emitting parents before descending. Verify by watching for
Vue Flow's console warning "parent node ... not found" — it must not
fire.

### 5.4 Rewrite `flowEdges` (interim, no aggregation)

An edge is visible iff BOTH endpoints appear as visible symbol or
wrapper nodes in this render's `flowNodes` set (i.e. either a top-level
wrapper or something inside an expanded ancestor chain). Drop the rest
silently — a comment above the `.filter` must explicitly cite
"Slice 4: edge aggregation" so nobody thinks this is the final story.

Selection-dim rules for surviving edges stay identical to today.

### 5.5 Wire wrapper click → expand/collapse

Extend `onNodeClick`:

```typescript
function onNodeClick({ node }: NodeMouseEvent): void {
  if (node.data?.kind === 'folder' || node.data?.kind === 'file') {
    if (expandedCanvasIds.has(node.id)) expandedCanvasIds.delete(node.id);
    else expandedCanvasIds.add(node.id);
    // A real-module file wrapper is also a selectable node; keep that
    // dual behavior — toggle expansion AND set selectedNodeId when the
    // wrapper is selectable.
    if (node.selectable) selectedNodeId.value = node.id;
    return;
  }
  selectedNodeId.value = node.id;
}
```

`onPaneClick` unchanged.

### 5.6 Explorer selection → fit camera to wrapper

The existing `onExplorerSelect` calls `fitView({ nodes: [nodeId], ... })`.
Now that wrappers exist and the file's own wrapper stays collapsed, the
target node id passed to `fitView` should be the *file wrapper id*
(`selectionFilePath.value?.fileId`) when the selection is a symbol —
otherwise Vue Flow will try to fit to a symbol that isn't in
`flowNodes`. Change:

```typescript
function onExplorerSelect(nodeId: string | undefined): void {
  selectedNodeId.value = nodeId;
  const fitId = nodeId
    ? (findFilePath(hierarchy.value, nodeId)?.fileId ?? nodeId)
    : undefined;
  if (fitId) void fitView({ nodes: [fitId], duration: 400, padding: 0.3 });
}
```

Search's Enter jump keeps its current logic; the "search-jumps-into-
collapsed" case is an explicit Slice 5 non-goal.

### 5.7 CSS additions (single `<style>` block at bottom of file)

Add:

```css
.wrapper-node.vue-flow__node-default {
  border-radius: 0.5rem;
  border-width: 1px;
  border-color: rgb(212 212 216); /* zinc-300 */
  background: rgba(244, 244, 245, 0.6); /* zinc-100 @ 60% */
  padding: 0;
  text-align: left;
  overflow: hidden; /* CSS scroll on overflow — matches design doc's local scroll */
}
.wrapper-node.wrapper-expanded.vue-flow__node-default {
  overflow: auto;
}
.wrapper-node.wrapper-collapsed.vue-flow__node-default {
  min-width: 160px;
  padding: 0.5rem;
  text-align: center;
  font-size: 0.75rem;
}
```

The existing `.soll-node.vue-flow__node-default` rule stays for symbol
leaves.

**Verify (whole task):**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter specifyr-frontend build
```

Manual smoke test (open editor against the specifyr repo itself,
`pnpm specifyr editor .`):
- Initial load: canvas shows top-level folder wrappers only, all
  collapsed (small badges), positioned in a stable alphabetical grid.
- Click a folder wrapper → it expands, its immediate children (subfolders
  as badges, files as badges) appear inside. Other top-level wrappers
  never move.
- Click a file wrapper (a `.ts` file) → the wrapper expands, its symbols
  appear inside.
- Click a symbol inside the expanded file → sidebar Details + Neighbors
  populate.
- Click a file in the Explorer tree → the canvas auto-expands the
  ancestor folder chain, camera fits to the file's wrapper, the file's
  own wrapper stays collapsed.
- Click a folder in the Explorer tree → tree expands only; canvas
  is NOT toggled (independence per design doc).

**Commit:**

```bash
git add frontend/pages/index.vue
git commit -m "Render canvas as nested wrapper boxes with hybrid grid+ELK layout"
```

---

## Task 6: Code-review checkpoint

Dispatch `superpowers:code-reviewer` on the Task 2-5 commits. Focus:

- **Grid determinism.** `computeGridPlacement` output is identical across
  runs, and adjacent cells cannot overlap for any (columns, cellWidth,
  cellHeight, gap) tuple with all positive values.
- **`inputKey` correctness for nested composable.** A nested expansion
  MUST change the top-level key. A sibling expansion that doesn't affect
  the same subtree can still legitimately change the key (a stricter
  per-subtree caching is a future polish, not a Slice 3 correctness
  concern).
- **Bottom-up ordering.** Reviewer must confirm the traversal handles a
  container whose expanded child is itself expanded — the deepest
  container's ELK layout completes before its parent's ELK layout starts.
  A race here (starting the ancestor's layout before its child's promise
  resolves) would size ancestors from stale child sizes.
- **`layoutContainer` purity.** No hidden global state; creating a new
  ELK instance per call is intentional (elkjs's bundled build resolves
  to an in-thread FakeWorker, no thread pool to reuse). This matches
  the existing `useElkLayout` note in the file.
- **Vue Flow parent-node order.** `flowNodes` emits parents strictly
  before children. Confirm no console warning "parent node not found"
  fires during the manual smoke test.
- **Explorer↔canvas expand-state independence.** Confirm the
  `expandedCanvasIds.clear()` on `[repoPath, view]` change AND that
  manual tree folder toggles do NOT touch `expandedCanvasIds`.
- **Selection-driven auto-expand seeds BOTH sets.** Confirm the
  `selectionFilePath` watcher adds to both `expandedFolderIds` AND
  `expandedCanvasIds`, and that this fires for canvas selection changes,
  Explorer selection changes, AND search jumps (i.e. it watches the
  derived `selectionFilePath`, not a click-source-specific path).
- **File wrapper stays collapsed on Explorer click.** Ancestor folders
  open on the canvas; the file's own wrapper does NOT.
- **Interim edge filter is documented as interim.** Confirm the comment
  cites Slice 4 explicitly.
- **`useElkLayout` behaviour unchanged.** Its callers (none other than
  Task 5's deletion) still see the same public shape; the extraction of
  `layoutContainer` is a pure refactor. The existing 279 baseline tests
  still pass.
- **CSS scoping.** New `.wrapper-node.*` rules do not leak into
  `.soll-node`. Both live in the same `<style>` block.

Apply approved suggestions before proceeding.

---

## Task 7: E2E bundle-content guard

**Files:**
- Modify: `tests/cli/editor-ist-integration.test.ts`

**Step:** Append a sibling assertion after the existing Explorer guard:

```typescript
// Nested canvas sanity check: the wrapper-node CSS class + at least one
// nested-layout constant must survive into the JS/CSS bundles. A
// regression that reverted to the flat canvas layout would silently ship
// today's disconnected wall of tiles again — this catches that.
const anyMentionsWrapperCss = cssBundles.some((name) => {
  const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
  return content.includes("wrapper-node");
});
expect(anyMentionsWrapperCss).toBe(true);

const anyMentionsNestedLayout = bundles.some((name) => {
  const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
  return content.includes("expandedCanvasIds") || content.includes("useNestedElkLayout");
});
expect(anyMentionsNestedLayout).toBe(true);
```

Rebuild first, verify the markers actually survive minification before
trusting the assertion:

```bash
pnpm --filter specifyr-frontend build
grep -l "wrapper-node" frontend/.output/public/_nuxt/*.css
grep -l -E "expandedCanvasIds|useNestedElkLayout" frontend/.output/public/_nuxt/*.js
```

If Vite mangles the composable name, fall back to a template literal that
the composable exports and that Vite can't inline away — e.g. the string
`"parentNode"` will appear near the flowNodes construction, but that's
too generic; prefer a distinctive class or aria label from the CSS block
above.

**Commit:**

```bash
git add tests/cli/editor-ist-integration.test.ts
git commit -m "Guard nested canvas wrapper CSS + composable in bundle"
```

---

## Task 8: README + green + push + PR

**Files:**
- Modify: `README.md`

**Step 1:** Under `## Status`, add a new line and move the `(current)`
marker:

```text
Slice Nested Canvas (current): the canvas now renders as nested wrapper boxes — folders contain files contain symbols — starting fully collapsed. Top-level wrapper positions are a stable alphabetical grid, unaffected by expand state; inside each expanded wrapper, ELK's layered algorithm runs scoped to just that container's children. Third slice of the Explorer/Canvas/Details redesign (docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md). ✅
```

Move `(current)` off Slice Explorer Tree.

**Step 2:** Green gate:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Step 3:** Commit, push, open PR. PR body:
- Summarize the three moving parts (grid, `layoutContainer` extraction,
  `useNestedElkLayout`).
- Link the design doc AND this plan doc.
- Call out the two deliberate interim behaviours (edges dropped when
  hidden inside collapsed wrappers; search-jump-into-collapsed left
  as-is) with pointers to Slices 4 + 5.
- Include a screenshot / short animation of collapsed→expand→sibling-
  stays-put if easy; the whole point of this slice is "expanding folder
  A never moves folder B" and a picture proves it fastest.

```bash
git add README.md
git commit -m "docs: bump README status to Slice Nested Canvas"
git push -u origin ts/slice-nested-canvas
gh pr create --title "Slice Nested Canvas: nested wrapper boxes + hybrid grid/ELK layout" --body "$(cat <<'EOF'
## Summary
- Replaces the flat canvas with nested wrapper boxes built from the same buildHierarchy() the Explorer tree uses.
- Top-level wrappers sit in a stable alphabetical grid; inside each expanded wrapper, ELK runs scoped to just that container's children.
- Canvas starts fully collapsed. Clicking a wrapper toggles expansion; clicking a file in the Explorer auto-expands the ancestor chain on the canvas and fits the camera.

Third slice of the Explorer/Canvas/Details redesign — design doc [docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md](docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md), plan [docs/plans/2026-09-09-specifyr-ts-slice-nested-canvas.md](docs/plans/2026-09-09-specifyr-ts-slice-nested-canvas.md).

## Interim behavior (documented, deliberate)
- Edges whose endpoints are hidden inside collapsed wrappers are dropped from the canvas render. Real aggregation lands in Slice 4.
- Search's Enter jump doesn't auto-expand ancestors yet. That's Slice 5.

## Test plan
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [ ] Manual: initial load = top-level folder badges only, alphabetical grid
- [ ] Manual: expand folder A, sibling folder B stays put
- [ ] Manual: expand a `.ts` file wrapper, symbols appear inside
- [ ] Manual: click a file in the Explorer, canvas expands ancestors + fits, file stays collapsed
- [ ] Manual: manual folder toggle in the tree does NOT toggle the canvas
EOF
)"
```

---

## Post-merge (not part of the plan's task list — user handles this)

Once CodeRabbit is happy and the PR is merged:

1. `git checkout main && git pull`
2. `pnpm build`
3. **Restart** the running editor on port 3939 (kill the node process and
   respawn it — `pnpm build` alone doesn't update the running instance;
   this has burned this project twice already, see the auto-memory note
   `feedback_editor_rebuild_needs_restart`).
4. Verify with `curl` that the served bundle contains `wrapper-node`.

---

## Execution notes for the subagent chain

- Baseline (main tip `5a0f607`): 279 tests, 39 files.
- Task 2 is pure TDD (grid helper), one implementer subagent.
- Task 3 is a mechanical refactor + one new test (sizeOf override), one
  implementer subagent. Must keep existing tests green — no behavioural
  changes to `useElkLayout`'s public shape.
- Task 4 is the nested composable + input-key unit tests, one implementer
  subagent. The bottom-up traversal is the trickiest piece; the reviewer
  in Task 6 checks it explicitly.
- Task 5 is the canvas rewrite — biggest chunk of this slice. Provide the
  implementer both the design doc and this plan doc; do NOT let it
  redesign the composable contracts from Tasks 2-4.
- Task 6 is the review checkpoint. Do NOT skip.
- Task 7 is one-file additive; verify markers survive minification
  before trusting the assertions.
- Task 8 wraps up.
- Do NOT touch `plans/005-*.md` or `plans/006-*.md` at the repo root —
  those belong to a parallel process and are not part of this branch's
  scope.
- Do NOT restart the editor on port 3939 mid-execution; that's a
  post-merge step the user handles.
