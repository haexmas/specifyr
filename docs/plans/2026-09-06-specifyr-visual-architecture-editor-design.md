# specifyr — Visual Architecture Editor Design (v1)

Date: 2026-09-06
Status: Design agreed, ready for implementation planning
Supersedes: original Python `spec-logic` package (see rename note below)

## 1. Context

The Python `spec-logic` MVP proves that deterministic consistency checking against a
formal spec model is useful. What is missing is the human loop: architects need to
see, at any time, how the intended architecture compares against the formalized
plan and against the actual code, and they need an environment in which the AI can
collaborate on that architecture without silently overwriting decisions.

This document specifies `specifyr` v1 — a TypeScript rewrite that adds a visual
architecture editor with AI assistance and a three-view drift-check
(SOLL / PLAN / IST).

## 2. Rename

The project is renamed from `spec-logic` to `specifyr`. The npm name is available
(verified against registry.npmjs.org, HTTP 404 as of 2026-09-06).

Rename surface:
- npm package: `spec-logic` → `specifyr`
- CLI binary: `spec-logic` → `specifyr`
- User-project directory: `.spec-logic/` → `.specifyr/`
- MCP server name in `.mcp.json`: `spec-logic` → `specifyr`
- Env var prefix: `SPEC_LOGIC_*` → `SPECIFYR_*`
- Log directory: `.specifyr/.log/`
- Speckit fence identifier: ` ```spec-logic ` → ` ```specifyr `

No legacy compatibility with old `spec-logic` fences in v1 (project is one day old,
no field usage to preserve).

## 3. Vision

A local, single-user visual environment where:
- An architect draws the intended architecture (SOLL) with typed nodes,
  containers (frames), and views (perspectives).
- Claude Code (or any MCP client) collaborates by proposing model patches; the
  architect accepts or rejects them.
- The tool continuously shows drift between three artefacts: SOLL (intended
  architecture in the editor), PLAN (what Speckit specs formalize), IST
  (what the filesystem and code actually contain).
- Everything is stored as human-readable JSON in git, so architecture is
  reviewable and mergeable like any other project artefact.

Longer term the editor grows toward a general visual design environment
(closer to Claude Design in ambition), but v1 is scoped semantically-first, with
minimal but usable canvas.

## 4. Non-goals for v1

- Multi-user real-time collaboration (single local user only)
- Full Claude-Design-level visual design capabilities (freehand drawing, rich
  text blocks, UI-wireframe primitives) — architecture only in v1
- Automatic drift rule-pack that produces typed Findings via `specifyr check`
  (v2)
- SMT / Z3 backend (post-v1)
- Auto-promotion of Graphify candidates into the authoritative spec model
- Language support beyond Python, JS/TS, Java in v1 (adapter framework is
  ready to extend)

## 5. Decision summary

| Area | Decision |
|---|---|
| Stack | Nuxt 3 + Nitro (TypeScript), single-process |
| Canvas | Vue Flow + ELK.js for automatic layout |
| UI | shadcn-vue, Pinia with command-stack |
| Persistence | JSON files under `.specifyr/`, git-tracked |
| Multi-file | One folder per top-level Component, `_index.json` for cross-edges |
| Views | Multiple per model, toggled via TopBar segmenter, each with own layout |
| Auto-layout | Per view, implicit on first visit, ELK, `manual` flag respected |
| AI backend | MCP via HTTP-SSE, Claude Code as external chat client |
| Patch UX | Diff overlay with accept/reject, auto-accept toggle |
| Vocabulary | Language packs (`generic`, `typescript`, `vue`, `python`, `java`, ...) plus custom types at runtime |
| Drift | SOLL↔PLAN + PLAN↔IST, inline badges by default, fine-grained attribute diffs, `derivedFrom` provenance |
| Language support v1 | Python, JS/TS, Java via tree-sitter WASM |
| Distribution | npm package, Node 20+, `specifyr editor` command |
| Storage engine | Files only for v1, no SQLite (git and PR-review compatibility) |

## 6. System architecture

