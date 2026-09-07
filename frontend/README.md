# specifyr-frontend

Nuxt frontend for the specifyr editor.

## Type checking

There is intentionally **no** `typecheck` script in `package.json`. `nuxt
typecheck` requires `vue-tsc` (and `typescript`) as explicit devDependencies,
which we do not want to pull into this workspace just for a standalone check.

Frontend type errors are still caught in two ways:

1. `nuxt build` (via `pnpm --filter specifyr-frontend build`, or the root
   `pnpm build` which fans out to it) performs full type checking of every
   file Nuxt sees, including `server/api/*.ts` and `pages/*.vue`.
2. The root `pnpm typecheck` runs `tsc -p tsconfig.json`, which is narrowed
   to `frontend/server/utils/**/*.ts` — the adapter files that need to stay
   compatible with the `specifyr` package's public types.

If you want a standalone frontend typecheck loop during iteration, install
`typescript` and `vue-tsc` locally and run `pnpm dlx nuxt typecheck` from
this directory.
