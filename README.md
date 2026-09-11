# specifyr

Visual architecture editor with SOLL/PLAN/IST drift-check, AI-assisted via MCP.

`specifyr` v1 is under active TypeScript rewrite. This branch ships the
foundation, core Zod schemas, vocabulary packs, the `specifyr init` /
`status` CLI commands, a read-only Vue Flow editor started with
`specifyr editor`, and a TypeScript IST extractor (tree-sitter WASM based)
toggled from the editor's TopBar. Editing, WebSocket live updates, and MCP
are planned for later slices.

See [docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md)
for the full design and the plan for later slices.

## Requirements

- Node.js 22 or newer
- pnpm 9 (via `corepack enable`)

## Development

```bash
corepack enable
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Usage

After building (`pnpm build`), the CLI is available as `pnpm specifyr`:

    pnpm specifyr init ./my-repo
    pnpm specifyr status ./my-repo
    pnpm specifyr editor ./my-repo   # pre-selects the repo
    pnpm specifyr editor              # opens the in-browser folder picker

The picker lists visible subdirectories only; entries starting with a dot
(e.g. `.config/`) are hidden in v1 — pre-select those via the CLI form.
The editor binds to `127.0.0.1` so the browse endpoint is not reachable
from other hosts on the LAN.

The editor is read-only. It fetches `.specifyr/soll/` on every page load —
refresh the browser to pick up on-disk changes. Click **IST** in the TopBar
to see the TypeScript IST of the same repo: every `.ts` / `.tsx` file becomes
a `module` node, plus top-level `class` / `interface` / `type-alias` / `enum`
/ `function` nodes. `import ... from "./..."` statements are drawn as arrows
between modules. Nodes are auto-laid out via ELK.js (`layered` algorithm,
top-down) so imports flow from top to bottom; a brief "laying out…"
indicator appears in the TopBar while ELK crunches larger graphs. Nodes are
coloured by type: SOLL components stand out in blue, modules in green,
external services in amber, data stores in pink; IST classes in purple,
interfaces in indigo, type aliases in teal, enums in orange, functions in red.
Class hierarchies show as solid `extends` and dashed `implements` edges
alongside the existing `imports`; the details sidebar lists them as
separate Extends / Extended by / Implements / Implemented by sections.
Per-symbol call edges land in a later slice.

Or install globally (once published to npm) with `npm i -g specifyr`.

## Status

Slice 1: repo skeleton, core Zod model, tests, CI. ✅
Slice 2: SOLL storage layer — load/save `.specifyr/soll/` under a repo root. ✅
Slice 3: CLI skeleton — `specifyr init` and `specifyr status`. ✅
Slice 4: vocabulary packs v1 — ten shipped language packs + loader + resolver. ✅
Slice X: read-only visual editor — `specifyr editor` opens a Vue Flow graph of the SOLL in the browser. ✅
Slice A: TypeScript IST extractor via tree-sitter WASM (nodes only) + TopBar SOLL/IST segmenter. ✅
Slice B: IST `imports` edges — module→module dependencies drawn as arrows in the Vue Flow graph. ✅
Slice ELK: ELK.js `layered` auto-layout replaces the 4-column grid. ✅
Slice Tailwind: Tailwind CSS as editor styling primitive + per-node-type colors for SOLL and IST. ✅
Slice Selection: click a node to reveal a right-side details sidebar; the graph layout stays put. First slice derived from [`plans/001-editor-perspectives-and-state-comparison.md`](plans/001-editor-perspectives-and-state-comparison.md). ✅
Slice Neighbors: selecting a node highlights its direct imports/importers and lists them as clickable rows in the sidebar — traversal from any starting point, no re-layout. ✅
Slice Search: header input dims non-matching nodes with opacity-30 based on name or path; Enter selects the first match. (The Enter behavior was superseded by Slice Search Auto-Expand below, which drops the camera-fit in favour of ancestor auto-expand — see there for the current contract.) ✅
Slice Repo Picker: open the editor with or without a path — an in-browser folder picker lets you pick and swap repositories; selection persists per browser via localStorage. ✅
Slice Hierarchy Data: IST symbol nodes carry a path back to their file; new buildHierarchy() composable groups any node list into Folder → File → Symbol, ready for the Explorer tree + nested canvas redesign in upcoming slices. No visible editor change yet. ✅
Slice Explorer Tree: a left-hand folder/file tree navigates the current view; selecting a file there or a node on the canvas keeps both in sync — the tree always shows where the current selection lives. Second slice of the Explorer/Canvas/Details redesign ([docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md](docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md)). ✅
Slice Nested Canvas: the canvas now renders as nested wrapper boxes — folders contain files contain symbols — starting fully collapsed. Top-level wrapper positions are a stable alphabetical grid, unaffected by expand state; inside each expanded wrapper, ELK's layered algorithm runs scoped to just that container's children. Third slice of the Explorer/Canvas/Details redesign ([docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md](docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md)). ✅
Canvas polish: top-level grid frozen so expand/collapse never shifts sibling wrappers; edges routed as smoothstep with arrow markers, `imports` label suppressed while it's the only edge type. Small readability pass before Slice 4 (edge aggregation). ✅
Slice Edge Aggregation: real `imports` edges no longer vanish when their endpoints hide inside a collapsed wrapper — every edge resolves upward to its nearest visible ancestor, self-loops from aggregation are dropped, duplicates dedupe to a single visible edge with a `count`. Neighbors sidebar still operates on raw edges (aggregation is a canvas-only rendering derivative). Fourth slice of the Explorer/Canvas/Details redesign ([docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md](docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md)). ✅
Slice Search Auto-Expand: Enter on a search hit auto-expands the ancestor folder chain of the first match so its file wrapper becomes visible on the nested canvas; the camera does not move (the flow layout's "expanding a wrapper never shifts left/above content" invariant is the eye's anchor) and the match's file wrapper pulses once as an attention nudge. Fifth and final slice of the Explorer/Canvas/Details redesign ([docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md](docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md)). ✅
Slice IST Inheritance Edges: the TypeScript extractor emits `extends` and `implements` edges alongside `imports` (same-file locals shadow imports; transitive re-exports followed; cycles dropped). Neighbors sidebar shows separate Extends / Extended by / Implements / Implemented by sections; the canvas draws `extends` solid, `implements` dashed, mixed-type cross-wrapper aggregates fall back to the imports style ([specs/001-ist-inheritance-edges/](specs/001-ist-inheritance-edges/)). ✅
Slice C+ (planned): shadcn-vue / Pinia, Python + Java IST, SOLL↔IST drift matching, layout persistence (`_layout.json`), editing via MCP.

## License

Apache-2.0 — see [LICENSE](LICENSE).
