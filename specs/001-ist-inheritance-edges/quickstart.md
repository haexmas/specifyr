# Quickstart: verify IST Inheritance Edges

This is the smoke-test procedure once `/speckit-implement` finishes. It exercises every user story from the spec end-to-end and confirms the acceptance scenarios that unit tests can't cover.

## Prereqs

1. Feature branch merged / checked out; `pnpm install` up to date.
2. `pnpm build` succeeds; `pnpm test` shows the new test files (`extract-inheritance.test.ts`, `resolve-symbol.test.ts`, extended `extract-imports.test.ts` + `extract.test.ts` + `neighbors.test.ts`) all passing.
3. Editor is running: `pnpm specifyr editor <repo>` — pick a **TypeScript** repo with visible class hierarchies and interface implementations. Specifyr's own source has none (`grep -c "extends" src/**/*.ts` = 0), so pick another repo. Any Vue Flow app, a NestJS project, or a repo with Zod-based classes works.

## Story 1 — inheritance edges appear in the model

1. In a shell: `curl -s http://127.0.0.1:3939/api/ist | jq '.edges | map(select(.type == "extends" or .type == "implements")) | length'`
2. Expected: a positive integer (matches the number of local inheritance edges the repo has).
3. Sample-inspect one edge: `curl -s http://127.0.0.1:3939/api/ist | jq '.edges | map(select(.type == "extends"))[0]'` — its `from` and `to` must both look like `ts-<hex>` symbol ids (not module ids).
4. Confirm regression-free: `jq '.edges | map(select(.type == "imports")) | length'` still matches the pre-feature import count.

## Story 2 — traverse hierarchies from the sidebar

1. Switch the editor to **IST** view.
2. Expand a folder that contains a class extending another class in the same repo.
3. Click the deriving class node.
4. **Verify**: the details sidebar shows an `Extends (N)` section listing the parent(s) as clickable rows. If the class implements interfaces, a `Implements (N)` section shows the interface(s) too. The existing `Imports` / `Imported by` sections still render as before.
5. Click the parent class row. **Verify**: selection moves to the parent; the sidebar refreshes to show an `Extended by (M)` section listing the deriving class (and any other derivations) as clickable rows.
6. Click an interface node in the same view. **Verify**: an `Implemented by (K)` section lists the implementing classes.
7. Click a node that is not part of any hierarchy (e.g., a `function` or a `type-alias`). **Verify**: no inheritance sections appear at all — no empty section is left behind.

## Story 3 — visually distinguishable on the canvas

1. Look at the canvas at typical zoom.
2. **Verify**: `imports` edges render with their existing style (smoothstep with the standard `--graph-arrow` color); `extends` edges render as **solid** with the same routing; `implements` edges render as **dashed**.
3. Expand a folder so that at least one `extends` edge is fully visible (both endpoints exposed). Confirm the style before collapsing.
4. Collapse the folder so both endpoints hide. **Verify**: the aggregated cross-wrapper edge still shows the `extends` style (single-type aggregate → keeps its type).
5. Find a wrapper pair that has BOTH an `imports` and an `extends` edge between contents on either side. Collapse to trigger aggregation. **Verify**: the aggregated edge renders in the `imports` style (mixed-type fallback per FR-011a and Story 3 scenario 4). Expand the wrappers to reveal both raw edges again.
6. Console check (devtools open): no Vue Flow warnings ("parent node ... not found"), no unhandled rejections.

## Regression — nothing existing broke

- `/api/ist`'s node list is unchanged (same length, same ids). Only the edges list grows.
- `Imports` / `Imported by` sections still work as before on any selected node.
- Search + auto-expand (Slice 5) still works.
- Hierarchy expand/collapse still works.

## Cleanup (post-verification)

- No cleanup needed if a public repo was used. If a scratch TS file was added to specifyr's own repo for testing, remove it.
- `feedback_editor_rebuild_needs_restart`: after any code change, rebuild (`pnpm build`) AND kill+restart the editor process. `pnpm build` alone does not update the running port-3939 editor.