Single Nitro process. It serves the Nuxt SPA, hosts the API layer, and exposes
the MCP endpoint directly.

**Nitro/h3 server** (Nuxt fullstack, `ssr: false`, editor route is client-only):
- Serves static SPA bundle
- REST routes:
  - `GET/PUT /api/soll` — model read/write
  - `GET /api/plan`, `/api/ist`, `/api/drift?seam=…` — extraction + diff compute (read-only)
  - `POST /api/patches` — pending patches from MCP
  - `POST /api/patches/:id/accept|reject`
- WebSocket `/ws` (via `crossws`) for live push to browser
- MCP endpoint `/mcp` via HTTP-SSE transport (officially supported by
  `@modelcontextprotocol/sdk`). No STDIO process spawn.

**Editor frontend** (Nuxt SPA):
- Vue Flow canvas, shadcn-vue for panels/dialogs, Pinia with command-stack for
  undo/redo, WebSocket client for live push.
- Later (v2): tree-sitter WASM in browser for live feedback without server hop.

**End-to-end flow:**
1. User runs `specifyr editor` → Nitro starts, browser opens, MCP endpoint
   available on `http://127.0.0.1:<port>/mcp`
2. Claude Code's `.mcp.json` lists `specifyr` as an HTTP MCP server at that URL
3. User in Claude Code: "add an Auth module"
4. Claude calls MCP tool `propose_patch` on Nitro
5. Nitro stores as pending, pushes WebSocket event
6. Browser shows diff overlay → user accepts → Nitro persists → undo-stack entry
   → WebSocket confirmation back

**Rationale:** single-process design via HTTP-SSE MCP transport keeps lifecycle
clear (editor is persistent, Claude Code sessions come and go), shares state
without IPC, and is simpler to deploy and debug. User must start the editor
manually, which is the expected pattern for a persistent editor UI.

## 7. Data model

All three artefacts (SOLL, PLAN, IST) share the same schema so drift views can
overlay them 1:1.

### Common schema (Zod)
- `Node`: `{ id, type, name, description?, path?, classes[]?, ...vocabAttrs }`
- `type` values come from active vocabulary packs, not fixed enum
- `Class`: `{ name, methods[], attributes[] }`
- `Edge`: `{ id, from, to, type }` — types include `depends-on`, `contains`,
  `implements`, `exposes`, `calls`, `imports`, `reads-from`, `writes-to`,
  `passes-through`, and pack-specific additions
- `Model`: `{ nodes[], edges[], meta: { source: "soll" | "plan" | "ist", generatedAt? } }`

### Vocabulary system
Node types, edge types, and attributes are not hardcoded. They come from
vocabulary packs plus user-defined custom types, all stored in
`.specifyr/vocabulary.json`:

```json
{
  "activePacks": ["generic", "typescript", "vue", "python"],
  "customTypes": [
    {
      "kind": "node",
      "name": "gateway",
      "attributes": [
        { "name": "protocol", "type": "enum",
          "allowedValues": ["http", "grpc", "websocket"] }
      ]
    }
  ]
}
```

Shipped v1 packs: `generic`, `python`, `typescript`, `vue`, `angular`, `c`,
`cpp`, `rust`, `java`, `go`. Each pack declares node types, edge types, and
suggested view templates. The IST extractor per language emits nodes typed
according to the pack.

### SOLL storage layout

```
.specifyr/soll/
├── _meta.json               # global metadata
├── _index.json              # cross-component edges
├── _layout.json             # per-view positions (see below)
├── _views.json              # named view definitions
├── components/
│   ├── auth/
│   │   ├── component.json   # the Component node + attributes
│   │   ├── classes.json     # nested classes (splittable per class if huge)
│   │   ├── edges.json       # internal edges
│   │   └── notes.md         # optional freeform notes
│   ├── users/ ...
└── external/
    ├── stripe.json          # ExternalService
    └── postgres.json        # DataStore
```

Rules:
- One folder per top-level Component, Module, ExternalService, or DataStore.
- Folder name equals architectural node id (unique in SOLL). Rename = folder
  rename = atomic git op.
