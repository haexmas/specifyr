# Search Auto-Expand (Slice 5) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enter on a search hit reveals it in the nested canvas by
auto-expanding its ancestor folder chain — no camera movement — with a
subtle highlight pulse on the match's file wrapper as the attention nudge.

**Architecture:** All of the ancestor-expansion machinery already exists.
The `selectionFilePath` watcher in [frontend/pages/index.vue:151-159](frontend/pages/index.vue#L151-L159)
adds the match's ancestor folder ids to both `expandedFolderIds` (tree
side) and `expandedCanvasIds` (canvas side). Slice 5 just:

1. Removes the surviving `fitView` call in `onSearchSubmit`
   ([frontend/pages/index.vue:144](frontend/pages/index.vue#L144)),
   because it re-introduces exactly the "camera teleport on top of a
   stable flow layout" that PR #28 removed everywhere else.
2. Adds a transient `matchHighlightId` ref → a `wrapper-highlight` CSS
   class on the match's owning file wrapper → a two-cycle keyframe pulse.
   The ref self-clears after ~1.6 s via `setTimeout`.
3. Updates the E2E bundle-guard whose current assertion insists that
   `fitView` survives into the JS bundle — that expectation is now
   inverted.

**Tech Stack:** Vue 3 (Nuxt), Vue Flow, TypeScript, Vitest,
Tailwind + shadcn-vue design tokens.

---

## Non-goals

- **No camera movement at all.** No `fitView`, no viewport translation,
  no `pendingFitId`, no `stayAtScreenPos`. See auto-memory
  `feedback_nested_canvas_review_adjustments.md` (Punkt 3) for why.
- **No file-wrapper auto-open for symbol matches.** If the match is a
  symbol inside `src/utils/bar.ts`, we open every ancestor folder down to
  the file, and highlight the file wrapper's badge — the wrapper itself
  stays collapsed. The design doc explicitly ties file-open to a click
  ("[the file's own box] stays collapsed (shows a "12 symbols" badge)
  unless clicked again", `docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md`
  lines 194-197). Same rule applies here: search brings the file wrapper
  into view; a click opens it.
- **No new search UI.** The header input, the "N matches" counter, the
  substring semantics of `matchNodes` — all unchanged.
- **No unit test for the animation.** Pure CSS behaviour; covered by the
  bundle-guard's presence check and manual smoke.

---

## Task 1: Invert the bundle-guard's Search assertion

The current bundle-guard demands that `fitView` (or `fit-view`) is
present in the built JS bundle for the Search sanity check to pass. In
this slice we're deliberately removing that call site, so the assertion
needs to flip: the guard should instead confirm that the search input
and the new highlight-class marker survive into the bundle.

**Files:**
- Modify: `tests/cli/editor-ist-integration.test.ts:143-155`

**Step 1: Rewrite the search bundle-guard assertion (test-first)**

Replace the block at [tests/cli/editor-ist-integration.test.ts:143-155](tests/cli/editor-ist-integration.test.ts#L143-L155)
with:

```ts
    // Search sanity check: the header input placeholder AND the
    // match-highlight class token must both survive into the JS bundle.
    // Slice 5 removed the fitView jump on Enter (camera stays put; only
    // the ancestor wrappers auto-expand and the match's file wrapper
    // pulses once). A regression that dropped the search input or
    // silently reintroduced fitView would break either the visible input
    // or the "no camera teleport" invariant — this catches both.
    const anyMentionsSearch = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return (
        content.includes("Search nodes") &&
        content.includes("wrapper-highlight")
      );
    });
    expect(anyMentionsSearch).toBe(true);

    // Camera-stability guard: no bundle may still contain a fitView
    // call. PR #28 removed the click/select-side call; Slice 5 removes
    // the search-side one. Any reintroduction is a regression against
    // the "flow layout is the eye's anchor" design decision.
    const anyBundleCallsFitView = bundles.some((name) => {
      const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
      return content.includes("fitView(") || content.includes("fit-view(");
    });
    expect(anyBundleCallsFitView).toBe(false);
```

**Step 2: Run the bundle guard to see it fail against the current build**

Run: `pnpm vitest run tests/cli/editor-ist-integration.test.ts -t "bundle"`

Expected: FAIL. Reason: the shipped bundle still contains
`fitView(` (from the search submit) AND does not yet contain the new
`wrapper-highlight` class. Both new assertions fail. This is red — good.

**Step 3: Commit the test change**

```bash
git add tests/cli/editor-ist-integration.test.ts
git commit -m "test: invert search bundle-guard for slice 5 (no fitView, highlight class present)"
```

---

## Task 2: Remove the fitView call from onSearchSubmit

Drop the camera-fit jump so Enter on a match only sets the selection
and lets the existing `selectionFilePath` watcher do the ancestor-open
work.

**Files:**
- Modify: `frontend/pages/index.vue:140-145` (onSearchSubmit body)
- Modify: `frontend/pages/index.vue:62` (drop the destructure)
- Modify: `frontend/pages/index.vue:1-10` (drop `useVueFlow` from imports)

**Step 1: Replace onSearchSubmit's body**

Replace lines 140-145 with:

```ts
function onSearchSubmit(): void {
  const first = matches.value[0];
  if (!first) return;
  // Selecting the match triggers the `selectionFilePath` watcher, which
  // adds every ancestor folder id to both `expandedFolderIds` and
  // `expandedCanvasIds`. No `fitView` — the flow layout guarantees that
  // expanding a wrapper never moves anything left/above of it, so the
  // user's eye stays anchored; the user pans over to the newly-visible
  // match wrapper themselves. See PR #28.
  selectedNodeId.value = first.id;
}
```

**Step 2: Drop the now-unused useVueFlow destructure**

Delete line 62: `const { fitView } = useVueFlow();`

A grep over `frontend/` confirms `fitView` and `useVueFlow` are used
nowhere else in application code (only in Vue Flow's own built output).

**Step 3: Drop useVueFlow from the imports**

At lines 1-10, remove the `useVueFlow,` line from the `@vue-flow/core`
named-import block. The remaining named imports (`VueFlow`,
`type Node as FlowNode`, `type Edge as FlowEdge`, `MarkerType`,
`type NodeMouseEvent`) stay.

**Step 4: Typecheck**

Run: `pnpm typecheck` (or `pnpm build` if there's no dedicated typecheck
script — check `package.json` scripts first).

Expected: PASS. `useVueFlow`/`fitView` removals leave no dangling refs.

**Step 5: Verify the search bundle-guard's `fitView` assertion now passes**

Run: `pnpm build` then `pnpm vitest run tests/cli/editor-ist-integration.test.ts -t "bundle"`

Expected: the `anyBundleCallsFitView` sub-assertion now passes
(no bundle contains `fitView(`); the `anyMentionsSearch` sub-assertion
still fails because we haven't added `wrapper-highlight` yet. Overall
test still red — that's expected until Task 3.

**Step 6: Commit**

```bash
git add frontend/pages/index.vue
git commit -m "feat(editor): drop fitView from search-Enter — flow layout is the anchor"
```

---

## Task 3: Transient highlight pulse on the match's file wrapper

Once Enter runs, mark the match's owning file wrapper as `wrapper-highlight`
for ~1.6 s. That flags "this is what your search landed on" without
moving the camera. Two pulse cycles (2× 800 ms) is enough to catch the
eye, short enough not to become a distraction.

**Files:**
- Modify: `frontend/pages/index.vue` (script: new ref, extend
  onSearchSubmit, extend flowNodes; style: keyframes + rule)

**Step 1: Add the highlight-id ref and a small teardown**

After the `matchIds` computed (currently
[frontend/pages/index.vue:115-117](frontend/pages/index.vue#L115-L117)),
add:

```ts
// Transient marker so the match's owning file wrapper can pulse once
// after Enter. Cleared by a setTimeout so it never lingers into an
// unrelated selection change. Both timer and ref are torn down on
// unmount to avoid setting state after the component is gone.
const matchHighlightId = ref<string | undefined>(undefined);
let matchHighlightTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => {
  if (matchHighlightTimer) clearTimeout(matchHighlightTimer);
});
```

Note: `onBeforeUnmount` is already imported/used further down in the
file (search for the existing picker-esc teardown). Keep the two
`onBeforeUnmount` calls separate — Vue supports multiple registrations
and this keeps the concerns adjacent to their own state.

**Step 2: Extend onSearchSubmit to set the highlight**

Update the body from Task 2 to:

```ts
function onSearchSubmit(): void {
  const first = matches.value[0];
  if (!first) return;
  selectedNodeId.value = first.id;
  // The pulse lands on the *file wrapper* that owns the match, not
  // the raw match id — matches can be symbols, and symbol nodes are
  // only visible when the user then clicks the file wrapper open.
  // Highlighting the wrapper works for both file matches (wrapper IS
  // the match) and symbol matches (wrapper is where the symbol lives).
  const owner = findFilePath(hierarchy.value, first.id);
  const highlightId = owner?.fileId ?? first.id;
  matchHighlightId.value = highlightId;
  if (matchHighlightTimer) clearTimeout(matchHighlightTimer);
  matchHighlightTimer = setTimeout(() => {
    matchHighlightId.value = undefined;
    matchHighlightTimer = undefined;
  }, 1600);
}
```

`findFilePath` is already imported at the top of the file.

**Step 3: Wire the class into the wrapper node output**

In the `flowNodes` computed (currently starting at
[frontend/pages/index.vue:180](frontend/pages/index.vue#L180)), inside
the `if (entry.kind === "folder" || entry.kind === "file")` branch,
change the `class` field of `wrapperNode` from:

```ts
class: `wrapper-node ${expanded ? "wrapper-expanded" : "wrapper-collapsed"}`,
```

to:

```ts
class: [
  "wrapper-node",
  expanded ? "wrapper-expanded" : "wrapper-collapsed",
  entry.id === matchHighlightId.value ? "wrapper-highlight" : "",
]
  .filter(Boolean)
  .join(" "),
```

Trailing empty string filtered so we never emit `"foo  bar"` (double
space) — Vue Flow's class handling is fine with it but the diff reads
cleaner.

**Step 4: Add the keyframe rule to the `<style>` block**

At the end of the `<style>` block in
[frontend/pages/index.vue](frontend/pages/index.vue) (after the
`.wrapper-node.wrapper-collapsed.vue-flow__node-default` rule), append:

```css
/* Two-cycle pulse used by Slice 5's search-Enter to mark the match's
   owning file wrapper without moving the camera. Ring colour is a
   softened `--graph-arrow` so it reads on both themes. Duration/count
   picked to catch the eye without becoming a distraction (2 × 800 ms
   ≈ 1.6 s, matches the timer that clears `matchHighlightId`). */
@keyframes wrapper-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  30% {
    box-shadow: 0 0 0 6px color-mix(in oklab, var(--graph-arrow), transparent 40%);
  }
}
.wrapper-node.wrapper-highlight.vue-flow__node-default {
  animation: wrapper-pulse 800ms ease-out 2;
}
```

**Step 5: Rebuild and rerun the bundle guard**

Run: `pnpm build` then `pnpm vitest run tests/cli/editor-ist-integration.test.ts -t "bundle"`

Expected: PASS. `Search nodes` and `wrapper-highlight` both survive the
build; `fitView(` does not.

**Step 6: Run the full test suite as a regression sweep**

Run: `pnpm test` (or the project's equivalent — check `package.json` if
unsure).

Expected: PASS across all suites. Nothing else touches `onSearchSubmit`
or `fitView`; the only test that referenced them is the one we already
rewrote in Task 1.

**Step 7: Commit**

```bash
git add frontend/pages/index.vue
git commit -m "feat(editor): transient highlight pulse on search-Enter match wrapper"
```

---

## Task 4: README status bump

Add a slice line so the shipped-slices ledger stays honest.

**Files:**
- Modify: `README.md` (after the "Slice Edge Aggregation" line at
  [README.md:79](README.md#L79))

**Step 1: Insert a new slice line**

Between the "Slice Edge Aggregation" line
([README.md:79](README.md#L79)) and the "Slice C+ (planned)" line
([README.md:80](README.md#L80)), insert:

```markdown
Slice Search Auto-Expand: Enter on a search hit auto-expands the ancestor folder chain of the first match so its file wrapper becomes visible on the nested canvas; the camera does not move (the flow layout's "expanding a wrapper never shifts left/above content" invariant is the eye's anchor) and the match's file wrapper pulses once as an attention nudge. Fifth and final slice of the Explorer/Canvas/Details redesign ([docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md](docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md)). ✅
```

Also downgrade the existing "Slice Edge Aggregation (current)" label:
drop the "(current)" — after this slice ships it's no longer current.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README bump for search auto-expand slice"
```

---

## Task 5: Manual smoke test (blocks merge, per feedback_editor_rebuild_needs_restart)

**Files:** none.

**Step 1: Rebuild AND restart the editor**

Per auto-memory `feedback_editor_rebuild_needs_restart`: `pnpm build`
alone does NOT update the running port-3939 editor. Kill the existing
node process (`pkill -f 'node .*3939'` or find the pid via `ss -lntp
| grep 3939`) and restart it via whatever script is used for the
editor's dev server (check `package.json` for `editor` / `preview` /
`start` scripts, or the CLI's `specifyr editor` entrypoint if that's
what the running instance was launched with).

Sanity-check the served bundle actually contains our change:

```bash
curl -s http://localhost:3939 | head -c 200
```

should return HTML (not "connection refused"), and:

```bash
curl -s "http://localhost:3939/_nuxt/" 2>/dev/null || \
  find frontend/.output/public/_nuxt -type f -name '*.js' -printf '%f\n' \
  | head -5 \
  | xargs -I{} grep -l "wrapper-highlight" frontend/.output/public/_nuxt/{}
```

should list at least one bundle file containing `wrapper-highlight`.

**Step 2: In the browser, verify the three cases**

Point the browser at http://localhost:3939 (or your usual editor URL)
against a repo with nested folders and multiple files.

1. **Type a query that matches a top-level file** (e.g. `README` if it
   exists as a module). Press Enter. Expected: the Explorer tree
   highlights the file; on the canvas, the file's containing folders
   are already open (or open now); the file wrapper pulses once
   (two cycles, ~1.6 s); the camera does NOT move.
2. **Type a query that matches a symbol inside a nested folder**
   (e.g. `buildHierarchy`). Press Enter. Expected: the tree highlights
   `frontend/composables/build-hierarchy.ts`; on the canvas, both
   `frontend/` and `frontend/composables/` are now expanded; the
   `build-hierarchy.ts` wrapper is visible (as a collapsed badge) and
   pulses once. The camera does NOT move — if the newly-visible wrapper
   is off-screen, panning is on the user.
3. **Type a query with zero matches.** Press Enter. Expected: no state
   change (`if (!first) return`); no console errors.

**Step 3: Console check**

Open devtools. Expected: no Vue Flow warnings ("parent node ... not
found" would flag a hierarchy-ordering regression), no unhandled
promise rejections from a stray `fitView`.

---

## Ordering / dependencies

Tasks 1 → 2 → 3 must run in order (Task 1 is a red test; Task 2 flips
one of its sub-assertions to green; Task 3 flips the other). Task 4
(README) and Task 5 (smoke) are independent of each other but must
follow Task 3.

Every commit should leave the tree buildable, but only after Task 3 do
the tests all pass together — that's the point of TDD's red-green
sequence and is fine.
