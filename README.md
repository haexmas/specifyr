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
pnpm typecheck
pnpm lint
pnpm test
```

## Status

Slice 1 (current): repo skeleton, core Zod model, tests, CI.
Slice 2+ (planned): SOLL storage, rules evaluator, CLI, Nitro editor, MCP endpoint.

## License

Apache-2.0 — see [LICENSE](LICENSE).
