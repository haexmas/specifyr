# Slice Search + Fit-to-node Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** A search input in the editor header lets users find nodes by name or path substring. Non-matching nodes dim as they type. Pressing Enter selects the first match, moves the camera to it, and drops into the existing details+neighbors sidebar. Users can start exploration from any point in the graph, not just from a click.

**Architecture:** Pure `matchNodes(query, nodes)` composable returns nodes whose `name` OR `path` contains the query, case-insensitive. Header gains a text input bound to a `searchQuery` ref. `flowNodes.class` gains a second dim source: a node is dimmed when there is a selection AND it is not in `neighborIds`, OR when there is a search query AND it is not in `matchIds`. Enter on the input sets `selectedNodeId` to the first match and calls Vue Flow's `fitView({ nodes: [id] })` — that pans/zooms the camera without touching ELK positions, so the Plan-001 no-jump contract holds (layout is fixed; only viewport moves).

**Tech Stack:** Vue 3 composables, Vue Flow 1.42 (`useVueFlow` for `fitView`), Tailwind CSS 4, Vitest, existing `Node` Zod schema.

**Non-goals:**
- Fuzzy / ranked / typo-tolerant matching (plain case-insensitive substring only)
- Full result dropdown / arrow-key navigation through matches (Enter always jumps to first match)
- Regex mode, quoted phrases, boolean operators
- Search across edges, types, descriptions, or vocabulary attributes (name + path only)
- Persistent search history / recent queries
- Debouncing (query set is tiny — a few hundred nodes; direct reactive re-compute is fine)
- URL-syncing the query
- Highlighting matched substrings inside node labels

---

## Task 1: Branch + plan doc

**Files:**
- Create: `docs/plans/2026-09-08-specifyr-ts-slice-search-and-fit.md` (this file)

**Step:**

```bash
git add docs/plans/2026-09-08-specifyr-ts-slice-search-and-fit.md
git commit -m "Add Slice Search plan: header input + fit-to-node"
```

---

## Task 2: `matchNodes` helper (TDD)

**Files:**
- Create: `frontend/composables/search-nodes.ts`
- Test: `tests/frontend/search-nodes.test.ts`

**Contract:**

```typescript
import type { Node } from "specifyr";

export function matchNodes(query: string, nodes: readonly Node[]): Node[];
```