- Intra-component edges live in the component folder. Cross-component edges
  live centrally in `_index.json`.
- `_layout.json` is central to survive node renames.

### Views and layout

Views are declarative filters plus rendering hints, stored in `_views.json`:

```json
{
  "views": [
    { "id": "network", "name": "Network view",
      "filter": { "attribute": "network-role",
                  "in": ["gateway", "internal-service", "edge-worker"] },
      "colorBy": "network-role",
      "showEdges": ["depends-on"] },
    { "id": "runtime", "name": "Runtime environment",
      "colorBy": "runtime", "groupBy": "runtime" },
    { "id": "frontend-backend", "name": "Frontend vs Backend",
      "colorBy": "layer", "groupBy": "layer" },
    { "id": "data-flow", "name": "Data flow",
      "filter": { "attribute": "data-flow-role",
                  "in": ["store", "composable", "utility"] },
      "showEdges": ["calls", "reads-from", "writes-to"] }
  ]
}
```

Layout is per view, stored in `_layout.json`:
```json
{
  "network-view": {
    "auth-service": { "x": 100, "y": 200, "width": 240,
                      "height": 120, "manual": true }
  },
  "runtime-view": {
    "auth-service": { "x": 400, "y": 50, "width": 180,
                      "height": 80, "manual": false }
  }
}
```

`manual: true` means the user placed the node deliberately and auto-layout
must preserve it; `manual: false` means auto-layout may recompute freely.

### PLAN

Not a single file. Derived from:
- Speckit documents (`specs/**/*.md`, `docs/adr/*.md`) — extracted via
  `unified` + `remark-parse` with a custom plugin for `specifyr` fences
- Optional `.specifyr/plan/*.json` for explicit plan additions (planned
  folder paths, planned class skeletons) not in Speckit FRs

API returns normalized `Model` with `source: "plan"`. Provenance to SOLL is
carried via `derivedFrom: ["soll:auth-service"]` fields on plan nodes
(new addition to the `spec-model.v1.schema.json`).

### IST

Never persisted. Live-scanned:
1. `fast-glob` walks project root, respecting `.gitignore`
2. Per file: extension → active language pack → `web-tree-sitter` with matching
   WASM grammar (lazy loaded)
3. Language adapter (`packs/typescript.ts`, `packs/python.ts`,
   `packs/java.ts` in v1) maps tree-sitter nodes to the unified `Model` using
   the pack's vocabulary
4. Aggregation: directories → module/component candidates, class declarations
   → class nodes with methods as attributes, imports → `depends-on` /
   `imports` edges
5. In-memory cache invalidated per file watcher; WebSocket push `ist-updated`

### User-repo layout

```
project-root/
├── specs/                   # Speckit files (existing)
├── docs/adr/                # ADRs (existing)
├── src/                     # code (existing)
├── .specifyr/
│   ├── soll/                # see SOLL storage above
│   ├── plan/                # optional explicit plan additions
│   ├── vocabulary.json      # active packs + custom types
│   └── .log/patches.jsonl   # audit trail (gitignored)
└── .mcp.json                # Claude Code MCP config
```

## 8. Editor frontend

### Page structure (Nuxt)

- `pages/index.vue` — project chooser
- `pages/editor.vue` — full-height editor: TopBar (view segmenter + save
  status + auto-accept toggle), LeftPanel (node explorer + vocabulary
  manager), Canvas (Vue Flow), RightPanel (properties + MCP patch inbox)
- `pages/drift.vue` — full-screen drift explorer (side-by-side compare)

### Pinia stores

- `useModelStore` — SOLL model state (nodes, edges, frames, vocabulary,
  views). Pure state and getters; no mutation logic.
- `useCommandStore` — undo/redo command stack. All model mutations go
  through here.
- `useViewStateStore` — active view id, panel state, zoom, selection.
  Not on undo stack; persisted in `localStorage` for tab restore.
- `useDriftStore` — PLAN and IST snapshots plus computed drift; loaded
  on demand, invalidated by WebSocket events.

