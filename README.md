# specifyr

Visual architecture editor with SOLL/PLAN/IST drift-check, AI-assisted via MCP.

`specifyr` v1 is under active TypeScript rewrite. This branch is the foundation
slice: repo skeleton and core Zod schemas. It does not yet ship a CLI, an
editor, or an MCP endpoint.

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

Or install globally (once published to npm) with `npm i -g specifyr`.

## Status

Slice 1: repo skeleton, core Zod model, tests, CI. ✅
Slice 2: SOLL storage layer — load/save `.specifyr/soll/` under a repo root. ✅
Slice 3 (current): CLI skeleton — `specifyr init` and `specifyr status`. ✅
Slice 4+ (planned): rules evaluator, Nitro editor, MCP endpoint, extractors.

## License

Apache-2.0 — see [LICENSE](LICENSE).
