# Slice Edge Aggregation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Real `imports` edges whose endpoints are hidden inside a collapsed
wrapper are no longer dropped from the canvas — they resolve upward to
their nearest visible ancestor and are deduped so the canvas shows a
single edge between each pair of visible containers. Fixes the current
Slice 3 interim where cross-container dependencies vanished entirely once
a folder was collapsed.

**Architecture:**
- One new pure helper `buildParentMap(hierarchy)` returns a
  `Map<childId, parentId | undefined>` over every hierarchy id — added to
  `frontend/composables/build-hierarchy.ts` alongside the existing pure
  helpers (`buildHierarchy`, `findFilePath`).
- One new pure module `frontend/composables/edge-aggregation.ts` exports:
  - `resolveVisibleEndpoint(nodeId, parentOf, visibleIds)` — walks up the
    parent chain until it finds an id that is in `visibleIds`. Returns
    `undefined` for an unknown id.
  - `aggregateEdges(edges, parentOf, visibleIds)` — resolves both
    endpoints of every edge, drops the ones that end up as self-loops,
    dedupes the rest by `(from, to)` pair, and returns
    `AggregatedEdge[]` (a small record with a stable id, from/to, and a
    `count` of how many raw edges backed each aggregated one).
- `pages/index.vue`'s `flowEdges` computed swaps its current "drop when
  endpoint hidden" filter for the new `aggregateEdges` call — the
  Neighbors sidebar keeps operating on the full raw edge list (design
  doc: "aggregation is a canvas-only concept").

**Tech Stack:** TypeScript, Vitest. No Vue reactivity, no ELK, no CSS —
this is pure model work plus a small computed wiring change.

**Reference — the redesign this fits into:**
`docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md`, section
"Edge aggregation". This is slice 4 of the 5-slice breakdown. Slices 1-3
plus a canvas-polish PR have shipped; the current `flowEdges` filter in
`frontend/pages/index.vue` already carries a "Slice 4" TODO comment
pointing at this work.

**Deliberate scoping — NOT in this slice:**
- **Aggregated-edge count badges / distinct visual style for aggregates.**
  The `count` field is emitted for future use but not rendered. Same
  smoothstep-arrow style as Slice 3 keeps everything consistent while
  aggregation is being validated. A count badge or thickness variation
  is a natural polish follow-up.
- **Slice 5's search auto-expand.** Aggregation does not change search
  behavior; deferred.
- **Symbol-to-symbol edges** (calls, extends/implements). Symbols still
  have no edges of their own. Aggregation code only sees the `imports`
  edges the extractor emits.
- **A separate `AggregatedEdge` type in the SOLL/PLAN/IST core model.**
  Aggregation is purely a rendering derivative recomputed on every
  expand/collapse — nothing to persist, nothing to add to
  `src/core/schemas.ts`.
- **Neighbors sidebar changes.** Sidebar keeps working on raw
  module-level edges via the existing `neighborsOf` composable.

---

## Task 1: Branch + plan doc commit

**Step 1:** Confirm PR #25 (`ts/canvas-wrapper-scroll-fix`) is merged to
`main` before branching — this slice starts from that tip. If it isn't
merged yet, either wait or rebase onto its merge commit after the fact.

**Step 2:** Create the branch:

```bash
git checkout main && git pull
git checkout -b ts/slice-edge-aggregation
```

**Step 3:** Commit this plan doc:

```bash
git add docs/plans/2026-09-09-specifyr-ts-slice-edge-aggregation.md
git commit -m "Add Slice Edge Aggregation plan: resolve hidden endpoints to visible ancestors"
```

---

## Task 2: `buildParentMap()` helper (TDD)

**Files:**
- Modify: `frontend/composables/build-hierarchy.ts` (add function; do not touch existing exports)
- Modify: `tests/frontend/build-hierarchy.test.ts` (add a `describe("buildParentMap")` block)

**Contract:**

```typescript
/**
 * Flatten a hierarchy tree into a lookup from each node id to its
 * immediate parent id. Top-level entries map to `undefined`. Every id
 * in the hierarchy is a key exactly once.
 */
export function buildParentMap(
  hierarchy: readonly HierarchyNode[],
): Map<string, string | undefined>;
```

**Tests to write (TDD — red first):**

