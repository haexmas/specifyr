# specifyr TS Rewrite — Slice Selection: Node selection + details panel

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Vue Flow node selection in the editor and show the selected node's details in a right-side sidebar. First derivative from the [roadmap 001](../../plans/001-editor-perspectives-and-state-comparison.md) product plan — the "Auswahl-Primitive" every later view depends on.

**Architecture:** The product-vision docs already live at repo-root `plans/` (landed via PR #12 while this slice was being planned). Add a small pure `formatNodeDetails(node)` helper in `frontend/composables/` that turns any `Node` (SOLL or IST shape) into an ordered list of `{ label, value }` display rows — unit-testable without Vue. Modify `frontend/pages/index.vue`: (1) `elements-selectable: true` on `<VueFlow>`, (2) `@node-click` / `@pane-click` handlers maintaining a `selectedNodeId: ref<string | undefined>`, (3) split the previous single-column canvas area into a two-column flex (Vue Flow left, 320px details sidebar right), (4) sidebar renders the details rows or an "Nothing selected" empty state. Layout stability contract: since `useElkLayout`'s `inputKey` only hashes `nodes` + `edges` (never `selectedNodeId`), clicking a node cannot trigger a re-layout — verify empirically.

**Tech Stack:** No new dependencies. Uses existing `@vue-flow/core@1.42.0` selection events, Vue 3.5 reactivity, Tailwind 4 utilities (Slice Tailwind), and the current happy-dom setup (Slice Tailwind reviewer added it as devDep) for a small render assertion if useful.

**Reference:**
- Roadmap doc: [plans/001-editor-perspectives-and-state-comparison.md](../../plans/001-editor-perspectives-and-state-comparison.md) — the source-of-truth product vision (landed via PR #12). Specifically the "Bedienkonzept" section (three-pane layout, stable selection) and the note that current `elements-selectable: false` is a gap.
- Slice Tailwind (main tip `4e585f1`): most recent editor styling; details sidebar uses matching Tailwind utilities.
- Slice ELK: `useElkLayout` composable; `inputKey` shape must NOT include selection state.
- Vue Flow selection API: `@node-click` fires with `{ event, node }`, `@pane-click` fires on empty-canvas click. `elements-selectable` prop must be `true` for `selected` styling to apply.

**Branch:** `ts/slice-selection-details` off current `main` (`4e585f1` or later). Main protected. Land via PR. Wait for CodeRabbit before merging (memory: `CR before merge`).

**Non-goals for this slice:**
- Explorer / tree navigator (left pane in roadmap doc — separate slice)
- Breadcrumbs and back/forward navigation (roadmap doc mentions — separate slice)
- Filters, "only selection", exclude, pin (roadmap section "Auswahl und Filter" — separate slice)
- Multi-select (single-selection only for v1)
- Keyboard shortcuts / focus indicator ring (roadmap mentions — separate slice)
- Details panel content beyond `id`, `type`, `name`, `description?`, `path?` — no source spans, no vocabulary attributes, no relations list, no history
- SOLL/PLAN/IST synchronised comparison (roadmap "Vergleich" — separate slice, PLAN extractor doesn't exist yet)
- Cross-repo selection (roadmap — separate slice, cross-repo model doesn't exist yet)
- Details for edges (only nodes selectable in v1; Vue Flow supports it but roadmap doesn't require yet)
- "Fokussieren" / double-click to change the viewport / entity subgraph — roadmap warns against jumping on click, this slice honours that by doing NOTHING on click except updating selection state

**Behaviour after this slice:**

```
Editor open on http://127.0.0.1:3939 → click IST → graph renders as before
→ click a node → node gets Vue Flow's selection halo + right sidebar shows:
    id:          ts-abc123def456
    type:        class
    name:        AuthService
    description: (empty)
    path:        (empty)
→ click empty canvas → sidebar shows "Nothing selected"
→ ELK layout does NOT recompute (verify: no "laying out…" flash on click)
```

---

## Task 1: Create branch + commit plan

The roadmap docs already live at repo-root `plans/` (landed via PR #12), so no move is needed for this slice.

**Files:**
- New: this plan doc under `docs/plans/`

**Step 1: Confirm clean main**
```bash
git status && git branch --show-current && git log --oneline -1
```
Expected: on `main`, tip is `1ff03d0` or later (post PR #13). Working tree clean.

**Step 2: Create branch**
```bash
git switch -c ts/slice-selection-details
```

**Step 3: Commit the plan doc**
```bash
git add docs/plans/2026-09-08-specifyr-ts-slice-selection-details.md
git commit -m "Add Slice Selection plan: node selection + details panel"
```

---

## Task 2: `formatNodeDetails.ts` — pure helper (TDD)

Turn any Slice-1 `Node` into an ordered list of `{ label, value }` display rows. Keeps the display-format decision out of the Vue template (which stays purely presentational) and gives us a testable unit.

**Files:**
- Create: `frontend/composables/format-node-details.ts`
- Create: `tests/frontend/format-node-details.test.ts`

**Step 1: Failing test**

Create `tests/frontend/format-node-details.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { formatNodeDetails } from "../../frontend/composables/format-node-details.js";

describe("formatNodeDetails", () => {
  it("returns id, type, and name for a minimal node", () => {
    const rows = formatNodeDetails({
      id: "ts-abc123def456",
      type: "class",
      name: "AuthService",
      classes: [],
    });
    expect(rows).toEqual([
      { label: "id", value: "ts-abc123def456" },
      { label: "type", value: "class" },
      { label: "name", value: "AuthService" },
    ]);
  });

  it("appends description when present", () => {
    const rows = formatNodeDetails({
      id: "auth",
      type: "component",
      name: "Auth",
      description: "handles sessions",
      classes: [],
    });
    expect(rows).toContainEqual({ label: "description", value: "handles sessions" });
  });

  it("appends path when present", () => {
    const rows = formatNodeDetails({
      id: "auth",
      type: "component",
      name: "Auth",
      path: "src/auth/",
      classes: [],
    });
    expect(rows).toContainEqual({ label: "path", value: "src/auth/" });
  });

  it("omits description and path rows when absent (does not render empty rows)", () => {
    const rows = formatNodeDetails({
      id: "auth",
      type: "component",
      name: "Auth",
      classes: [],
    });
    const labels = rows.map((r) => r.label);
    expect(labels).not.toContain("description");
    expect(labels).not.toContain("path");
  });

  it("preserves row order: id, type, name, description, path", () => {
    const rows = formatNodeDetails({
      id: "auth",
      type: "component",
      name: "Auth",
      description: "d",
      path: "p",
      classes: [],
    });
    expect(rows.map((r) => r.label)).toEqual(["id", "type", "name", "description", "path"]);
  });
});
```

**Step 2: Run to FAIL**
```bash
pnpm test tests/frontend/format-node-details.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement**

Create `frontend/composables/format-node-details.ts`:
```typescript
import type { Node } from "specifyr";

export interface DetailRow {
  label: string;
  value: string;
}

export function formatNodeDetails(node: Node): DetailRow[] {
  const rows: DetailRow[] = [
    { label: "id", value: node.id },
    { label: "type", value: node.type },
    { label: "name", value: node.name },
  ];
  if (node.description) {
    rows.push({ label: "description", value: node.description });
  }
  if (node.path) {
    rows.push({ label: "path", value: node.path });
  }
  return rows;
}
```

**Step 4: Run PASS** — 5 tests.

**Step 5: Commit**
```
Add formatNodeDetails helper for the selection sidebar (TDD)
```

---

## Task 3: Wire selection state + sidebar into `frontend/pages/index.vue`

Modify the editor page to enable selection, track the selected node id, split the main area into `Canvas | Sidebar`, and render details.

**Files:**
- Modify: `frontend/pages/index.vue`

**Step 1: Update script setup — add selection state and computed lookup**

Add these imports at the top of `<script setup lang="ts">`:
```typescript
import type { NodeMouseEvent } from "@vue-flow/core";
import { formatNodeDetails } from "../composables/format-node-details.js";
```

After the existing `layoutInput`/`useElkLayout` block, add:
```typescript
const selectedNodeId = ref<string | undefined>(undefined);

const selectedNode = computed(() => {
  if (!selectedNodeId.value || !data.value?.nodes) return undefined;
  return data.value.nodes.find((n) => n.id === selectedNodeId.value);
});

const selectedNodeDetails = computed(() =>
  selectedNode.value ? formatNodeDetails(selectedNode.value) : [],
);

function onNodeClick({ node }: NodeMouseEvent): void {
  selectedNodeId.value = node.id;
}

function onPaneClick(): void {
  selectedNodeId.value = undefined;
}
```

Note: `NodeMouseEvent` is Vue Flow's typed event for node interactions. If the exact type name differs in `@vue-flow/core@1.42.0`, use `{ node: { id: string } }` inline structural type and note in the commit body.

**Step 2: Update `flowNodes` to include selection state**

Vue Flow doesn't require a manual `selected: boolean` on nodes when `elements-selectable: true` is set — it manages selection internally via user clicks. But to keep the visual state consistent with our external `selectedNodeId` ref (so an external programmatic selection could later drive it), we set the `selected` field explicitly.

Change:
```typescript
const flowNodes = computed<FlowNode[]>(() => {
  if (!data.value?.nodes) return [];
  return data.value.nodes.map((node) => ({
    id: node.id,
    type: "default",
    position: positions.value.get(node.id) ?? { x: 0, y: 0 },
    data: { label: `${node.name}\n(${node.type})` },
    class: `soll-node ${nodeTypeClasses(node.type)}`,
  }));
});
```
To:
```typescript
const flowNodes = computed<FlowNode[]>(() => {
  if (!data.value?.nodes) return [];
  return data.value.nodes.map((node) => ({
    id: node.id,
    type: "default",
    position: positions.value.get(node.id) ?? { x: 0, y: 0 },
    data: { label: `${node.name}\n(${node.type})` },
    class: `soll-node ${nodeTypeClasses(node.type)}`,
    selected: node.id === selectedNodeId.value,
  }));
});
```

**Step 3: Update the template — 2-column layout + selection events + sidebar**

Find the `<div v-else class="min-h-0 flex-1">` block that currently wraps `<VueFlow>`. Replace with:

```vue
<div v-else class="flex min-h-0 flex-1">
  <div class="min-h-0 flex-1">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="true"
      @node-click="onNodeClick"
      @pane-click="onPaneClick"
    >
      <Background />
    </VueFlow>
  </div>
  <aside class="w-80 shrink-0 overflow-y-auto border-l border-zinc-300 bg-zinc-50 px-4 py-3 text-sm">
    <div v-if="!selectedNode" class="text-zinc-500">Nothing selected.</div>
    <dl v-else class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
      <template v-for="row in selectedNodeDetails" :key="row.label">
        <dt class="font-medium text-zinc-500">{{ row.label }}</dt>
        <dd class="min-w-0 break-words font-mono text-xs text-zinc-800">{{ row.value }}</dd>
      </template>
    </dl>
  </aside>
</div>
```

Changes from previous template:
- `<div v-else class="min-h-0 flex-1">` → `<div v-else class="flex min-h-0 flex-1">` (row layout for two children)
- `<VueFlow>` wrapped in a `min-h-0 flex-1` div so it takes the remaining width
- `<VueFlow>` gains `:elements-selectable="true"`, `@node-click`, `@pane-click`
- New `<aside>` sidebar (320px = `w-80`) with details or empty state

**Step 4: Verify build**

```bash
pnpm --filter specifyr-frontend build
```
Expected: success. `.output/*` regenerated with the new selection wiring.

**Step 5: Verify gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
All exit 0. Test count still 200 + 5 (from Task 2) = **205**.

**Step 6: Commit**
```
Wire node selection + details sidebar into the editor page
```

---

## Task 4: E2E test — assert selection wiring is present in the bundle

Task 6 of Slice ELK / Task 6 of Slice Tailwind established a bundle-content check pattern in `tests/cli/editor-ist-integration.test.ts`. Extend it to assert the selection wiring landed — a regression that dropped the `@node-click` handler would go unnoticed by the existing checks.

**Files:**
- Modify: `tests/cli/editor-ist-integration.test.ts`

**Step 1: Add the assertion**

At the end of the existing `it("extracts IST nodes …")` block, after the Tailwind bundle assertion, append:

```typescript
    // Selection sanity check: the page bundle references the node-click
    // handler and the elements-selectable prop. A regression that dropped
    // either would ship a graph with no selection support and a dead
    // sidebar. This is a coarse substring check — a real Playwright test
    // would exercise the click flow, but Slice X ruled that scope out.
    const anyMentionsSelection = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return (
        content.includes("elementsSelectable") ||
        content.includes("elements-selectable") ||
        content.includes("onNodeClick") ||
        content.includes("node-click")
      );
    });
    expect(anyMentionsSelection).toBe(true);
```

The `bundles` variable is already in scope from the earlier ELK check. If it was declared with a narrower scope, hoist as needed.

**Step 2: Rebuild + rerun**

```bash
pnpm build
pnpm test tests/cli/editor-ist-integration.test.ts
```
Expected: PASS. Runtime a few seconds.

**Step 3: Commit**
```
Assert selection wiring is present in the built page bundle (E2E)
```

---

## Task 5: Verify Plan-001's "no jump on selection" contract holds

This is a verification-only task — no code change expected. `useElkLayout`'s `inputKey` from Slice ELK reads:

```typescript
JSON.stringify({
  n: nodes.value.map((n) => n.id).sort(),
  e: edges.value.map((e) => `${e.id}:${e.from}->${e.to}`).sort(),
})
```

`selectedNodeId` is not in the key, so a selection change cannot flip the key, so `watchEffect` cannot re-fire the ELK layout. Verify by:

**Step 1: Read the composable**
```bash
grep -A5 "const inputKey" frontend/composables/useElkLayout.ts
```
Confirm `selectedNodeId` is nowhere in the hash.

**Step 2: Manual smoke check (optional)**

If a browser is available:
```bash
node dist/cli/index.js editor . --no-open --port 3939
# Open http://127.0.0.1:3939 in browser
# Click IST, wait for layout, click any node — verify no "laying out…"
# indicator flashes in the TopBar.
```

**Step 3: Commit a note only if the check surfaced a fix**

If verification passes cleanly (expected), no commit needed. If the composable does re-fire, that's a bug and must be fixed before merge — file it as a follow-up under Task 5's commit.

---

## Task 6: README + PR

**Files:** Modify `README.md`.

**Step 1: Update the Status list**

Insert between Slice Tailwind and the planned section:
```markdown
Slice Selection (current): click a node to see its details in a right-side sidebar. First slice derived from the [roadmap 001 vision doc](../../plans/001-editor-perspectives-and-state-comparison.md). ✅
```

**Step 2: Extend the editor usage note**

Append after the existing "Nodes are coloured by type…" sentence:
```markdown
Click a node to see its details (id, type, name, description, path) in the
right-side sidebar. Click the empty canvas to deselect. Clicking a node does
not re-layout the graph.
```

**Step 3: Full gate**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0. Final test count: 200 baseline + 5 (format-node-details) = **205 tests**.

**Step 4: Commit**
```
Update README with Slice Selection status and click-to-select note
```

**Step 5: Push**
```bash
git push -u origin ts/slice-selection-details
```

**Step 6: Open PR**
```bash
gh pr create --base main --head ts/slice-selection-details \
  --title "TS rewrite Slice Selection: node selection + details panel" \
  --body-file - <<'EOF'
## Summary

First slice derived from the [product-vision roadmap docs](../../plans/) (moved into the repo in this PR).
Enables Vue Flow node selection and adds a right-side details panel showing the selected node's basic fields. Plan tracked in
[docs/plans/2026-09-08-specifyr-ts-slice-selection-details.md](docs/plans/2026-09-08-specifyr-ts-slice-selection-details.md).

### What's in

- **`../../plans/{README,001..004}.md`** — moved from the previously untracked `plans/` directory at repo root. Vision docs produced by the `improve` skill, now version-controlled.
- **`frontend/composables/format-node-details.ts`** — pure helper turning a `Node` into ordered `{ label, value }` display rows. Unit-tested (5 tests).
- **`frontend/pages/index.vue`** — `elements-selectable: true` on `<VueFlow>`, `@node-click` / `@pane-click` handlers maintaining `selectedNodeId: ref<string|undefined>`. Main area split into 2-column flex: Vue Flow left, 320px details sidebar right. Sidebar renders formatted details or "Nothing selected" empty state.
- **E2E test** now asserts the built bundle contains selection wiring — regression guard against a dropped handler.

### Plan-001 requirement honoured

Clicking a node does NOT re-layout the graph. `useElkLayout`'s `inputKey` hashes nodes + edges only; `selectedNodeId` is never in the key, so the layout effect cannot re-fire on selection changes.

### Non-goals for this slice
- Explorer / tree left pane (later slice)
- Breadcrumbs, back/forward, keyboard nav (later slice)
- Filters / "only selection" / exclude / pin (later slice)
- Multi-select
- Details for edges (only nodes selectable in v1)
- Source spans, vocabulary attributes, relations list, history — sidebar shows only `id`, `type`, `name`, `description?`, `path?`
- "Fokussieren" / double-click viewport change — roadmap warns against jumping on click, this slice honours that

## Test plan

- [x] \`pnpm install --frozen-lockfile\` clean
- [x] \`pnpm build\` clean
- [x] \`pnpm lint\`, \`pnpm typecheck\` clean (root + frontend)
- [x] \`pnpm test\` — 205 tests pass (baseline 200 + 5 formatNodeDetails)
- [x] E2E confirms selection wiring lands in the bundle

## Manual verification

    pnpm build
    node dist/cli/index.js editor . --no-open --port 3939
    # http://127.0.0.1:3939 → click IST → click any node
    # Right sidebar shows id / type / name (plus description/path if present)
    # No "laying out…" flash in TopBar on click — graph stays put

## Notes for reviewer

- Details row list is deliberately minimal — Slice-1 \`Node\` has \`classes: []\` (always present but ignored), plus optional \`description\` / \`path\`. Vocabulary-driven attributes (via \`NodeSchema.catchall(z.unknown())\`) are NOT surfaced yet — the roadmap's "vocabulary-driven properties panel" is a separate slice.
- Sidebar width is 320px (\`w-80\` in Tailwind) — a common one-third-of-editor default. If it feels wrong at real repo scale, tune in a follow-up.
- \`selected: node.id === selectedNodeId.value\` on \`flowNodes\` gives Vue Flow the state it needs for its visual selection halo. Consistent with the external ref.
EOF
```

**Step 7: Wait for CodeRabbit before merging.**

---

## Notes for the executing agent

- **YAGNI:** the details sidebar exposes only 5 fields. Do NOT add row types for `classes[]` iteration, no vocabulary catchall attribute walk, no source-span field even though `Node` may carry one in a later slice.
- **DRY:** `formatNodeDetails` is the single source of truth for what shows in the sidebar. Vue template iterates its output — do NOT hardcode field labels in the template.
- **Import discipline:** every local import uses `.js` extension. `NodeMouseEvent` from `@vue-flow/core` uses `import type`.
- **TDD:** Task 2 is strict test-first. Tasks 1 (file move), 3 (page wiring), 5 (verification-only), 6 (README/PR) are all straightforward — no TDD, but the E2E bundle assertion in Task 4 provides a regression guard.
- **Main protected**, work on `ts/slice-selection-details`, land via PR, **CR before merge**.
- **Don't touch** `useElkLayout.ts` or `elk-adapter.ts` — the layout stability contract depends on them NOT knowing about selection.
- **Don't touch** `nodeTypeClasses.ts` — colours don't depend on selection.
- **Don't touch** any Slice 1-4 backend code, storage, extractors, CLI. Slice Selection is frontend-only plus one E2E test extension.
