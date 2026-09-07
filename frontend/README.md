# specifyr-frontend

Nuxt frontend for the specifyr editor.

## Type checking

Run `pnpm typecheck` from this directory for Nuxt's full frontend typecheck.
It covers the server routes and Vue pages through `vue-tsc`.

The root `pnpm typecheck` runs both the package-level TypeScript check and this
frontend check, and CI invokes that root command.