1. Empty hierarchy → empty map.
2. Single top-level file → one entry `{ <id>: undefined }`.
3. File nested in a folder → folder maps to `undefined`, file maps to folder's id.
4. File nested 3 folders deep → each folder maps to its parent folder id, deepest folder's id maps to its parent, file id maps to the deepest folder id.
5. Symbol nested in a file nested in a folder → symbol id maps to file id (not folder id); file id maps to folder id.
6. Two files in the same folder → both files map to the folder id.
7. Pathless symbol (under the synthetic `(no folder) → (no file)` chain) → symbol id maps to the `(no file)` id, `(no file)` maps to `(no folder)` id, `(no folder)` maps to `undefined`.
8. Every id from the hierarchy appears in the map exactly once — assert `map.size === totalNodeCount`.

**Step 1:** Write failing tests.

**Step 2:** Run, confirm red:

```bash
pnpm test tests/frontend/build-hierarchy.test.ts
```

Expected: FAIL — function not defined.

**Step 3:** Implement `buildParentMap`. Style: pure, `readonly` array
param, no comments unless the why is non-obvious. Mirror `findFilePath`'s
recursive shape.

**Step 4:** Run, confirm green + full suite green:

```bash
pnpm test tests/frontend/build-hierarchy.test.ts
pnpm test
```

**Step 5:** Commit:

```bash
git add frontend/composables/build-hierarchy.ts tests/frontend/build-hierarchy.test.ts
git commit -m "Add buildParentMap: flat child-to-parent id lookup over a hierarchy tree (TDD)"
```

---

## Task 3: `resolveVisibleEndpoint()` + `aggregateEdges()` (TDD, single file)

**Files:**
- Create: `frontend/composables/edge-aggregation.ts`
- Create: `tests/frontend/edge-aggregation.test.ts`

**Contract:**

```typescript
import type { Edge } from "specifyr";

/**
 * Walk up the parent chain from `nodeId` until finding an id that is in
 * `visibleIds`. Returns `undefined` for an id that is unknown to
 * `parentOf` (defensive — the caller should not usually hit this).
 */
export function resolveVisibleEndpoint(
  nodeId: string,
  parentOf: ReadonlyMap<string, string | undefined>,
  visibleIds: ReadonlySet<string>,
): string | undefined;

export interface AggregatedEdge {
  /** Stable id: raw edge id when unchanged, `agg:${from}->${to}` when aggregated or deduped. */
  id: string;
  from: string;
  to: string;
  /** Number of raw edges this aggregate represents (>= 1). */
  count: number;
}

/**
 * Resolve every real edge's endpoints to their visible ancestors, drop
 * self-loops (both endpoints resolve to the same visible container),
 * dedupe by resulting `(from, to)` pair. Purely a rendering derivative —
 * the raw `edges` array is untouched.
 *
 * An edge whose either endpoint is unknown (no entry in `parentOf`, so
 * `resolveVisibleEndpoint` returns undefined) is silently dropped.
 */
export function aggregateEdges(
  edges: readonly Edge[],
  parentOf: ReadonlyMap<string, string | undefined>,
  visibleIds: ReadonlySet<string>,
): AggregatedEdge[];
```

**Tests to write for `resolveVisibleEndpoint` (TDD — red first):**

