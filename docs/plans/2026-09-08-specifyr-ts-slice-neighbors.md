# Slice Neighbors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Clicking a node in the editor highlights its direct import neighbors in the graph and lists them as clickable rows in the details sidebar. Non-neighbors dim. Turns the IST graph from a passive picture into a traversal tool for understanding the codebase.

**Architecture:** Pure `neighborsOf(nodeId, nodes, edges)` composable computes `{imports, importedBy}` — direct 1-hop neighbors, no transitive closure. Sidebar renders two extra sections after the existing detail rows: `Imports (n)` and `Imported by (n)`, each row a `<button>` that sets `selectedNodeId` to the neighbor. Nodes and edges gain a `dim` visual state whenever any node is selected and the item is not in the neighbor set — implemented via Tailwind opacity utilities on the `class` prop, no ELK re-layout (Plan-001 no-jump contract stays intact — `useElkLayout.inputKey` is untouched).

**Tech Stack:** Vue 3 composables, Vue Flow 1.42, Tailwind CSS 4, Vitest, existing `Node`/`Edge` Zod schemas.

**Non-goals:**
- Multi-hop reachability (only direct neighbors)
- Edge-type filtering (only `imports` exists in IST today; adjust naturally when new types land)
- Symbol-level neighbors (files/modules only, same granularity as today)
- Camera movement / fit-to-node (own slice — Search + Fit later)
- Back/forward history of visited selections
- Multi-select
- Edge selection

---

### Task 1: Branch + plan doc

**Files:**
- Create: `docs/plans/2026-09-08-specifyr-ts-slice-neighbors.md` (this file)

**Step 1: Confirm branch**

Run: `git status` — expected on `ts/slice-neighbors`.

**Step 2: Commit plan**

```bash
git add docs/plans/2026-09-08-specifyr-ts-slice-neighbors.md
git commit -m "Add Slice Neighbors plan: highlight + traversable neighbors"
```

---

### Task 2: `neighborsOf` helper (TDD)

**Files:**
- Create: `frontend/composables/neighbors.ts`
- Test: `tests/frontend/neighbors.test.ts`

**Contract:**

```typescript
import type { Edge, Node } from "specifyr";

export interface Neighbors {
  imports: Node[];      // nodes this node imports (outgoing edges: from === nodeId)
  importedBy: Node[];   // nodes that import this node (incoming edges: to === nodeId)
}

export function neighborsOf(
  nodeId: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
): Neighbors;
```

Rules:
- Consider only edges with `type === "imports"`.
- Dedupe by neighbor node id (same neighbor via two edges appears once).
- Preserve stable order: sort each list by node `name` ascending.
- Missing neighbor node (edge references an id not in `nodes`) is silently skipped — do not throw.
- Self-loops (a node importing itself) are skipped from both lists.

**Step 1: Write failing tests**

Cover:
- Empty edges → both lists empty
- Single outgoing edge → `imports` contains that node, `importedBy` empty
- Single incoming edge → `importedBy` contains that node, `imports` empty
- Two edges of `type !== "imports"` are ignored
- Duplicate edges to the same neighbor → single entry
- Dangling edge target (edge points to unknown id) → silently skipped
- Self-loop → excluded
- Multiple neighbors returned sorted by `name`

**Step 2: Run tests, confirm fail**

```
pnpm test tests/frontend/neighbors.test.ts
```

**Step 3: Implement helper**

Minimum code to make tests pass. Use `Map<string, Node>` for id-lookup — even the reviewer's earlier note on `formatNodeDetails` said the equivalent `.find()` would be trivially replaceable if perf ever mattered; here we build the map once per call, which is cheap and keeps the helper `O(nodes + edges)` instead of `O(edges * nodes)`.

**Step 4: Run tests, confirm pass**

```
pnpm test tests/frontend/neighbors.test.ts
```

**Step 5: Commit**

```bash
git add frontend/composables/neighbors.ts tests/frontend/neighbors.test.ts
git commit -m "Add neighborsOf composable for graph traversal (TDD)"
```

---

### Task 3: Wire sidebar + dim classes

**Files:**
- Modify: `frontend/pages/index.vue`

**Sub-steps:**

1. Import `neighborsOf` from `../composables/neighbors.js`.
2. Add `neighbors` computed:
   ```typescript
   const neighbors = computed<Neighbors>(() => {
     if (!selectedNode.value || !data.value) return { imports: [], importedBy: [] };
     return neighborsOf(selectedNode.value.id, data.value.nodes, data.value.edges);
   });
   ```
3. Add `neighborIds` computed for O(1) lookup during class mapping:
   ```typescript
   const neighborIds = computed<Set<string>>(() => {
     const s = new Set<string>();
     for (const n of neighbors.value.imports) s.add(n.id);
     for (const n of neighbors.value.importedBy) s.add(n.id);
     if (selectedNodeId.value) s.add(selectedNodeId.value);
     return s;
   });
   ```
4. Extend the existing `flowNodes` computed so each node's `class` string includes `opacity-30` when a selection exists and this node is not in `neighborIds`.
5. Add `flowEdges` computed (or modify the existing one if it already exists) so edges likewise get `opacity-20` when a selection exists and the edge is not incident to the selected node.
6. Sidebar template addition — after the existing `<dl>`, add:
   ```html
   <section v-if="selectedNode" class="mt-4">
     <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
       Imports ({{ neighbors.imports.length }})
     </h3>
     <ul v-if="neighbors.imports.length" class="space-y-0.5">
       <li v-for="n in neighbors.imports" :key="n.id">
         <button
           type="button"
           class="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-xs text-zinc-800 hover:bg-zinc-200"
           @click="selectedNodeId = n.id"
         >{{ n.name }}</button>
       </li>
     </ul>
     <p v-else class="text-xs text-zinc-500">None</p>
   </section>
   <section v-if="selectedNode" class="mt-4">
     <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
       Imported by ({{ neighbors.importedBy.length }})
     </h3>
     <ul v-if="neighbors.importedBy.length" class="space-y-0.5">
       <li v-for="n in neighbors.importedBy" :key="n.id">
         <button
           type="button"
           class="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-xs text-zinc-800 hover:bg-zinc-200"
           @click="selectedNodeId = n.id"
         >{{ n.name }}</button>
       </li>
     </ul>
     <p v-else class="text-xs text-zinc-500">None</p>
   </section>
   ```

