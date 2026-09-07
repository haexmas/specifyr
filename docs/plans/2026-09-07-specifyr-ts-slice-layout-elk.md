# specifyr TS Rewrite — Slice ELK: Auto-layout with ELK.js

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Vue Flow 4-column grid with ELK.js `layered` (Sugiyama) auto-layout so the IST graph is actually readable — modules that import others form a hierarchy instead of overlapping arrows on a static grid.

**Architecture:** Split into two composables under `frontend/composables/`. `elk-adapter.ts` is a pair of pure functions — `modelToElkGraph(nodes, edges)` converts our Model shape into the ELK JSON schema, `elkResultToPositions(result)` extracts a `Map<nodeId, {x, y}>` back out. Both unit-tested in `tests/frontend/elk-adapter.test.ts`. `useElkLayout.ts` is a thin async composable that instantiates `new ELK()`, feeds the graph, awaits `elk.layout()`, and exposes a reactive `positions` ref. `frontend/pages/index.vue` swaps its `(index % 4) * 240` position calc for a lookup into that map; while the layout is still resolving, nodes render at `{x: 0, y: 0}` — which is fine because Vue Flow paints them one tick later once positions settle. ELK's algorithm is `layered` with default spacing, top-down direction.

**Tech Stack:** `elkjs@0.12.0` (pure JS + WASM, no native compile). Existing frontend stack — Nuxt 4, Vue 3.5, Vue Flow 1.42. Vitest 2.1 for the unit tests, run through the root `pnpm test` gate.

**Reference:**
- Design doc §5 (Decision summary — Canvas: Vue Flow + ELK.js), §7.4 (Views and layout — later slice will persist per-view positions in `_layout.json`) at [docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md)
- Slice B (main tip): 143 nodes + 71 imports edges rendered on the 4-column grid. That is the UX we are replacing.
- Vue Flow's node position contract: `node.position = { x: number, y: number }` — the exact shape ELK also emits, so the mapping is trivial.
- ELK graph JSON schema (0.12 API): a root graph is `{ id: string, layoutOptions?: Record<string,string>, children: ElkNode[], edges: ElkEdge[] }`, where `ElkNode` is `{ id: string, width?: number, height?: number }` and `ElkEdge` is `{ id: string, sources: [nodeId], targets: [nodeId] }`. After `elk.layout()`, each `child` gets an `x` and `y` set.

**Branch:** `ts/slice-layout-elk` off current `main` (`11c9b7d` at time of writing). Main protected. Land via PR. Wait for CodeRabbit before merging (memory: `CR before merge`).

**Non-goals for this slice:**
- Multiple layout algorithms (force, radial, tree, box) — `layered` only
- User-toggleable layout / a settings panel to choose algorithm
- Persisting layout via `_layout.json` (design doc §7.4 — later slice)
- The `manual` flag override for individual nodes (design doc §7.4 — later slice)
- Layout caching between fetches — recompute is cheap at Slice B scale (143 nodes), premature optimization
- Edge routing customization (waypoint styling, orthogonal segments) — Vue Flow's default Bézier is fine
- Per-view different layouts (this slice recomputes on every SOLL/IST toggle; that IS the "per-view" behavior for v1)
- Handling ELK layout failures with a graceful fallback UI — if ELK throws, the page shows an error like it already does for `/api/soll` failures

**Behavior after Slice ELK:**

```
$ node dist/cli/index.js editor . --no-open --port 3939
# Browser: click IST
# → Layout status briefly shows "Computing layout…" (or nodes momentarily
#   stacked at origin if we opt for the simpler flow — see Task 5).
# → After ~50-500ms, nodes rearrange into a top-down layered graph:
#     modules at the top import from modules below them.
#     Edges flow between layers with far fewer crossings than the 4-col grid.
```

Runtime cost: for the specifyr repo's ~143 nodes / 71 edges, ELK's `layered` runs in <100ms on modern hardware.

---

## Task 1: Create the working branch

**Files:** git ref `HEAD`.

**Step 1: Confirm clean main**
```bash
git status && git branch --show-current && git log --oneline -1
```
Expected: clean, on `main`, tip `11c9b7d` or later.

**Step 2: Create branch**
```bash
git switch -c ts/slice-layout-elk
```

