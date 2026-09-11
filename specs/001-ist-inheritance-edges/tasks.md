---
description: "Task list for feature 001-ist-inheritance-edges"
---

# Tasks: IST Inheritance Edges

**Input**: Design documents from `/specs/001-ist-inheritance-edges/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Project follows TDD (existing 330-test suite; every prior slice shipped with tests-first). New tests are written to fail red, then implementations make them green. The auto-memory `feedback_cr_before_merge` describes the review pattern this feature will follow.

**Organization**: Tasks are grouped by user story. **Note on independence**: US2 (Sidebar) and US3 (Canvas rendering) both require US1's edges to exist in the model to be meaningfully testable — they are not truly parallelizable with US1, only with each other. The Dependencies section documents this.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1, US2, US3). Setup / Foundational / Polish tasks carry no story label.

## Path Conventions

- Monorepo: `src/` (root TS library + extractor + CLI), `frontend/` (Nuxt workspace), `tests/` (Vitest, split by domain).
- Paths below are repo-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the baseline is clean before adding anything.

- [ ] T001 Verify baseline is green: run `pnpm build && pnpm lint && pnpm typecheck && pnpm test` — all must pass on branch `001-ist-inheritance-edges` before any task below.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: satisfy the spaex constitution's graphify-first gate before authoring any of the three new named artifacts (`extractInheritance`, `resolveSymbol`, and the widened `Neighbors`).

**⚠️ CRITICAL**: no US1 authoring may begin until T002 is complete.

- [ ] T002 Run graphify consultation per `.spaex/constitution.md` (graphify-first-authoring principle) **BEFORE any US1 authoring task starts, not after**. Execute `graphify query "extract inheritance"`, `graphify query "resolve symbol import"`, `graphify query "class heritage"`, `graphify query "neighbors extends implements"`. Evaluate every candidate the graph returns (including unexported / incomplete artifacts — they still count). Decide, transparently, per the constitution's three outcomes: **identical or near-identical** → HALT and respond to the operator using the refuse-then-propose format (Candidate `file:line`, Proposed extended signature, Estimated lines saved, One concrete call-site rewrite proof-of-concept — DO NOT proceed with authoring until the operator approves the refactor or explicitly directs to author the new module). **Borderline** → HALT and ask the operator (don't decide autonomously). **Clearly independent** → proceed with T007–T010; note in your response which candidates were evaluated and why they didn't match. Document the consultation output (queries + candidates + decision) in the analysis output of this task, not in a later commit. If graphify tooling fails, warn once and continue authoring per the constitution's tool-failure semantics (warn-and-proceed).

**Checkpoint**: graphify consultation done; ready to author.

---

## Phase 3: User Story 1 - Inheritance edges appear in the extracted model (Priority: P1) 🎯 MVP

**Goal**: The IST extractor emits `extends` and `implements` edges alongside the existing `imports` edges. `/api/ist` (and any direct consumer of the extractor) sees the new edges in the model. UI is untouched — value is data-side only.

**Independent Test**: fetch `/api/ist` for a repo with at least one in-repo `class Child extends Parent` and one `class Foo implements Bar`; the returned model contains an `extends` edge (Child → Parent) and an `implements` edge (Foo → Bar); the existing `imports` edges are unaffected.

### Tests for User Story 1 (TDD — write failing, then implement)

- [ ] T003 [P] [US1] Update `tests/extractors/typescript/extract-imports.test.ts` with assertions on the new `bindings: RawImportBinding[]` field per [contracts/extract-inheritance.md](contracts/extract-inheritance.md) and [data-model.md](data-model.md#rawimport-extended): cover named imports (with and without alias), namespace imports (`import * as NS`), default imports (`import D from`), and side-effect imports (`bindings: []`).
- [ ] T004 [P] [US1] Create `tests/extractors/typescript/extract-inheritance.test.ts` with the 8 behavior-contract cases from [contracts/extract-inheritance.md](contracts/extract-inheritance.md#behavior-contract-must-hold-for-all-inputs) plus edge cases: `class Foo extends Bar {}`, `class Foo implements A, B {}`, combined extends+implements, `abstract class`, `interface Foo extends A, B {}`, empty interface, `Base<T>` generic stripping, `Bar.Baz` namespace drop, empty file.
- [ ] T005 [P] [US1] Create `tests/extractors/typescript/resolve-symbol.test.ts` with the behavior-contract cases from [contracts/resolve-symbol.md](contracts/resolve-symbol.md#behavior-contract-must-hold-for-all-inputs): same-file local hit, imported hit, aliased-imported hit, missing target file, missing export in target file, identifier not imported at all, transitive re-export, aliased re-export, cyclic re-export, and duplicate exported/local target names (ambiguous candidates return undefined). Add the shadowing case explicitly (both same-file AND imported → same-file wins), and verify unsupported target kinds (`function`, `enum`, `type-alias`) and non-exported declarations are absent from the export index.
- [ ] T006 [P] [US1] Extend `tests/extractors/typescript/extract.test.ts` with end-to-end fixture repos (temp dirs, `mkdirSync` + `writeFileSync` — pattern from existing `extract.test.ts`) that cover: class extends class same-file → 1 extends edge; class extends imported class → 1 cross-file extends edge; class implements 1 local + 1 imported interface → 2 implements edges; interface extends 2 interfaces → 2 extends edges; class extends through a transitive aliased re-export → 1 edge; cyclic re-export → no edge and no hang; class extends unknown external → no inheritance edge and no crash; duplicate declaration dedup → single edge. Add fixtures proving private declarations and function/enum/type-alias targets cannot create inheritance edges, plus two same-named source declarations with separate heritage clauses that resolve to their own `fromNodeId`. **Also add a determinism test** (spec SC-003): call `extractIst` twice on the same fixture repo, sort both `.edges` arrays by `id`, assert deep equality — guarantees the extraction is reproducible.

**Checkpoint after T003–T006**: run `pnpm test tests/extractors/typescript/` — all four test files RED for the intended reasons (module not found / assertion mismatch).

### Implementation for User Story 1

- [ ] T007 [US1] Widen `src/extractors/typescript/extract-imports.ts` per [data-model.md](data-model.md#rawimport-extended): extend `RawImport` with a `bindings: RawImportBinding[]` field, extract `RawImportBinding = { local, imported }` from `import_clause` children (named + namespace + default; side-effect imports produce `bindings: []`). Preserve existing `{fromRelative, specifier}` shape so pass 2 in `extract.ts` keeps working. T003 goes green.
- [ ] T008 [P] [US1] Create `src/extractors/typescript/extract-inheritance.ts` per [contracts/extract-inheritance.md](contracts/extract-inheritance.md): export `RawInheritance` interface, `extractInheritance` (async convenience wrapper), and `extractInheritanceFromTree` (walks class_declaration / abstract_class_declaration / interface_declaration heritage clauses, unwraps `generic_type`, drops `member_expression`). Each record must carry the exact source `fromNodeId` using the same duplicate-name identity scheme as `extractSourceFromTree`; T004 goes green. Follows the `extract-source.ts`/`extract-imports.ts` module style.
- [ ] T009 [P] [US1] Create `src/extractors/typescript/resolve-symbol.ts` per [contracts/resolve-symbol.md](contracts/resolve-symbol.md): export `SymbolIndex` + `FileImportIndex` interfaces and `resolveSymbol` function with priority order same-file locals → imported names → drop. Restrict target lookup to class/interface nodes and exported declarations; accept the source `fromNodeId` rather than recovering it from a potentially duplicate name. Pure functional module, no state. T005 goes green.
- [ ] T010 [US1] Wire Pass 3 into `src/extractors/typescript/extract.ts` per [data-model.md](data-model.md#data-flow-extraction): collect `RawInheritance[]` inside pass 1's per-file loop (call `extractInheritanceFromTree` alongside `extractImportsFromTree`, tree still in hand — no re-parse); build the exported `SymbolIndex` and nested same-file class/interface index once after pass 1; for each file build `FileImportIndex` (via `resolveImport` on each binding's specifier) and reuse its precomputed locals; take `fromId` directly from each record's `fromNodeId` and resolve only its target through `resolveSymbol`; skip unresolved and self-loops (`fromId === toId`); dedupe by `(fromId, toId, edgeType)`; emit edges with `istEdgeId(fromId, toId, edgeType)` and `type ∈ {"extends", "implements"}`. T006 goes green.

**Checkpoint after T007–T010**: `pnpm test tests/extractors/typescript/` all GREEN. `pnpm build && pnpm test` fully green. Commit as one logical chunk (or two: RawImport widening + inheritance pipeline). User Story 1 is complete and shippable as data-only value; `/api/ist` now returns inheritance edges.

---

## Phase 4: User Story 2 - Traverse hierarchies from the details sidebar (Priority: P2)

**Goal**: Clicking a class or interface node in the editor shows separate sidebar sections for extends / extended by / implements / implemented by, each with clickable rows that navigate the selection.

**Independent Test**: with US1 edges in the model, click a class node in the editor; verify the sidebar renders an `Extends (N)` section listing parents as clickable rows; click a parent, verify `Extended by (N)` appears with the child; interface nodes show `Implemented by`; nodes without inheritance show none of the new sections (no empty placeholders).

**Depends on**: US1 (needs edges present in the model).

### Tests for User Story 2 (TDD)

- [ ] T011 [P] [US2] Extend `tests/frontend/neighbors.test.ts` to cover the widened `Neighbors` shape per [contracts/neighbors.md](contracts/neighbors.md): all six buckets returned; extends and implements populate their buckets in both directions; dangling edges silently skipped in ALL buckets; self-loops skipped in ALL buckets; unknown edge types contribute to no bucket (forward-compat); non-existent `nodeId` returns six empty lists. Fix the `implementsList` field name (reserved-word workaround) at every call site.

### Implementation for User Story 2

- [ ] T012 [US2] Widen the `Neighbors` interface and `neighborsOf` in `frontend/composables/neighbors.ts` per [contracts/neighbors.md](contracts/neighbors.md): add `extends`, `extendedBy`, `implementsList`, `implementedBy`; single-pass edge walk with `switch(edge.type)`; preserve dedupe + name-sort semantics. T011 goes green.
- [ ] T013 [US2] Update `frontend/pages/index.vue` script section: the `neighborIds` computed (currently around line 98) must union all six lists (imports + importedBy + extends + extendedBy + implementsList + implementedBy) into the dim-computation Set. No other script changes.
- [ ] T014 [US2] Add four new sections to `frontend/pages/index.vue`'s Details sidebar template, mirroring the existing `Imports (N)` / `Imported by (N)` sections: `Extends (N)` / `Extended by (N)` / `Implements (N)` / `Implemented by (N)`, each with `v-if="neighbors.<bucket>.length"` (per FR-010: hide entirely when empty), each with the same clickable `<button>`-per-`<li>` layout that binds `@click="selectedNodeId = n.id"`, each without cap/truncation (per FR-010a: scroll like the existing sections). Keep the aside's existing `overflow-y-auto` behavior.

**Checkpoint after T011–T014**: US1 + US2 fully functional. `pnpm test` green. Manual smoke: pick any class node in a repo with inheritance → sidebar shows Extends, click through works.

---

## Phase 5: User Story 3 - Inheritance is visually distinguishable on the canvas (Priority: P3)

**Goal**: The canvas renders `extends` edges solid, `implements` edges dashed, existing `imports` unchanged. Mixed-type cross-wrapper aggregates fall back to the imports style per FR-011a.

**Independent Test**: with US1 edges in the model, load a repo with at least one `extends` and one `implements` edge on the canvas. Visually distinguish the three types. Collapse wrappers so an inheritance edge aggregates alone → still shown as its type. Find a wrapper pair with mixed types → aggregate shows in imports style.

**Depends on**: US1 (needs edges present); independent of US2.

### Tests for User Story 3 (TDD)

- [ ] T015 [P] [US3] Extend `tests/frontend/edge-aggregation.test.ts` per [data-model.md](data-model.md#data-flow-canvas-rendering): every emitted `AggregatedEdge` now carries a `types: Set<string>` field; single-type collapse preserves the type; multi-type collapse produces `types.size > 1`; the `count` field still increments across type mixes (mixed aggregates count all raw edges).

### Implementation for User Story 3

- [ ] T016 [US3] Extend `AggregatedEdge` in `frontend/composables/edge-aggregation.ts` per [data-model.md](data-model.md#data-flow-canvas-rendering): add `types: Set<string>`; when two raw edges collapse into one aggregate, union their type sets. Selection-dim logic (`visibleAncestors`) unchanged. T015 goes green.
- [ ] T017 [US3] Update the `flowEdges` computed in `frontend/pages/index.vue` per spec FR-011 + FR-011a: pick styling from `edge.types` — if `types.size === 1 && types.has("extends")` → solid smoothstep; if `types.size === 1 && types.has("implements")` → smoothstep with `strokeDasharray: "6 4"`; otherwise → current imports style (mixed-type fallback). Selection-dim rules unchanged.

**Checkpoint after T015–T017**: US1 + US2 + US3 all complete. `pnpm build && pnpm test` fully green. Manual smoke: canvas shows three visually distinct edge types; mixed aggregate falls back to imports style.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 Extend the bundle-guard in `tests/cli/editor-ist-integration.test.ts` (Search / Repo-picker / Explorer pattern): assert that the built JS bundle contains `Extends (` and `Implements (` (the new sidebar section headings). Add a comment explaining that specifyr's own source has no `extends`/`implements` so the content of the sections isn't asserted from the specifyr repo directly.
- [ ] T019 Add a slice line to `README.md`'s Status section after the Search Auto-Expand line and before "Slice C+ (planned)". Format matches the surrounding lines. Also downgrade "Slice C+ (planned)" — remove `extends/implements edges` from its list.
- [ ] T020 Final verification: `pnpm lint && pnpm typecheck && pnpm build && pnpm test` — all green with no skipped tests.
- [ ] T021 Manual smoke test per [quickstart.md](quickstart.md): rebuild + restart the port-3939 editor (per `feedback_editor_rebuild_needs_restart`), run all three stories' verification steps against a real TS repo with visible class hierarchies (specifyr's own has none — pick another repo), console clean.
- [ ] T022 Commit + push + open PR against `main`; wait for CodeRabbit per `feedback_cr_before_merge`; address every valid finding; merge; post-merge editor rebuild + restart. Update auto-memory (`project_hierarchy_redesign_progress`? — no, this is a different project; add a new project memory if the Query-UI slice is imminent). Delete branch on merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies, start immediately.
- **Foundational (Phase 2)**: depends on Setup — MUST complete before any US1 authoring.
- **US1 (Phase 3)**: depends on Foundational (T002 graphify gate).
- **US2 (Phase 4)**: depends on **US1** — sidebar has nothing to show until the edges exist in the model. NOT independent of US1.
- **US3 (Phase 5)**: depends on **US1** — canvas has nothing to differentiate until the edges exist. NOT independent of US1. Independent of US2 (works on canvas, US2 works on sidebar).
- **Polish (Phase 6)**: depends on US1 + US2 + US3.

### User Story Dependencies

The template's ideal ("each user story independent") does not hold here — US1 is the data producer that both US2 and US3 consume. This is honest for a data-then-UI feature. **After US1 is done, US2 and US3 CAN run in parallel** (they touch different composables and different sidebar/canvas concerns).

### Within Each User Story

- Tests written first and RED before implementations.
- For US1: implementations T007, T008, T009 touch different files and are parallel-safe among themselves; T010 depends on all three.
- For US2 and US3: linear within their phase; small enough that parallel doesn't buy much.

### Parallel Opportunities

- **Test-writing burst** at the start of US1: T003, T004, T005, T006 all touch different files → run in parallel.
- **Implementation burst** in US1 after tests: T008 and T009 are parallel; T007 is on its own file (also parallel-safe); T010 sequences last.
- **Between phases**: after US1 ships, US2 and US3 phases can be worked in parallel by different developers.

---

## Parallel Example: User Story 1 (test-writing burst)

```bash
# All four failing-test tasks touch different files — start in one batch:
Task T003: Update tests/extractors/typescript/extract-imports.test.ts (RawImport bindings)
Task T004: Create tests/extractors/typescript/extract-inheritance.test.ts (8 cases)
Task T005: Create tests/extractors/typescript/resolve-symbol.test.ts (6 cases)
Task T006: Extend tests/extractors/typescript/extract.test.ts (end-to-end fixtures)
```

## Parallel Example: US2 and US3 (after US1 ships)

```bash
# US1 checkpoint reached — split the UI work:
Developer A: Phase 4 (Neighbors sidebar) — T011 → T012 → T013 → T014
Developer B: Phase 5 (Canvas edges)     — T015 → T016 → T017
# Merge into the feature branch when both done, then Polish (Phase 6).
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. T001 (Setup) → T002 (Foundational graphify gate).
2. Phase 3: US1 (T003–T010) — write all tests red, then all implementations green.
3. **STOP and VALIDATE**: `curl /api/ist | jq '.edges | map(select(.type == "extends" or .type == "implements"))'` returns non-empty for a repo with class hierarchies. That's the MVP — inheritance data is queryable by anything that reads the model, even before UI ships.

### Incremental Delivery

1. Setup + Foundational + US1 → MVP shippable (data-only value).
2. Add US2 (Sidebar) → shippable increment (users can navigate hierarchies).
3. Add US3 (Canvas) → shippable increment (visual overview).
4. Polish + PR + merge.

### Parallel Team Strategy

With 2 developers after US1 lands:

- Dev A: US2 (Neighbors sidebar)
- Dev B: US3 (Canvas edge styling)

Both merge to the feature branch. Then together do Polish (T018–T022).

---

## Notes

- All 22 tasks use the mandatory checklist format `- [ ] Tnnn [P?] [Story?] Description with file path`.
- Auto-memory reminders per prior slices: `feedback_cr_before_merge`, `feedback_editor_rebuild_needs_restart`, `feedback_stacked_pr_workflow` (this PR is main-based, not stacked — no risk this time), `reference_gh_haexhub` (verify active gh account is `haexmas` before push).
- The Query-UI slice this feature enables is a separate future spec; do not scope-creep into query-DSL work here.