### Undo/redo as command pattern

Every mutation is a Command with `apply(state)` and `revert(state)`:
`AddNode`, `RemoveNode`, `UpdateNodeAttribute`, `AddEdge`, `MoveNode`,
`AddFrame`, `AssignNodeToFrame`, `AddVocabularyType`, `UpdateView`, etc.

`useCommandStore` maintains undo and redo stacks. `Ctrl+Z` pops from undo,
runs `revert`, pushes to redo.

**Composite commands** collapse an accepted MCP patch into a single undo
entry: `CompositePatchCommand` wraps a list of primitive commands and applies
them atomically. One undo removes the entire AI suggestion as one unit.

### Vocabulary-driven properties panel

The vocabulary defines attribute schemas (name, type, allowed values,
appliesTo). When a node is selected, the properties panel dynamically
generates a form from the applicable vocabulary entries using a generic
`<AttributeField :def :value @change>` component that renders `Select`,
`Input`, `Switch`, or `NodeRefPicker` depending on type (shadcn-vue
primitives).

New attributes are added via a dedicated "Manage vocabulary" dialog in the
LeftPanel (mutations go through commands, so undo works).

### View switching

TopBar has a segmenter (shadcn-vue `Tabs`) listing all defined views plus
`+` for new view. Click = switch (not on undo stack). Keyboard shortcuts:
`Cmd+1..9` for the first nine views, `Cmd+K` cycles to next.

Active view id is persisted in `localStorage`. Distinguishing:
- Changing `activeViewId`: not undoable (UI state)
- Adding/renaming/deleting a view definition: undoable (model change)

### Auto-layout per view

- First visit to a view: ELK computes layout, positions stored in
  `_layout.json[viewId]`
- Subsequent visits: cached positions used, no recompute
- New node added: incremental layout in current view (respects existing
  positions); marked pending in other views' layouts, auto-placed on first
  visit to those views
- Manual drag: updates the current view only
- Explicit "Re-layout" button per view forces a fresh compute, respects
  `manual: true` nodes

### Frames as group-nodes

Vue Flow's `parentNode` property. A frame is a node of type `frame` with
transparent border and title. Child nodes carry `parentNode: <frame-id>`,
positions relative to the frame. Frames can nest.

### MCP patch UX

Incoming patch (via WebSocket) lands as **pending** in `useCommandStore`
(not yet on undo stack). RightPanel shows a "Patch inbox" card:
summary ("Claude proposes: add Auth module + 3 classes + 2 edges"),
"show in canvas" button (renders diff overlay: new nodes with dashed green
border, removed with red semi-transparent), accept/reject buttons.

Auto-accept toggle in TopBar (default off; persisted in `localStorage`):
when on, patches apply immediately as one undo entry, with a toast and a
"Recent auto-applied" list in RightPanel showing per-entry revert. Optional
sub-toggle: auto-accept only for additive patches (destructive ones still
queue).

## 9. MCP surface

### Read tools (idempotent)

- `read_soll(scope?)`
- `list_nodes(filter?)`
- `list_edges(filter?)`
- `read_plan()`
- `read_ist(paths?)`
- `read_drift(seam, scope?)`
- `read_vocabulary()`
- `read_views()`
- `get_editor_status()`

### Write via `propose_patch`

One write tool. All mutations go through a structured patch object:

```typescript
propose_patch({
  patchId: string,         // client-generated, idempotency key
  reason: string,          // human-readable rationale
  baseHash: string,        // hash of SOLL state as Claude read it
  ops: Operation[],        // ordered atomic ops
  dryRun?: boolean         // preview without commit
}) → PatchResult
```

Operation union:
- Nodes: `add-node`, `update-node`, `remove-node`, `move-node`
- Edges: `add-edge`, `update-edge`, `remove-edge`
- Frames: `add-frame`, `assign-to-frame`, `unassign-from-frame`, `remove-frame`
- Vocabulary: `add-vocabulary-type`, `update-vocabulary-type`,
  `remove-vocabulary-type`