**Step 3: Commit plan**
```bash
git add docs/plans/2026-09-07-specifyr-ts-slice-layout-elk.md
git commit -m "Add Slice ELK plan: auto-layout via ELK.js"
```

---

## Task 2: Add `elkjs` as a frontend dependency

**Files:** `frontend/package.json`, `pnpm-lock.yaml`.

**Step 1: Add dep**

Edit `frontend/package.json` and insert `elkjs` in alphabetical order in `dependencies`:
```json
  "dependencies": {
    "@vue-flow/background": "1.3.2",
    "@vue-flow/core": "1.42.0",
    "elkjs": "0.12.0",
    "specifyr": "workspace:*"
  },
```
Exact pin, alphabetical. If `0.12.0` is unavailable at install time, use the newest 0.12.x and note in the commit body.

**Step 2: Install**
```bash
pnpm install
```
Expected: `elkjs 0.12.0` added to `specifyr-frontend`. No native compilation — `elkjs` is pure JS.

**Step 3: Verify no unwanted transitives got hoisted / no engine warnings**
```bash
pnpm --filter specifyr-frontend list elkjs
```
Expected: `elkjs 0.12.0` at exactly one location.

**Step 4: Existing gates green**
```bash
pnpm typecheck && pnpm lint && pnpm test
```
All exit 0. Test count still 184.

**Step 5: Commit**
```
Add elkjs frontend dependency
```

---

## Task 3: `elk-adapter.ts` — pure Model↔ELK conversion (TDD)

Two pure functions. `modelToElkGraph` turns our `{ nodes, edges }` slice into an ELK root graph. `elkResultToPositions` walks the result's children and produces a `Map<nodeId, {x, y}>`. Neither touches ELK at runtime — the composable does that.

**Files:**
- Create: `frontend/composables/elk-adapter.ts`
- Create: `tests/frontend/elk-adapter.test.ts`

Note on test placement: existing frontend-adjacent tests already live under `tests/frontend/` at the repo root (Slice X and Slice A pattern), and root `tsconfig.json` already includes `frontend/server/utils/**/*.ts` — but NOT `frontend/composables/**`. Task 3 extends that include. See Step 0 below.

**Step 0: Extend `tsconfig.json` include**

Root `tsconfig.json` currently reads (roughly):
```json
"include": ["src", "tests", "vitest.config.ts", "frontend/server/utils/**/*.ts"]
```
Add `"frontend/composables/**/*.ts"`:
```json
"include": [
  "src",
  "tests",
  "vitest.config.ts",
  "frontend/server/utils/**/*.ts",
  "frontend/composables/**/*.ts"
]
```

Do NOT touch anything else in tsconfig.json.

**Step 1: Failing tests**

Create `tests/frontend/elk-adapter.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import {
  elkResultToPositions,
  modelToElkGraph,
} from "../../frontend/composables/elk-adapter.js";

describe("modelToElkGraph", () => {
  it("returns a root graph with the layered algorithm and top-down direction", () => {
    const graph = modelToElkGraph({ nodes: [], edges: [] });
    expect(graph.id).toBe("root");
    expect(graph.layoutOptions?.["elk.algorithm"]).toBe("layered");
    expect(graph.layoutOptions?.["elk.direction"]).toBe("DOWN");
  });

  it("maps each node to an ElkNode with fixed width/height defaults", () => {
    const graph = modelToElkGraph({
      nodes: [{ id: "ts-aaa", label: "src/foo.ts" }],
      edges: [],
    });
    expect(graph.children).toHaveLength(1);
    const child = graph.children?.[0];
    expect(child?.id).toBe("ts-aaa");
    expect(child?.width).toBeGreaterThan(0);
    expect(child?.height).toBeGreaterThan(0);
  });

  it("maps each edge to an ElkEdge with sources/targets", () => {
    const graph = modelToElkGraph({
      nodes: [
        { id: "ts-aaa", label: "a" },
        { id: "ts-bbb", label: "b" },
      ],
      edges: [{ id: "tse-xyz", from: "ts-aaa", to: "ts-bbb" }],
    });
    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges?.[0];
    expect(edge?.id).toBe("tse-xyz");
    expect(edge?.sources).toEqual(["ts-aaa"]);
    expect(edge?.targets).toEqual(["ts-bbb"]);
  });

  it("drops edges whose from or to references a missing node", () => {
    // Defensive: ELK will crash if an edge references an unknown node id.
    const graph = modelToElkGraph({
      nodes: [{ id: "ts-aaa", label: "a" }],
      edges: [{ id: "tse-ghost", from: "ts-aaa", to: "ts-missing" }],
    });
    expect(graph.edges).toEqual([]);
  });
});

describe("elkResultToPositions", () => {
  it("returns an empty map for a graph with no children", () => {
    const positions = elkResultToPositions({ id: "root", children: [] });
    expect(positions.size).toBe(0);
  });

  it("returns a Map of nodeId -> {x, y} for each child", () => {
    const positions = elkResultToPositions({
      id: "root",
      children: [
        { id: "ts-aaa", x: 10, y: 20, width: 200, height: 60 },
        { id: "ts-bbb", x: 300, y: 20, width: 200, height: 60 },
      ],
    });
    expect(positions.size).toBe(2);
    expect(positions.get("ts-aaa")).toEqual({ x: 10, y: 20 });
    expect(positions.get("ts-bbb")).toEqual({ x: 300, y: 20 });
  });

  it("falls back to {x:0, y:0} for a child ELK did not position", () => {
    const positions = elkResultToPositions({
      id: "root",
      children: [{ id: "ts-aaa", width: 200, height: 60 }],
    });
    expect(positions.get("ts-aaa")).toEqual({ x: 0, y: 0 });
  });
});
```