**Verify:**

- `pnpm typecheck` clean
- `pnpm lint` clean
- Full `pnpm test` still 208+ green (Slice Selection was 207 baseline; +neighbors.test.ts count)
- Frontend `pnpm --filter specifyr-frontend build` succeeds
- Layout stability: `useElkLayout.inputKey` unchanged (must still be `{n: node.id[], e: edge.id:from->to[]}`); grep to confirm.

**Commit:**

```bash
git add frontend/pages/index.vue
git commit -m "Wire neighbor highlight + neighbor lists into the editor page"
```

---

### Task 4: Code-review checkpoint

Dispatch `superpowers:code-reviewer` subagent to review Task 2-3 commits. Focus:

- **Layout stability (Plan-001 no-jump)** — `useElkLayout.inputKey` must NOT include neighbor / selection state. Verify.
- **Node/edge class mapping** — dim class must NOT change node identity or position; only visual.
- **Neighbor click** — setting `selectedNodeId = n.id` re-runs `selectedNode`/`neighbors` computeds; new neighbor set becomes the new "focus"; the previous focus dims. Confirm this is the intended traversal UX and does not accidentally scroll or re-fire layout.
- **Sidebar UX** — clickable rows should be reachable via keyboard (they are `<button>`s, so yes); truncate long names but full name is available via native `title` attribute? Consider adding.
- **Edge case** — a node with zero neighbors renders "None" placeholders. Fine, don't hide the sections (users need to see the zero count as information).

Apply approved suggestions before proceeding.

---

### Task 5: E2E bundle-content guard

**Files:**
- Modify: `tests/cli/editor-ist-integration.test.ts`

**Step:** Extend the existing selection-wiring assertion block (or add a sibling) so that the JS bundle also contains the neighbor UI markers:

```typescript
const anyMentionsNeighbors = bundles.some((name) => {
  const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
  return content.includes("Imports (") && content.includes("Imported by (");
});
expect(anyMentionsNeighbors).toBe(true);
```

Placement: right after the existing `expect(anyMentionsSelection).toBe(true);`.

Run: `pnpm test tests/cli/editor-ist-integration.test.ts` — expect the two tests to still pass.

**Commit:**

```bash
git add tests/cli/editor-ist-integration.test.ts
git commit -m "Guard neighbor sidebar sections in bundle"
```

---

### Task 6: README bump + push + PR

**Files:**
- Modify: `README.md`

**Step 1:** Under `## Status`, extend the Slice Selection line or add a new line:

```
Slice Neighbors (current): selecting a node highlights direct imports/importers in the graph and lists them as clickable rows in the sidebar — traversal from any starting point. ✅
```

Move the previous `(current)` marker back off Slice Selection.

**Step 2:** Green gate

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All must be green. Test count expected: 207 (baseline) + 8-ish new = 215+.

**Step 3:** Commit + push + PR

```bash
git add README.md
git commit -m "docs: bump README status to Slice Neighbors"
git push -u origin ts/slice-neighbors
gh pr create --title "Slice Neighbors: highlight + traversable direct neighbors" --body "$(cat <<'EOF'
## Summary

- Select a node → its direct import neighbors highlight; the rest dims.
- Sidebar gains two new sections: `Imports (n)` and `Imported by (n)`, each row a clickable button that jumps selection to that neighbor. Traversal from any starting point.
- Pure `neighborsOf(nodeId, nodes, edges)` composable computes the two lists (TDD, 8 tests). Dedupe, sort by name, silently skip dangling edges and self-loops.
- Dim state is a Tailwind opacity utility on Vue Flow's node/edge `class` — no ELK re-layout (Plan-001 no-jump contract preserved).
- E2E bundle guard for `Imports (` / `Imported by (` markers.
- Follow-up to Slice Selection; roadmap link in [plans/001](plans/001-editor-perspectives-and-state-comparison.md).

## Test plan

- [x] `pnpm typecheck` (root + `nuxt typecheck`) — clean
- [x] `pnpm lint` — clean
- [x] `pnpm test` — full suite green, 215+ tests
- [x] `pnpm build` + frontend build succeed
- [x] E2E bundle assertion for neighbor UI passes
- [x] Manual: select node with many importers → sidebar populates, click importer → selection jumps, dim state updates without graph reshuffle
EOF
)"
```

---

## Execution notes for the subagent chain

- Baseline (main tip `e5750e6`, ts/slice-neighbors branched from there): 207 tests, 33 files, 87 Biome-checked files, frontend build 2.54 MB.
- Task 1 is trivial setup — batch with the plan-commit, no subagent needed.
- Task 2 is pure TDD — one implementer subagent, then spec review then code-quality review per subagent-driven-development.
- Task 3 is page wiring — one implementer subagent; reviewer must confirm layout-stability contract.
- Task 4 is the review checkpoint after Tasks 2-3.
- Task 5 is one-file additive; batch with Task 6 or do as its own quick subagent.
- Task 6 wraps up.