- Views: `add-view`, `update-view`, `remove-view`

Result:
```typescript
{
  status: "accepted" | "pending" | "rejected" | "stale",
  patchId: string,
  applied: boolean,
  conflictReason?: string,
  affectedNodes?: string[]
}
```

Conflict handling:
- **Stale** (baseHash mismatch): user edited meanwhile. Patch rejected,
  Claude gets current hash, can re-read and retry. No silent overwrite.
- **Rejected**: schema constraint violation. Structured error.
- **Pending**: normal case when auto-accept off.
- **Accepted**: auto-accept on, or immediate browser confirm.

### Action tools

- `recompute_layout(viewId, algorithm?)` — triggers ELK recompute for a
  view, pushed as one undo entry, preserves `manual: true` nodes
- `generate_plan_stubs(scope?)` — takes SOLL (or subtree), returns
  structured plan stubs (FRs with `derivedFrom: soll:<id>`, folder structure,
  class stubs, suggested markdown for each). **Does not write files** —
  Claude Code writes the actual Speckit files using its own tools. Keeps the
  trust boundary clean: editor only touches `.specifyr/`, Speckit files are
  Claude's territory.

### Safety

- MCP endpoint binds `127.0.0.1` only, never external. Startup log states it
  explicitly.
- No auth token for v1 (localhost-only). `.mcp.json` may optionally require a
  shared secret header if the user configures one later.
- No rate limits in v1.
- All patches (including rejected) logged to `.specifyr/.log/patches.jsonl`
  (gitignored). Audit trail of AI suggestions.

## 10. Drift views

### Extraction pipelines

**PLAN:**
1. `chokidar` watches `specs/**/*.md`, `docs/adr/*.md`, `.specifyr/plan/*.json`
2. On change: `unified` + `remark-parse` parses markdown, custom plugin
   extracts `specifyr` fences, Zod validates JSON per fence
3. Merge with optional `.specifyr/plan/*.json`
4. Normalize to unified Model with `source: "plan"`, preserving `derivedFrom`
5. Cache invalidated, WebSocket push `plan-updated`

**IST:**
1. `fast-glob` walks project root, respects `.gitignore`
2. Per file: extension → active language pack → `web-tree-sitter` loads WASM
   grammar (lazy)
3. Language adapter maps tree-sitter to Model using pack's vocabulary
4. Aggregation as described in section 7
5. In-memory cache, watcher-invalidated, WebSocket push `ist-updated`

### Matching rules

**SOLL ↔ PLAN:**
- Primary: `plan.derivedFrom` contains `"soll:<id>"` → exact
- Fallback: canonical slug (case-insensitive, normalized) of `name` matches
- Unmatched: marked `orphan` — "PLAN FR without SOLL origin" or "SOLL node
  without PLAN coverage"

**PLAN ↔ IST:**
- Primary: `plan.path` matches `ist.location.path`
- Secondary: `plan.name == ist.name` within the same parent scope
- Unmatched: "planned class missing in code" or "code has class without plan"

### Drift report

```typescript
{
  seam: "soll-plan" | "plan-ist",
  added: Node[] | Edge[],     // in target, not source
  removed: Node[] | Edge[],   // in source, not target
  changed: Array<{
    id: string,
    sourceAttrs: Record<string, any>,
    targetAttrs: Record<string, any>,
    diffs: AttributeDiff[]    // fine-grained, per attribute
  }>
}
```

Fine-grained means every attribute is compared, including vocabulary values
(so a SOLL `layer: backend` vs. IST code in `src/frontend/` shows as a
`layer` drift, not just a match/mismatch on node existence).

### Rendering

**Default: inline badges on SOLL nodes.** Each SOLL node shows two small
badges: `→ PLAN: 2 Δ` and `→ IST: 1 ✗`. Click a badge opens the drift
detail panel with the specific diff. Unmatched PLAN or IST orphans render
as dashed ghost nodes on the canvas (visible but not part of SOLL).