**Step 2: Run to FAIL**
```bash
pnpm test tests/frontend/elk-adapter.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement `frontend/composables/elk-adapter.ts`**

```typescript
// Pure conversion between our Model shape and ELK's graph JSON schema.
// Kept dependency-free so it can be unit-tested without spinning up ELK.

export interface AdapterNode {
  id: string;
  label: string;
}

export interface AdapterEdge {
  id: string;
  from: string;
  to: string;
}

export interface AdapterInput {
  nodes: AdapterNode[];
  edges: AdapterEdge[];
}

// Match what pages/index.vue will feed to Vue Flow. Small enough that
// layered fits the graph without excessive crossing; big enough to render
// the two-line "name\n(type)" label without truncation.
const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

export interface ElkGraphInput {
  id: "root";
  layoutOptions: Record<string, string>;
  children: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; sources: string[]; targets: string[] }>;
}

export function modelToElkGraph(input: AdapterInput): ElkGraphInput {
  const ids = new Set(input.nodes.map((n) => n.id));
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
    },
    children: input.nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: input.edges
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e) => ({
        id: e.id,
        sources: [e.from],
        targets: [e.to],
      })),
  };
}

export interface ElkResultNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ElkResultGraph {
  id: string;
  children?: ElkResultNode[];
}

export function elkResultToPositions(result: ElkResultGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}
```

Notes:
- The types `ElkGraphInput` / `ElkResultGraph` intentionally do NOT import from `elkjs` — kept dependency-free so this file can be tested by root Vitest without touching the ELK runtime. The runtime types are structurally compatible.
- `NODE_WIDTH` / `NODE_HEIGHT` are constants of this module. If pages/index.vue later renders differently-sized nodes, we'll add a parameter — YAGNI for now.

**Step 4: Run PASS** — 7 tests.

**Step 5: Commit**
```
Add pure ELK-adapter for Model↔ELK conversion (TDD)
```

---

## Task 4: `useElkLayout.ts` — async composable that runs ELK

**Files:**
- Create: `frontend/composables/useElkLayout.ts`

No unit test file here — the composable is Vue-runtime-shaped and would require `@vue/test-utils` or `@nuxt/test-utils` for a real test. Instead, correctness is covered by:
- The pure adapter's unit tests (Task 3)
- The E2E test tightening (Task 7) that verifies pages render with real coordinates

**Step 1: Write the composable**

```typescript
import ELK from "elkjs/lib/elk.bundled.js";
import { computed, ref, watchEffect, type Ref } from "vue";

import {
  elkResultToPositions,
  modelToElkGraph,
  type AdapterEdge,
  type AdapterNode,
} from "./elk-adapter.js";

export interface UseElkLayoutInput {
  nodes: Ref<AdapterNode[]>;
  edges: Ref<AdapterEdge[]>;
}

export interface UseElkLayoutResult {
  positions: Ref<Map<string, { x: number; y: number }>>;
  pending: Ref<boolean>;
  error: Ref<Error | undefined>;
}