Rules:
- Empty / whitespace-only query → return empty array (caller uses "empty means no filter", so no matches = no dim).
- Trim the query before matching.
- Case-insensitive substring match against `node.name` AND `node.path` (if `path` is present). A hit in either counts.
- Return order: preserve the order of `nodes` (do not re-sort). Callers can display "first match" reliably.
- Do not dedupe — the input `nodes` should already have unique ids; if callers pass duplicates the function does not attempt to fix that.
- No throw for missing `path` (it's optional in the schema).

**Tests to write (TDD — red first, then implement, then green):**

- Empty query → `[]`
- Whitespace-only query → `[]`
- Trimmed query matches (leading/trailing spaces)
- Name substring match (case-insensitive)
- Path substring match (case-insensitive) even when name doesn't match
- Node without `path` — matched by name works, no crash
- Multiple matches returned in input order
- No match → `[]`

**Commit:**

```bash
git add frontend/composables/search-nodes.ts tests/frontend/search-nodes.test.ts
git commit -m "Add matchNodes composable for header search (TDD)"
```

---

## Task 3: Wire header input + fit-to-node

**Files:**
- Modify: `frontend/pages/index.vue`

**Sub-steps:**

1. Import `matchNodes` from `../composables/search-nodes.js`.
2. Import `useVueFlow` from `@vue-flow/core`. Destructure `fitView` from it: `const { fitView } = useVueFlow();`. Call this at top-level of `<script setup>` (Vue Flow needs the component to have mounted; `fitView` will simply no-op on the first tick if the graph isn't rendered yet — reads are safe).
3. Add `searchQuery: ref("")`.
4. Add `matches: computed<Node[]>` = `matchNodes(searchQuery.value, data.value?.nodes ?? [])`.
5. Add `matchIds: computed<Set<string>>` — set of `matches.value[*].id`.
6. Extend the existing `flowNodes` dim rule so a node is dimmed when:
   - There is a selection AND the node is not in `neighborIds` (existing rule), OR
   - The trimmed query is non-empty AND the node is not in `matchIds`.
   Both rules combine via OR — either can dim; the selected/neighbor node stays lit under the neighbor rule, a matched node stays lit under the search rule.
7. Add an `onSearchSubmit` handler:
   ```typescript
   function onSearchSubmit(): void {
     const first = matches.value[0];
     if (!first) return;
     selectedNodeId.value = first.id;
     void fitView({ nodes: [first.id], duration: 400, padding: 0.3 });
   }
   ```
   `void` because `fitView` returns a Promise we do not need to await.
8. Header template — add the input next to the SOLL/IST segmenter (inside the existing `<header>`, after the segmenter's closing `</div>`):
   ```html
   <form class="flex items-center" role="search" @submit.prevent="onSearchSubmit">
     <label class="sr-only" for="node-search">Search nodes</label>
     <input
       id="node-search"
       v-model="searchQuery"
       type="search"
       placeholder="Search nodes…"
       class="w-64 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
     />
     <span
       v-if="searchQuery.trim()"
       class="ml-2 text-xs text-zinc-500"
       aria-live="polite"
     >
       {{ matches.length }} match{{ matches.length === 1 ? "" : "es" }}
     </span>
   </form>
   ```

**Verify:**
- `pnpm typecheck` clean
- `pnpm lint` clean
- Full `pnpm test` still green (baseline 215 + new helper tests)
- `pnpm --filter specifyr-frontend build` succeeds
- Layout stability: `frontend/composables/useElkLayout.ts` byte-identical to `main`. Camera fit is a viewport op, not a layout op.

**Commit:**

```bash
git add frontend/pages/index.vue
git commit -m "Wire header search input + fit-to-node camera"
```

---

## Task 4: Code-review checkpoint

Dispatch `superpowers:code-reviewer`. Focus:

- **Layout stability (Plan-001 no-jump)** — `useElkLayout.ts` untouched; `fitView` does not touch positions. Verify.
- **Search + neighbor dim interaction** — both rules combine via OR. Confirm the selected node itself is never dimmed (it is in `neighborIds` because `neighborIds` includes `selectedNodeId`). Confirm a searched-and-selected node is not dimmed by search either (it is in `matchIds` because the selection came from a match).
- **`fitView` no-op safety** — called on submit; graph must be rendered by that time (user has to see the input to type into it, so the graph exists). Still, wrap in `if (fitView)` if the type says it can be undefined; else trust the API.
- **Query trim consistency** — the header shows the match count only when `searchQuery.trim()` is non-empty; the dim rule uses the same predicate. Both must agree so users never see "0 matches" while nothing dims. Verify.
- **A11y** — `role="search"` on the form, `sr-only` label on the input, `aria-live="polite"` on the count. Consistent with the existing `role="group"` and `aria-label="View source"` on the segmenter.
- **Empty-graph edge case** — data.value?.nodes may be undefined during load; `matchNodes(query, [])` returns `[]`. Verify.
- **Header layout** — the new form sits inside the same flex row as the segmenter and meta info; verify it doesn't collapse on narrow widths (input has fixed `w-64`; header is `flex items-center gap-2` — should wrap or scroll gracefully).

Apply approved suggestions before proceeding.

---

## Task 5: E2E bundle-content guard

**Files:**
- Modify: `tests/cli/editor-ist-integration.test.ts`

**Step:** Add a sibling assertion right after the neighbors guard:

```typescript
const anyMentionsSearch = bundles.some((name) => {
  const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
  return content.includes("Search nodes") && (content.includes("fitView") || content.includes("fit-view"));
});
expect(anyMentionsSearch).toBe(true);
```

Confirm markers survive Vue's template compilation and Vite's minification:
```bash
pnpm --filter specifyr-frontend build
grep -l "Search nodes" frontend/.output/public/_nuxt/*.js
grep -oE '(fitView|fit-view)' frontend/.output/public/_nuxt/*.js | head -3
```

If `fitView` is minified away, fall back to grepping the placeholder `Search nodes…` alone (still uniquely identifies the search UI).

**Commit:**

```bash
git add tests/cli/editor-ist-integration.test.ts
git commit -m "Guard header search + fitView in bundle"
```

---

## Task 6: README bump + green + push + PR

**Files:**
- Modify: `README.md`

**Step 1:** Under `## Status`, add:

```
Slice Search (current): header input filters/highlights nodes by name or path; Enter jumps and fits the camera to the first match without re-layout. ✅
```

Move the previous `(current)` off Slice Neighbors.

**Step 2:** Green gate:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Step 3:** Commit + push + PR:

```bash
git add README.md
git commit -m "docs: bump README status to Slice Search"
git push -u origin ts/slice-search-and-fit
```

PR body — Summary + Test plan, mention: search substring rule, dim-OR interaction, Enter-jump + fitView, layout-contract untouched, E2E bundle guard.

---

## Execution notes for the subagent chain

- Baseline (main tip `2491639`): 215 tests, 34 files, 89 Biome-checked files.
- Task 2 is pure TDD — one implementer subagent.
- Task 3 is page wiring — one implementer subagent; must confirm `useElkLayout.ts` byte-identical to main.
- Task 4 is code-review checkpoint after 2-3.
- Task 5 is one-file additive.
- Task 6 wraps up.
- Do NOT restart the editor on port 3939.