**Alternative: `pages/drift.vue` full-screen explorer.** Side-by-side
split: SOLL left, PLAN (or PLAN vs. IST) right. Nodes horizontally aligned
by match id, colored lines between: green added, red removed, yellow
changed. For deep review after big changes like `speckit-implement`.

### Robustness

- Parse errors in Speckit files → surfaced as warnings in drift panel,
  offending FR falls out of PLAN, others continue.
- Tree-sitter errors → file skipped, warning logged, IST stays consistent.
- Missing language pack for extension → skipped with hint to activate the
  pack.

## 11. CLI and deployment

### Package layout (npm)

Single package `specifyr` for v1.

```
specifyr/
├── src/
│   ├── cli/               # citty-based CLI
│   ├── core/              # model, Zod schemas, rules evaluator
│   ├── adapters/          # Speckit, Graphify, tree-sitter language adapters
│   ├── extractors/        # PLAN, IST, drift compute
│   ├── mcp/               # MCP tool definitions + handlers
│   ├── server/            # Nitro bootstrap, API routes, WebSocket
│   └── packs/             # vocabulary packs (JSON) + language adapters
├── frontend/              # Nuxt app, built to dist-frontend/
├── dist-frontend/         # nuxt generate output, shipped in npm tarball
└── schemas/               # v1 JSON schemas (ported from Python)
```

### CLI commands

- `specifyr editor [--port 3939] [--no-open]` — start Nitro, open browser,
  print MCP config snippet
- `specifyr init` — initialize `.specifyr/` in cwd
- `specifyr check --model path` — headless consistency check (ported)
- `specifyr extract path --output out.json` — Speckit extract (ported)
- `specifyr graphify-import --graph g.json --output c.json` (ported)
- `specifyr rules-verify` (ported)
- `specifyr benchmark [--runs N] [--format markdown|json]` (ported)

### `specifyr editor` startup flow

1. Parse args (citty)
2. Check `.specifyr/` in cwd → not present: interactive init prompt
3. Find free port (default 3939, else next free)
4. Nitro starts on `127.0.0.1:PORT`, mounts SPA from `dist-frontend/`,
   API routes, WebSocket, MCP-SSE endpoint
5. Chokidar watchers start on Speckit files and code dirs
6. Console prints URL and MCP config snippet for `.mcp.json`
7. Browser auto-opens unless `--no-open`
8. SIGINT/SIGTERM → graceful shutdown

### Development workflow

- `pnpm dev` — Nuxt dev server + Nitro parallel with HMR
- `pnpm test` — vitest unit tests
- `pnpm test:e2e` — Playwright end-to-end of the editor
- `pnpm build` — unbuild for server code, nuxt generate for SPA,
  `pnpm pack` for tarball

### Distribution

- Node 20+ (package.json `engines`)
- Tree-sitter WASM grammars for Python, JS/TS, Java bundled (~1-2 MB
  combined); larger grammars lazy-loaded on first use
- Estimated bundle size: 15-25 MB npm package
- `npm install -g specifyr` for permanent install
- `npx specifyr editor` for trial use

### Testing strategy

- **Unit**: core model, rules evaluator, Speckit adapter, vocabulary
  validation, drift matcher
- **Integration**: API routes against fixtures, MCP tool round-trips,
  watcher invalidation
- **E2E** (Playwright): editor open → create node → view switch → auto-layout
  → undo → patch inbox accept
- **Golden corpus benchmark** ported from Python version as regression anchor

## 12. Open items for the implementation plan

Design is complete; these are refinements to make during implementation:

- Concrete Zod schema files (one per artefact type) with tests
- Wireframe or storybook of the RightPanel patch-inbox card
- Draft of default vocabulary packs (which types + attributes for each
  language, especially Vue and Angular)
- Choice of Playwright vs. Cypress for E2E (leaning Playwright)
- CI setup for the new TS codebase (replaces existing Python `test.yml`)
- Naming of the `derivedFrom`-field addition in the JSON schema and its
  compatibility with the existing `spec-model.v1.schema.json`
- Fallback shape library or icon set for node rendering (nice-to-have,
  can be default shapes for v1)