// One ELK instance per composable invocation — cheap, avoids sharing state
// across concurrent SOLL/IST toggles.
export function useElkLayout({ nodes, edges }: UseElkLayoutInput): UseElkLayoutResult {
  const positions = ref(new Map<string, { x: number; y: number }>());
  const pending = ref(false);
  const error = ref<Error | undefined>(undefined);
  const elk = new ELK();

  const inputKey = computed(() =>
    JSON.stringify({
      n: nodes.value.map((n) => n.id).sort(),
      e: edges.value.map((e) => `${e.from}->${e.to}`).sort(),
    }),
  );

  watchEffect(async () => {
    // Read the key so this effect re-fires whenever the input identity changes.
    void inputKey.value;

    pending.value = true;
    error.value = undefined;
    try {
      const graph = modelToElkGraph({ nodes: nodes.value, edges: edges.value });
      const laidOut = await elk.layout(graph);
      positions.value = elkResultToPositions(laidOut);
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause));
      positions.value = new Map();
    } finally {
      pending.value = false;
    }
  });

  return { positions, pending, error };
}
```

Notes:
- `elkjs/lib/elk.bundled.js` is the browser-friendly bundle — ships as ESM in `elkjs@0.12`. If the import path differs in the installed version (Nuxt may resolve `elkjs` differently), fall back to the default `import ELK from "elkjs"` and note in the commit body.
- `watchEffect` re-runs whenever `inputKey` changes — a re-fetch that returns the same node/edge topology won't re-layout, but that's rare in practice.
- `computed(() => JSON.stringify(...))` is a cheap identity hash for the input; heavier equality would be premature optimization.

**Step 2: Verify build + typecheck**
```bash
pnpm --filter specifyr-frontend build
pnpm typecheck
```
Both exit 0.

**Step 3: Commit**
```
Add useElkLayout async composable
```

---

## Task 5: Wire ELK positions into `frontend/pages/index.vue`

Replace the grid-position math with a positions lookup from `useElkLayout`. Show a subtle "Computing layout…" indicator while ELK runs.

**Files:** Modify `frontend/pages/index.vue`.

**Step 1: Read the current script block**

The current setup script builds `flowNodes` via `data.value.nodes.map((node, index) => ({ ..., position: { x: (index % 4) * 240, y: Math.floor(index / 4) * 160 }, ... }))`.

**Step 2: Introduce the layout composable**

Add at the top of `<script setup lang="ts">`:
```typescript
import { useElkLayout } from "../composables/useElkLayout.js";
```

After the existing `useFetch` block, before `flowNodes` / `flowEdges`, add:
```typescript
const layoutInput = computed(() => ({
  nodes: data.value?.nodes?.map((n) => ({ id: n.id, label: n.name })) ?? [],
  edges: data.value?.edges?.map((e) => ({ id: e.id, from: e.from, to: e.to })) ?? [],
}));
const { positions, pending: layoutPending } = useElkLayout({
  nodes: computed(() => layoutInput.value.nodes),
  edges: computed(() => layoutInput.value.edges),
});
```

**Step 3: Swap the `flowNodes` position calc**

Replace:
```typescript
const flowNodes = computed<FlowNode[]>(() => {
  if (!data.value?.nodes) return [];
  return data.value.nodes.map((node, index) => ({
    id: node.id,
    type: "default",
    position: {
      x: (index % 4) * 240,
      y: Math.floor(index / 4) * 160,
    },
    data: { label: `${node.name}\n(${node.type})` },
    class: `soll-node soll-node--${node.type}`,
  }));
});
```
With:
```typescript
const flowNodes = computed<FlowNode[]>(() => {
  if (!data.value?.nodes) return [];
  return data.value.nodes.map((node) => ({
    id: node.id,
    type: "default",
    position: positions.value.get(node.id) ?? { x: 0, y: 0 },
    data: { label: `${node.name}\n(${node.type})` },
    class: `soll-node soll-node--${node.type}`,
  }));
});
```

**Step 4: Add a small layout indicator to the TopBar**

Insert into the `<header class="editor-topbar">` block, near the source-meta span:
```vue
    <span v-if="layoutPending" class="editor-layout-status">· laying out…</span>