1. Top-level id in `visibleIds` → returns itself.
2. Direct child of visible parent, child itself visible → returns child's own id.
3. Direct child of visible parent, child NOT in `visibleIds` → returns parent id.
4. Three-deep descendant, only top-level visible → returns top-level id.
5. Three-deep descendant, all ancestors and self visible → returns self.
6. Unknown id (not a key in `parentOf`) → returns `undefined`.
7. Node whose ancestor chain terminates at `undefined` and no ancestor was ever in `visibleIds` → returns `undefined` (shouldn't happen in practice since top-level ids are always rendered, but the function must not throw).

**Tests to write for `aggregateEdges`:**

1. Empty edges array → empty result.
2. Single edge, both endpoints in `visibleIds` → single aggregate `{ id: <raw id>, from, to, count: 1 }`.
3. Single edge, `from` is a child of a collapsed folder → `from` resolves to the folder; `to` unchanged; `id === "agg:${folderId}->${to}"`; `count: 1`.
4. Two edges from different children of the same collapsed folder to different visible endpoints → two aggregated edges (different `to`s).
5. Two edges between children of the same two collapsed folders → one aggregated edge with `count: 2`, ids sorted / deduped consistently.
6. Edge whose both endpoints resolve to the same visible container (e.g. two symbols in the same collapsed file) → dropped (no self-loop).
7. Edge with an unknown endpoint (`from` not in `parentOf`) → dropped, no throw.
8. Determinism: same input yields the same aggregated array (order + ids), so Vue Flow's keyed rendering stays stable across renders.
9. `count` order-independence: two edges A→B and B→A between different collapsed pairs stay as two separate aggregates (direction matters — imports are directed).

**Step 1:** Write failing tests.

**Step 2:** Run, confirm red:

```bash
pnpm test tests/frontend/edge-aggregation.test.ts
```

Expected: FAIL — module not found.

**Step 3:** Implement both helpers. Style: pure, `Readonly*` types on all
params, no Vue, minimal comments. Use `Node`/`Edge` types imported from
the `specifyr` package (matches how `neighbors.ts` does it).

**Step 4:** Green + full suite:

```bash
pnpm test tests/frontend/edge-aggregation.test.ts
pnpm test
```

**Step 5:** Commit:

```bash
git add frontend/composables/edge-aggregation.ts tests/frontend/edge-aggregation.test.ts
git commit -m "Add edge aggregation: resolveVisibleEndpoint + aggregateEdges (TDD)"
```

---

## Task 4: Wire aggregation into `pages/index.vue`

**Files:**
- Modify: `frontend/pages/index.vue`

### 4.1 Compute the parent map alongside the hierarchy

Below the existing `hierarchy` computed, add:

```typescript
const parentOf = computed<Map<string, string | undefined>>(() =>
  buildParentMap(hierarchy.value),
);
```

Import `buildParentMap` from `../composables/build-hierarchy.js` (same
import block that already brings in `buildHierarchy`, `findFilePath`).

### 4.2 Replace the interim drop-filter

Change the `flowEdges` computed body. Delete:

```typescript
const visibleIds = new Set(flowNodes.value.map((n) => n.id));
return data.value.edges
  // Slice 4: edge aggregation. [comment block]
  .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
  .map((edge) => { ... });
```

Replace with:

```typescript
const visibleIds = new Set(flowNodes.value.map((n) => n.id));
const aggregated = aggregateEdges(data.value.edges, parentOf.value, visibleIds);
return aggregated.map((edge) => {
  const dim =
    Boolean(selectedId) &&
    edge.from !== selectedId &&
    edge.to !== selectedId;
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: "smoothstep",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#71717a", width: 16, height: 16 },
    style: { stroke: "#71717a", strokeWidth: 1.5 },
    class: dim ? "opacity-20" : "",
  };
});
```

Import `aggregateEdges` from `../composables/edge-aggregation.js`.

**Note on the `edge.type !== "imports"` guard removed above:** the raw
dim logic used it to keep every `imports` edge un-dimmed regardless of
selection. That was a workaround for the current single-edge-type world
(pointless to dim imports edges from a non-selected node while there
are only imports edges); it can come back as-is once Slice C+ introduces
extends/implements or symbol-to-symbol edges. Confirming with the
reviewer that this simplification is intentional for now.

Actually — keep the existing dim behavior verbatim. Do NOT delete the
`edge.type !== "imports"` check. Since `AggregatedEdge` doesn't carry a
`type` field yet, use a helper: track raw-edge types by resolved pair
and dim only when all backing raw edges are non-`imports`. Simplest
interim: since only `imports` exists today, every aggregated edge is
effectively an imports aggregate, so keep the same "never dim imports"
semantic by omitting the type check entirely — same practical outcome
today, cleaner code.

**Decision:** omit the type check (as in the replacement snippet above).
Update the surrounding comment to note that once mixed edge types
exist, `AggregatedEdge` should gain a discriminator (either a `type`
field for pure aggregates, or a `types: Set<string>` for mixed).

### 4.3 Verify

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter specifyr-frontend build
```

Manual smoke test (`pnpm specifyr editor .` against the specifyr repo):
- Load, expand `src` — every top-level folder shows connections through the arrows to `src`'s children instead of a blank canvas.
- Collapse `src/storage` back → edges into `src/storage`'s files now terminate at the `src/storage` wrapper instead of vanishing.
- Confirm no self-loops (edges going from a wrapper back to itself) appear anywhere.
- Confirm the Neighbors sidebar for a selected symbol still lists its real module-level imports/importers, unchanged by any expand/collapse.

**Commit:**

```bash
git add frontend/pages/index.vue
git commit -m "Aggregate hidden edges to their visible ancestor wrappers on the canvas"
```

---

## Task 5: Code-review checkpoint

Dispatch `superpowers:code-reviewer` on the Task 2-4 commits. Focus:

- **`buildParentMap` covers every id, including synthesized folder / file / no-folder / no-file ids.** A missed id becomes an aggregation crash source.
- **`resolveVisibleEndpoint` termination.** The while-loop must terminate on every input — even a cyclic `parentOf` (should be impossible from a tree, but defensive guard would be worth a `visited` set OR a bounded loop). Reviewer decides whether the tree-input contract is enough.
- **`aggregateEdges` dedup key.** `${from}\0${to}` (or JSON, or a Map) — assert the key can't collide across id shapes (`folder:src` vs `folder:src\0` etc.).
- **Self-loop drop applies AFTER endpoint resolution, not before.** A raw self-loop in the source model is impossible per the existing extractor (Slice B's `${from}::${to}::type` gate), but aggregation is where self-loops arise (two symbols in the same collapsed file).
- **`count` field is >= 1 for every emitted aggregate.** Zero-count would be an aggregation bug.
- **Determinism across renders.** Reviewer confirms the emitted id + order is stable across two calls with equal (edges, parentOf, visibleIds), so Vue Flow's keyed rendering doesn't churn.
- **`flowEdges` still runs per render.** The wiring must not introduce an extra async layer — aggregation is synchronous and cheap enough to run in the same computed as the existing edge mapping.
- **Neighbors sidebar untouched.** `neighborsOf` in `frontend/composables/neighbors.ts` still receives raw edges, not aggregated ones.
- **Slice discipline.** No badges, no per-aggregate styling, no new node types, no changes to Vue Flow's parent-node handling.

Apply approved suggestions before proceeding.

---

## Task 6: README + green + push + PR

**Files:**
- Modify: `README.md`

**Step 1:** Under `## Status`, add a new line and move the `(current)`
marker off `Canvas polish`:

```text
Slice Edge Aggregation (current): edges no longer vanish when their endpoints hide inside a collapsed wrapper — every real imports edge resolves upward to its nearest visible ancestor, self-loops are dropped, duplicates dedup to a single visible edge. Fourth slice of the Explorer/Canvas/Details redesign (docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md). ✅
```

**Step 2:** Green gate:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Step 3:** Commit + push + open PR:

```bash
git add README.md
git commit -m "docs: bump README status to Slice Edge Aggregation"
git push -u origin ts/slice-edge-aggregation
gh pr create --title "Slice Edge Aggregation: hidden endpoints resolve to visible ancestors" --body "..."
```

PR body:
- Summarize the three moving parts (`buildParentMap`, `resolveVisibleEndpoint`, `aggregateEdges`).
- Link the design doc AND this plan doc.
- Note the explicit non-goals (no count badges, no per-aggregate styling, no type discriminator yet — deferred pending mixed edge types).
- Include a before/after screenshot of an expanded folder chain: before = arrows dead-end at the collapsed folder, after = arrows terminate at visible wrapper ancestors.

---

## Post-merge (user handles this)

Once CodeRabbit is happy and the PR is merged:

1. `git checkout main && git pull`
2. `pnpm build`
3. Kill the CLI wrapper process on port 3939 (`kill $(ps -o ppid= -p "$(lsof -ti:3939)")`), respawn with `node dist/cli/index.js editor <path> --port 3939 --no-open`.
4. `curl` the served bundle for `edge-aggregation` or equivalent post-minification marker — verify the new chunk is live before telling the user to reload.

---

## Execution notes for the subagent chain

- Baseline (post-merge of PR #25, expected main tip): 296 tests, 41 files.
- Task 2 is pure TDD (parent map), one implementer subagent.
- Task 3 is two related helpers TDD'd together in one new file, one implementer subagent. The tests for `aggregateEdges` are the largest chunk — the subagent must cover the dedup + self-loop cases explicitly.
- Task 4 is the wiring change in `pages/index.vue`, one implementer subagent. Small, keeps existing edge styling untouched.
- Task 5 is the code review checkpoint. Do NOT skip.
- Task 6 wraps up.
- Do NOT touch `plans/005-*.md` or `plans/006-*.md` at the repo root — parallel process, out of scope.
- Do NOT restart the editor on port 3939 mid-execution; that's a post-merge step the user handles.
