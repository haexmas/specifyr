# Implementation Plan: IST Inheritance Edges

**Branch**: `001-ist-inheritance-edges` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-ist-inheritance-edges/spec.md`

## Summary

Add `extends` and `implements` edges to the TypeScript IST extractor by parsing class/interface heritage clauses from the existing tree-sitter trees, resolving targets via a two-pronged mechanism (same-file locals first, then imported names), and dedup-emitting them alongside the current `imports` edges. Surface the new edges through the Neighbors sidebar (separate `Extends` / `Extended by` / `Implements` / `Implemented by` sections) and the canvas (extends solid, implements dashed, mixed-type cross-wrapper aggregates fall back to the imports style). No schema migration is required — the Edge schema already accepts arbitrary type strings.

## Technical Context

**Language/Version**: TypeScript 5.6 (ES2023 target, `NodeNext` module) — Node.js 22+ runtime
**Primary Dependencies**: `web-tree-sitter` 0.27 + `tree-sitter-typescript` 0.23 (WASM parser, already in use); `zod` 4.0 (schema, unchanged); Vue 3 / Nuxt / Vue Flow (frontend, unchanged)
**Storage**: N/A — IST is computed on demand per request; edges live only in the returned `Model`
**Testing**: Vitest 2.1 (existing suite pattern: `tests/extractors/typescript/*.test.ts` for isolated tree tests, `tests/cli/editor-ist-integration.test.ts` for end-to-end bundle guard)
**Target Platform**: Node 22 CLI (extractor via `specifyr editor`) + local Nuxt SSR web app on `127.0.0.1:3939`
**Project Type**: monorepo — root TypeScript library + CLI in `src/`, Nuxt frontend workspace in `frontend/`, integration tests in `tests/`
**Performance Goals**: linear-scaling extractor (single AST walk per file + O(nodes+edges) resolution). No hard perf gate for this feature — the extractor is expected to add well under a second on typical (~500-file) repos and a manual timing check on a real repo stands in for a bench (see spec Assumptions). No perceptible sidebar-open latency after selection change (matches existing Imports sidebar responsiveness).
**Constraints**: no new runtime dependencies; additive to existing 2-pass extractor (becomes 3-pass); edge JSON shape unchanged (new `type` values only); no changes to node ids or the Edge schema
**Scale/Scope**: typical repos 100–1000 TS files with 500–5000 top-level symbols; typical inheritance-edge count on a well-structured OO codebase is 10–30% of the class-count (empirical estimate; will validate on smoke test)

**No open NEEDS CLARIFICATION** — spec was already tightened by `/speckit-clarify` session 2026-09-10.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Two constitutions apply to this repository:

**1. Spec-Kit constitution** (`.specify/memory/constitution.md`)
Status: template placeholders only, never filled in via `/speckit-constitution`. **No gates defined → no gate to fail.** A future `/speckit-constitution` invocation can codify project-specific principles; until then, this constitution imposes no constraints on this plan.

**2. Spaex constitution** (`.spaex/constitution.md`, opt-in via `com.github.haexmas.atoms.graphify-first-authoring`)
Status: active. Enforces one principle: **"Before authoring any new named function, class, component, store, module, or CLI command, you MUST consult the project's graphify knowledge graph and prefer extending an existing candidate over authoring a parallel implementation."**

Gate evaluation: **Deferred to `/speckit-tasks` and `/speckit-implement` phases** where the actual authoring happens. This plan proposes several new named artifacts (`extractInheritance`, `extractInheritanceFromTree`, `resolveSymbol`, `RoleNodeData`… wait, that's a type alias — refactor terminology, not authoring). Specifically:

- New functions: `extractInheritance`, `extractInheritanceFromTree` (in a new module `src/extractors/typescript/extract-inheritance.ts`); `resolveSymbol` (in a new module `src/extractors/typescript/resolve-symbol.ts`).
- New Vue Flow edge styling helper (in `frontend/pages/index.vue`'s `flowEdges` computed — refactor, not a new named artifact).
- Widened return type of existing `neighborsOf` (refactor of an existing artifact — not new authoring; the principle explicitly permits extending an existing artifact).

**Gate action**: before `/speckit-implement` runs, `graphify query "extract inheritance"`, `graphify query "resolve symbol import"` and `graphify query "class heritage"` must be executed. If graphify surfaces a candidate that materially overlaps, that's a refactor-proposal moment. If not, author the new module and document the query results briefly in the commit message.

**Complexity Tracking**: no violations. No 4th project, no repository pattern, no speculative abstraction. The plan is additive within the existing extractor + neighbors + edge-aggregation code paths.

## Project Structure

### Documentation (this feature)

```text
specs/001-ist-inheritance-edges/
├── plan.md                    # This file (/speckit-plan output)
├── spec.md                    # /speckit-specify output
├── research.md                # Phase 0 output (this command)
├── data-model.md              # Phase 1 output (this command)
├── quickstart.md              # Phase 1 output (this command)
├── contracts/                 # Phase 1 output (this command)
│   ├── extract-inheritance.md # Public signature of the new extractor module
│   ├── resolve-symbol.md      # Public signature of the resolution module
│   └── neighbors.md           # Widened Neighbors return type
├── checklists/
│   └── requirements.md        # /speckit-specify's quality checklist
└── tasks.md                   # NOT created here — /speckit-tasks output
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── schemas.ts             # UNCHANGED (Edge.type: z.string accepts new values)
│   └── index.ts               # UNCHANGED
├── extractors/
│   └── typescript/
│       ├── extract.ts         # MODIFY — add Pass 3 for inheritance
│       ├── extract-source.ts  # UNCHANGED
│       ├── extract-imports.ts # MODIFY — surface local + imported names on RawImport
│       ├── extract-inheritance.ts   # NEW — heritage-clause tree walk
│       ├── resolve-symbol.ts        # NEW — target resolution
│       ├── resolve-import.ts  # UNCHANGED
│       ├── edge-id.ts         # UNCHANGED
│       ├── node-id.ts         # UNCHANGED
│       ├── parser.ts          # UNCHANGED
│       └── walk.ts            # UNCHANGED

tests/
├── extractors/
│   └── typescript/
│       ├── extract.test.ts           # MODIFY — add end-to-end inheritance tests
│       ├── extract-imports.test.ts   # MODIFY — widen assertions for bindings
│       ├── extract-inheritance.test.ts   # NEW
│       └── resolve-symbol.test.ts        # NEW
├── frontend/
│   └── neighbors.test.ts      # MODIFY — cover new inheritance directions
└── cli/
    └── editor-ist-integration.test.ts   # MODIFY — bundle-guard for new sidebar sections

frontend/
├── composables/
│   ├── neighbors.ts           # MODIFY — widen return type to 6 buckets
│   └── edge-aggregation.ts    # MODIFY — carry a types Set on aggregates
└── pages/
    └── index.vue              # MODIFY — new sidebar sections + edge-type styling
```

**Structure Decision**: monorepo, single-workspace pattern the repo already follows. No new top-level directories. Every change lives in one of the paths above; nothing else in the repo needs to move.

## Complexity Tracking

*No violations — table left empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
