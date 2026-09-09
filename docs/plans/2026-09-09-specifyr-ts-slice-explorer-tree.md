# Slice Explorer Tree Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** A left-hand Explorer pane renders the folder/file structure of the
current view (SOLL or IST) as a plain, collapsible tree — built from
`buildHierarchy()` (already shipped in Slice Hierarchy Data). Clicking a file
selects it (reusing the existing flat-canvas selection machinery — sidebar,
neighbors, dimming, camera fit). The tree also reacts to selections made
elsewhere (canvas click, search jump): it auto-expands the path to and
highlights whichever file currently owns the selection. No canvas rendering
changes in this slice — the canvas stays the existing flat graph.

**Architecture:** One new pure helper, `findFilePath()`, added to
`build-hierarchy.ts` (finds the ancestor-folder chain + owning file for any
node id in the hierarchy). One new recursive component,
`ExplorerTree.vue`, rendering folders and files only (never symbols — the
tree is a coarse navigation aid, not a second place for the "wall of tiles"
problem to reappear). `pages/index.vue` gains a third pane, wires
`selectedNodeId` bidirectionally between tree and existing canvas/sidebar,
and owns the tree's expand state as a shared `reactive(Set)`.

**Tech Stack:** Vue 3 (recursive SFC + `reactive` Set for shared mutable
expand state), existing Vue Flow `fitView`, Tailwind, Vitest.