```

And in the scoped `<style>` block:
```css
.editor-layout-status {
  color: #6b7280;
  font-style: italic;
}
```

**Step 5: Rebuild frontend and probe**
```bash
pnpm --filter specifyr-frontend build
```
Expected: build succeeds. `.output/server/index.mjs` regenerated.

**Step 6: Commit**
```
Wire ELK auto-layout into the editor page
```

---

## Task 6: Extend `pnpm typecheck` to also cover the new composable path

If root `tsconfig.json` already includes `frontend/composables/**/*.ts` from Task 3, verify one more time. If NOT, add it here.

**Files:** possibly `tsconfig.json` (only if Task 3 skipped the include update).

**Step 1: Verify**
```bash
grep -A5 '"include"' tsconfig.json
```
Should list `frontend/composables/**/*.ts`.

**Step 2: If missing, add it and commit**
```
Extend tsconfig include to frontend/composables
```

If the include was already added in Task 3, this task is a no-op — skip to Task 7.

---

## Task 7: E2E test — verify layout produces distinct positions

Extend the existing IST integration test to spin up the editor, wait for the page to hydrate, and verify that Vue Flow's rendered nodes end up at DIFFERENT positions rather than all stacked at `{x:0, y:0}`.

The test does NOT spawn a headless browser (Slice X plan explicitly rules out Playwright). Instead, it verifies indirectly: assert that `/api/ist` returns non-empty edges (already), AND that the built `pages/index.vue` bundle references ELK — a minimal sanity check that the wiring didn't accidentally revert.

**Files:** Modify `tests/cli/editor-ist-integration.test.ts`.

**Step 1: Add a bundle-content assertion**

After the existing `expect(body.edges.length).toBeGreaterThan(0)` assertion, append inside the same `it(...)` block:
```typescript
    // Sanity check: the page bundle references ELK, so the layout composable
    // is wired in. A regression that dropped useElkLayout would silently ship
    // a build with the grid math again — this catches that.
    const { readFileSync, readdirSync } = await import("node:fs");
    const publicNuxt = resolve(process.cwd(), "frontend", ".output", "public", "_nuxt");
    const bundles = readdirSync(publicNuxt).filter((n) => n.endsWith(".js"));
    const anyMentionsElk = bundles.some((name) => {
      const content = readFileSync(resolve(publicNuxt, name), "utf8");
      return content.includes("elkjs") || content.includes("elk.algorithm") || content.includes("ELK");
    });
    expect(anyMentionsElk).toBe(true);
```

Also update the top-of-file `existsSync`/`resolve` imports if needed (they should already be present).

**Step 2: Rebuild + rerun**
```bash
pnpm build
pnpm test tests/cli/editor-ist-integration.test.ts
```
Expected: PASS — same 1 test, now with the additional assertion.

**Step 3: Commit**
```
Assert editor bundle references ELK in the E2E test
```

---

## Task 8: README + PR

**Files:** `README.md`.

**Step 1: Update the Status list**

Replace:
```markdown
Slice B (current): IST `imports` edges — module→module dependencies drawn as arrows in the Vue Flow graph. ✅
Slice C+ (planned): extends/implements edges, Python + Java IST, SOLL↔IST drift matching, auto-layout, editing via MCP.
```
With:
```markdown
Slice B: IST `imports` edges — module→module dependencies drawn as arrows in the Vue Flow graph. ✅
Slice ELK (current): ELK.js `layered` auto-layout replaces the 4-column grid. ✅
Slice C+ (planned): extends/implements edges, Python + Java IST, SOLL↔IST drift matching, layout persistence (`_layout.json`), editing via MCP.
```

**Step 2: Extend the editor usage note**

Change the paragraph that starts "The editor is read-only…" to mention layout:
Append at the end of that paragraph:
```markdown
Nodes are auto-laid out via ELK.js (`layered` algorithm, top-down) so
imports flow from top to bottom; you'll see a brief "laying out…" indicator
in the TopBar while ELK crunches larger graphs.
```

**Step 3: Full gate**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0. Test count: 184 baseline + 7 (elk-adapter) = **191 tests**.

**Step 4: Commit**
```
Update README with Slice ELK status
```

**Step 5: Push**
```bash
git push -u origin ts/slice-layout-elk
```

**Step 6: Open PR**
```bash
gh pr create --base main --head ts/slice-layout-elk \
  --title "TS rewrite Slice ELK: auto-layout with ELK.js" \
  --body-file - <<'EOF'
