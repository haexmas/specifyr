# specifyr

Visual architecture editor with SOLL/PLAN/IST drift-check, AI-assisted via MCP.

`specifyr` v1 is under active TypeScript rewrite. This branch ships the
foundation, core Zod schemas, vocabulary packs, the `specifyr init` /
`status` CLI commands, and a read-only Vue Flow editor started with
`specifyr editor`. Editing, WebSocket live updates, and MCP are planned
for later slices.

See [docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md)
for the full design and the plan for later slices.

## Requirements

- Node.js 20 or newer
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
    pnpm specifyr editor ./my-repo

The editor is read-only in this slice. It fetches `.specifyr/soll/` on every
page load; refresh the browser to pick up on-disk changes.

Or install globally (once published to npm) with `npm i -g specifyr`.

## Status

Slice 1: repo skeleton, core Zod model, tests, CI. ✅
Slice 2: SOLL storage layer — load/save `.specifyr/soll/` under a repo root. ✅
Slice 3: CLI skeleton — `specifyr init` and `specifyr status`. ✅
Slice 4: vocabulary packs v1 — ten shipped language packs + loader + resolver. ✅
Slice X (current): read-only visual editor — `specifyr editor` opens a Vue Flow graph of the SOLL in the browser. ✅
Slice X+1+ (planned): editing, WebSocket live updates, MCP endpoint, drift views, auto-layout.

## License

Apache-2.0 — see [LICENSE](LICENSE).