**Reference — the redesign this fits into:**
`docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md` (validated
design). This is slice 2 of the suggested 5-slice breakdown at the bottom of
that doc. Slice 1 (`buildHierarchy`, `path` field) already shipped
(`docs/plans/2026-09-08-specifyr-ts-slice-hierarchy-data.md`, PR #20).

**Important scoping note — deliberate interim behavior:** The design doc's
"Explorer click on a file → canvas opens the path down to that file's
wrapper box" describes behavior that needs the nested canvas wrapper boxes
from Slice 3, which don't exist yet. In THIS slice, clicking a file in the
tree instead reuses what already exists: it sets `selectedNodeId` (driving
today's flat-canvas dimming/sidebar/neighbors) and calls the same `fitView`
Search already uses to pan the camera to it. Once Slice 3 lands, this
naturally upgrades — no rework of the tree's click handler is expected, only
of what "fit the camera" ends up meaning once wrapper boxes exist.

**Non-goals (this slice specifically, beyond the design doc's own list):**
- Canvas wrapper boxes / hybrid layout / edge aggregation — Slices 3-4.
- Auto-scrolling the highlighted tree row into view. Auto-expand + visual
  highlight satisfy "always know where you are"; scrolling is a polish item
  for later if the tree ever gets long enough to need it.
- Symbol counts / badges on file rows in the tree (that's specifically a
  canvas wrapper-box detail per the design doc, not a tree detail).
- Keyboard arrow-key tree navigation — click-only, matching how the rest of
  this editor (canvas, sidebar) has no keyboard nav either.
- Full ARIA `role="tree"`/`role="treeitem"` semantics — a plain labelled
  `<nav>` + nested `<ul>/<li>/<button>` list, mirroring the existing
  Neighbors sidebar list pattern already in this file. Simpler, consistent
  with precedent, no `aria-level`/`aria-posinset` bookkeeping to get wrong.

---

## Task 1: Branch + plan doc

```bash
git add docs/plans/2026-09-09-specifyr-ts-slice-explorer-tree.md
git commit -m "Add Slice Explorer Tree plan: left-hand folder/file navigation"
```

---

## Task 2: `findFilePath` helper (TDD)

**Files:**
- Modify: `frontend/composables/build-hierarchy.ts` (add the function, do not touch `buildHierarchy` itself)
- Modify: `tests/frontend/build-hierarchy.test.ts` (add a new `describe("findFilePath")` block)

**Contract:**

```typescript
export interface FilePathResult {
  /** Ancestor folder ids from top level down to (not including) the file, in order. */
  folderIds: string[];
  /** The id of the file entry that owns `nodeId` — itself, if `nodeId` was a file. */
  fileId: string;
}

export function findFilePath(
  hierarchy: readonly HierarchyNode[],
  nodeId: string,
): FilePathResult | undefined;
```

**Algorithm:**

Recursively search `hierarchy`. For each entry, in order:
- `kind === "file"`: if `entry.id === nodeId`, or any of `entry.children`
  has `.id === nodeId` (a symbol inside this file), this file is the match —
  return `{ folderIds: [], fileId: entry.id }` up to the caller.
- `kind === "folder"`: recursively search `entry.children`. If a match comes
  back, prepend `entry.id` to the returned `folderIds` and propagate it up.
- No match at this entry → try the next sibling.

If nothing matches anywhere in `hierarchy`, return `undefined`. This can
legitimately happen (e.g. `selectedNodeId` references a node that isn't in
the current view's node list — shouldn't happen in practice since selection
only ever comes from nodes actually in `data.value.nodes`, but the function
must not throw on an unknown id).

**Tests to write (TDD — red first):**

- Node id matches a root-level file directly (no enclosing folder) → `{ folderIds: [], fileId: <that id> }`.
- Node id matches a file nested one folder deep → `folderIds` has exactly that one folder id.
- Node id matches a file nested 3+ folders deep → `folderIds` has every intermediate folder id, in top-to-bottom order (assert the literal array, not just its length).
- Node id matches a **symbol** inside a file (not the file's own id) → same result shape as if the file itself were selected: `fileId` is the *owning file's* id, not the symbol's.
- Node id matches a **virtual** (non-selectable, SOLL/PLAN) file directly → still resolves correctly; `findFilePath` doesn't care whether a file is real or virtual, only about tree position.
- A pathless symbol under the synthetic `(no folder)/(no file)` bucket → resolves to `{ folderIds: ["folder:\0no-path"], fileId: "file:\0no-path" }` (reuse whatever sentinel constant `buildHierarchy` already defines internally — check the file for the actual exported/shared constant rather than re-deriving the literal `"\0no-path"` string in the test).
- Node id that doesn't exist anywhere in the hierarchy → `undefined`.
- Empty hierarchy (`[]`) + any node id → `undefined`.

**Step 1: Write failing tests. Step 2: run, confirm red:**

```bash
pnpm test tests/frontend/build-hierarchy.test.ts
```

**Step 3: Implement `findFilePath`.** Style: match the rest of
`build-hierarchy.ts` — no Vue reactivity, `readonly` array params, minimal
comments.

**Step 4: Run, confirm green. Run the full suite too:**

```bash
pnpm test tests/frontend/build-hierarchy.test.ts
pnpm test
```

**Step 5: Commit**

```bash
git add frontend/composables/build-hierarchy.ts tests/frontend/build-hierarchy.test.ts
git commit -m "Add findFilePath helper: locate a node's owning file + ancestor folders (TDD)"
```

---

## Task 3: `ExplorerTree.vue` component + page wiring

**Files:**
- Create: `frontend/components/ExplorerTree.vue`
- Modify: `frontend/pages/index.vue`

This is the first component this project extracts out of `pages/index.vue`
— `frontend/components/` doesn't exist yet, create it. Nuxt auto-imports
everything under `components/`, including for recursive self-reference (no
explicit import needed inside the component's own `<script setup>`, and
none needed in `index.vue` either — just use the `<ExplorerTree>` tag).

### `ExplorerTree.vue`

```vue
<script setup lang="ts">
import type { HierarchyNode } from "../composables/build-hierarchy.js";

const props = defineProps<{
  entries: HierarchyNode[];
  highlightedFileId: string | undefined;
  /**
   * Shared mutable expand state — a single `reactive(Set)` created once by
   * the page and passed unchanged through every recursive instance. Mutating
   * it in place (not reassigning) is the intended pattern here: it avoids
   * emit-bubbling a "toggle" event up through every recursion level for
   * what is otherwise page-level shared state.
   */
  expandedIds: Set<string>;
}>();

const emit = defineEmits<{
  select: [nodeId: string | undefined];
}>();

function onFolderClick(entry: HierarchyNode): void {
  if (props.expandedIds.has(entry.id)) props.expandedIds.delete(entry.id);
  else props.expandedIds.add(entry.id);
}

function onFileClick(entry: HierarchyNode): void {
  emit("select", entry.selectable ? entry.id : undefined);
}
</script>

<template>
  <ul class="space-y-0.5 pl-3 first:pl-0">
    <li v-for="entry in entries" :key="entry.id">
      <template v-if="entry.kind === 'folder'">
        <button
          type="button"
          class="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-sm hover:bg-zinc-200"
          :aria-expanded="expandedIds.has(entry.id)"
          @click="onFolderClick(entry)"
        >
          <span class="w-3 shrink-0">{{ expandedIds.has(entry.id) ? "▾" : "▸" }}</span>
          <span class="truncate" :title="entry.label">{{ entry.label }}</span>
        </button>
        <ExplorerTree
          v-if="expandedIds.has(entry.id)"
          :entries="entry.children"
          :highlighted-file-id="highlightedFileId"
          :expanded-ids="expandedIds"
          @select="emit('select', $event)"
        />
      </template>
      <button
        v-else
        type="button"
        class="w-full truncate rounded px-1 py-0.5 pl-4 text-left text-sm hover:bg-zinc-200"
        :class="entry.id === highlightedFileId ? 'bg-blue-100 font-medium' : ''"
        :title="entry.label"
        @click="onFileClick(entry)"
      >
        {{ entry.label }}
      </button>
    </li>
  </ul>
</template>
```

Note: this component only ever receives `folder`/`file` kind entries — never
`symbol` (the page passes it the top-level `hierarchy`, and it only ever
recurses into a *folder's* `.children`, never a *file's*). The `v-else`
branch correctly handles `"file"` without a separate symbol case because
symbols never reach this component at all.

### `pages/index.vue` changes

1. Import `buildHierarchy`, `findFilePath`, and the `HierarchyNode`/`FilePathResult` types from `../composables/build-hierarchy.js`.
2. Add:
   ```typescript
   const hierarchy = computed<HierarchyNode[]>(() => buildHierarchy(data.value?.nodes ?? []));
   const expandedFolderIds = reactive(new Set<string>());
   watch([repoPath, view], () => expandedFolderIds.clear());

   const selectionFilePath = computed<FilePathResult | undefined>(() => {
     if (!selectedNodeId.value) return undefined;
     return findFilePath(hierarchy.value, selectedNodeId.value);
   });
   watch(selectionFilePath, (result) => {
     if (!result) return;
     for (const folderId of result.folderIds) expandedFolderIds.add(folderId);
   });

   function onExplorerSelect(nodeId: string | undefined): void {
     selectedNodeId.value = nodeId;
     if (nodeId) void fitView({ nodes: [nodeId], duration: 400, padding: 0.3 });
   }
   ```
3. Template: inside the existing `<div v-else class="flex min-h-0 flex-1">`
   block (the 2-pane canvas+sidebar row), add a new `<aside>` **before** the
   canvas `<div>`:
   ```html
   <aside
     class="w-72 shrink-0 overflow-y-auto border-r border-zinc-300 bg-zinc-50 px-3 py-3 text-sm"
     aria-label="Explorer"
   >
     <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Explorer</h2>
     <ExplorerTree
       :entries="hierarchy"
       :highlighted-file-id="selectionFilePath?.fileId"
       :expanded-ids="expandedFolderIds"
       @select="onExplorerSelect"
     />
   </aside>
   ```
   Resulting row is now 3 panes: Explorer (`w-72`, new) | Canvas (`flex-1`, unchanged) | Details (`w-80`, unchanged).

**Verify:**
- `pnpm typecheck` clean
- `pnpm lint` clean
- Full `pnpm test` green
- `pnpm --filter specifyr-frontend build` succeeds
- Layout stability: `frontend/composables/useElkLayout.ts` byte-identical to
  main — this slice touches selection/tree state only, never the layout
  input.
- Manual smoke test (see Task 4 review focus) — click a file in the tree,
  click a node on canvas, confirm the tree highlight follows both directions.

**Commit:**

```bash
git add frontend/components/ExplorerTree.vue frontend/pages/index.vue
git commit -m "Add Explorer tree pane, wired to existing selection + camera fit"
```

---

## Task 4: Code-review checkpoint

Dispatch `superpowers:code-reviewer` on the Task 2-3 commits. Focus:

- **`findFilePath` correctness against the spec** — especially the
  symbol-resolves-to-owning-file case and the pathless-sentinel case.
- **Id collision safety** — confirm `"folder:"`/`"file:"` synthesized ids can
  never collide with a real node id, because `NODE_ID_PATTERN`
  (`src/core/schemas.ts:24`) doesn't allow `:` in a real id. Worth confirming
  explicitly rather than assuming.
- **Shared `reactive(Set)` mutation pattern** — confirm the prop is mutated
  in place (never reassigned) and that this is intentional, documented
  behavior (see the comment in the component above), not an accidental
  prop-mutation bug.
- **Bidirectional sync correctness** — clicking a tree file sets
  `selectedNodeId` AND fits the camera; clicking a canvas node or submitting
  a search both drive `selectedNodeId` through the *existing* mechanisms,
  and the new `selectionFilePath` watcher must react to ALL of them
  identically (it watches `selectedNodeId` indirectly via `hierarchy` +
  `findFilePath`, not tree-local state — verify there's no accidental
  tree-click-only code path that the canvas/search paths bypass).
- **Virtual file click clears selection** — clicking a non-selectable file
  row must set `selectedNodeId` to `undefined`, not leave a stale real
  selection highlighted elsewhere (dimmed graph, sidebar).
- **Expand-state reset on repo/view switch** — confirm `expandedFolderIds`
  clears on both `repoPath` and `view` changes, and that stale folder ids
  from a previous hierarchy don't cause a confusing pre-expanded state in
  the new one (a coincidental id match across differently-shaped repos is
  possible in principle since ids are just `"folder:" + path`).
- **Layout stability** — confirm `useElkLayout.ts` is untouched; this slice
  never feeds tree/selection state into it.
- **No symbols leak into the tree** — spot check that `entry.children` is
  only ever passed for `kind === "folder"` entries in the template, never
  for `kind === "file"` (whose `.children` holds symbols, deliberately
  unrendered).

Apply approved suggestions before proceeding.

---

## Task 5: E2E bundle-content guard

**Files:**
- Modify: `tests/cli/editor-ist-integration.test.ts`

**Step:** Append a sibling assertion after the existing picker guard:

```typescript
const anyMentionsExplorer = bundles.some((name) => {
  const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
  return content.includes("Explorer");
});
expect(anyMentionsExplorer).toBe(true);
```

Rebuild first, verify the marker actually survives minification before
trusting the assertion:

```bash
pnpm --filter specifyr-frontend build
grep -l "Explorer" frontend/.output/public/_nuxt/*.js
```

If Vite's minifier strips it in some unexpected way, fall back to grepping
for a different unique literal from the template (e.g. the aria-label
string, which Vue compiles as a literal attribute value).

**Commit:**

```bash
git add tests/cli/editor-ist-integration.test.ts
git commit -m "Guard Explorer pane in bundle"
```

---

## Task 6: README + green + push + PR

**Files:**
- Modify: `README.md`

**Step 1:** Under `## Status`, add:

```text
Slice Explorer Tree (current): a left-hand folder/file tree navigates the current view; selecting a file there or a node on the canvas keeps both in sync — the tree always shows where the current selection lives. Second slice of the Explorer/Canvas/Details redesign (docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md). ✅
```

Move the previous `(current)` marker off Slice Hierarchy Data.

**Step 2:** Green gate:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Step 3:** Commit + push + PR. PR body: summarize the tree + bidirectional
sync, link the design doc, explicitly call out the "reuses existing flat
canvas + fitView, nested wrapper boxes are Slice 3" scoping note so nobody
mistakes this for the finished redesign.

```bash
git add README.md
git commit -m "docs: bump README status to Slice Explorer Tree"
git push -u origin ts/slice-explorer-tree
```

---

## Execution notes for the subagent chain

- Baseline (main tip `19127a5`): 271 tests, 39 files.
- Task 2 is pure TDD, one implementer subagent.
- Task 3 is the component + page wiring, one implementer subagent — biggest
  chunk of this slice. Provide it the full plan doc; the component code
  above is meant to be copied close to verbatim, not redesigned.
- Task 4 is the review checkpoint.
- Task 5 is one-file additive.
- Task 6 wraps up.
- Do NOT touch ELK/canvas rendering logic — that's Slice 3.
- Do NOT restart the editor on port 3939.