## Summary

Replaces the Vue Flow 4-column grid with ELK.js `layered` auto-layout so the IST graph is actually readable. Plan tracked in
[docs/plans/2026-09-07-specifyr-ts-slice-layout-elk.md](docs/plans/2026-09-07-specifyr-ts-slice-layout-elk.md).

### What's in

- **`frontend/composables/elk-adapter.ts`** — pure `modelToElkGraph` + `elkResultToPositions` functions. Zero ELK runtime dependency, unit-tested via root Vitest.
- **`frontend/composables/useElkLayout.ts`** — async composable that instantiates `new ELK()`, feeds the graph, awaits `elk.layout()`, exposes reactive `positions` / `pending` / `error` refs. Recomputes on every SOLL/IST toggle via `watchEffect` + a JSON identity key.
- **`frontend/pages/index.vue`** — swaps the `(index % 4) * 240` grid math for `positions.value.get(node.id) ?? { x: 0, y: 0 }`. Adds a "laying out…" indicator in the TopBar.
- **`elkjs@0.12.0`** as the sole new runtime dep. Pure JS + WASM, no native compile.
- **E2E test** now asserts the built bundle references ELK — a regression that dropped `useElkLayout` would silently ship the grid math again; this catches it.

### Non-goals for this slice
- Multiple layout algorithms (force, radial, tree) — `layered` only
- User-toggleable layout / settings panel
- Persisting layout via `_layout.json` (design doc §7.4 — later slice)
- `manual` flag override for individual nodes
- Layout caching between fetches (recompute is cheap at 143 nodes)
- Edge routing customization (Vue Flow default Bézier stays)
- Playwright browser tests — bundle-content check is our regression guard

## Test plan

- [x] `pnpm install --frozen-lockfile` clean
- [x] `pnpm build` clean (TS emit + pack copy + Nuxt build with elkjs bundled)
- [x] `pnpm lint`, `pnpm typecheck` clean (root + frontend)
- [x] `pnpm test` — 191 tests pass (baseline 184 + 7 new elk-adapter)
- [x] E2E integration test still green; bundle-content check confirms ELK is present

## Manual verification

    pnpm build
    node dist/cli/index.js editor . --no-open --port 3939
    # http://127.0.0.1:3939 → click IST → nodes rearrange into a top-down
    # layered graph instead of the 4-column grid. Import arrows flow
    # top→bottom, far fewer crossings.

## Notes for reviewer

- `NODE_WIDTH` / `NODE_HEIGHT` in `elk-adapter.ts` are module constants — if `pages/index.vue` later renders differently-sized nodes, we'll add a parameter (YAGNI for now).
- The `useElkLayout` composable creates one ELK instance per invocation. Cheap enough at this scale; if it ever hurts, a module-scoped singleton is a one-line change.
- `elk.layout()` can throw on malformed input; the composable catches into an `error` ref but the page doesn't yet render that gracefully — it will just show empty positions. If ELK ever fails in practice we'll add a fallback UI in a follow-up.
EOF
```

**Step 7: Wait for CodeRabbit before merging.**

---

## Notes for the executing agent

- **DRY:** `elk-adapter.ts` doesn't share type imports with `elkjs` on purpose. Two callers, structurally-compatible types, and the isolation lets Vitest run without a WASM roundtrip. Do NOT collapse.
- **YAGNI:** no algorithm parameter, no layout caching, no `manual` flag, no persistence, no per-view layout options. Every deferred item is called out in Non-goals — resist scope creep during review fixes.
- **Import discipline:** every local `.ts` import uses `.js` extension. `elkjs` types are structural; if `@types/elkjs` gets pulled in transitively, prefer it over hand-typed shapes in `elk-adapter.ts`.
- **TDD:** Task 3 is strict test-first. Tasks 4-8 are wiring / config / verification. There is no TDD for the composable — Task 3 covers the pure logic, Task 7 covers the wiring.
- **Main protected**, work on `ts/slice-layout-elk`, land via PR, **CR before merge**.
- **Do not touch** Slice 1 schemas, Slice 2 storage, Slice 3 CLI, Slice 4 vocabulary, Slice X's editor CLI, Slice A extractor, Slice B imports edges. All Slice ELK code is additive under `frontend/composables/` plus a small `pages/index.vue` diff and a package.json / tsconfig.json extension.
