# specifyr TS Rewrite — Slice X: Read-only Visual Editor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the first visible user surface — a `specifyr editor` command that starts a local web server and opens a browser where the SOLL is rendered as a read-only Vue Flow graph.

**Architecture:** pnpm workspace with root (`specifyr`) and `frontend/` (`specifyr-frontend`) subpackages. `frontend/` is a Nuxt 4 fullstack project (Nuxt = Nitro at runtime) with `ssr: false`. A single server route `frontend/server/api/soll.get.ts` reads the `SPECIFYR_REPO_PATH` env var and calls `loadSoll` from the root package (via workspace protocol). The Nuxt page `frontend/pages/index.vue` fetches `/api/soll`, feeds nodes and edges to Vue Flow, and paints them with minimal per-type colouring. Editing, dragging-to-persist, WebSocket, and MCP are all deferred.

The root CLI grows a new `editor` subcommand that picks a free port, sets `SPECIFYR_REPO_PATH=<cwd>` in the child env, spawns `node frontend/.output/server/index.mjs` on that port, waits for HTTP readiness, opens the browser, and stays running until Ctrl-C.

**Tech Stack:** TypeScript 5.6.3, Node 20+, pnpm 9.15.0 workspaces, Nuxt 4 (exact-pinned), Vue Flow 1.x (exact-pinned), Zod 4 (already in), Vitest 2.1.4 (already in), Biome 1.9.4 (already in). Two new root runtime deps: `open` (browser launcher) and `get-port` (free-port picker), both sindresorhus, both exact-pinned.

**Reference:**
- Design doc §6 System architecture, §8 Editor frontend, §11 CLI/deployment ([docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md))
- Slice 2: `loadSoll(repoPath)` exported from `specifyr/storage`
- Slice 3: citty-based CLI, `runInit`, `runStatus`, `formatInitReport`, `formatStatusReport`

**Branch:** `ts/slice-x-readonly-editor` off current `main` (`58afc9f`). Main is protected. Land via PR. Wait for CodeRabbit before merging (memory: `CR before merge`).

**Non-goals for Slice X:**
- Editing / dragging-to-persist / node creation from the UI (later slice with MCP)
- WebSocket for live updates (later slice)
- MCP endpoint (later slice)
- SOLL / PLAN / IST drift views (later slice)
- Auto-layout algorithms beyond Vue Flow's defaults (later slice with ELK.js)
- shadcn-vue / Pinia / any UI framework beyond raw Vue + Vue Flow's own CSS
- Playwright browser-automation tests (integration test spawns CLI + curls the API, no headless browser)
- Config file (`.specifyrrc`) — CLI takes `--port`, `--no-open` flags only
- Bundling Nuxt output into the root npm tarball — Slice X ships from a workspace install; publish story is a later slice

**User-facing behaviour Slice X ships:**

```
$ cd my-repo   # has .specifyr/soll/ from `specifyr init`
$ specifyr editor
Building editor…
Editor running at http://127.0.0.1:3939 (SOLL: /path/to/my-repo)
Browser opened.
```

Browser shows the model as a Vue Flow graph. Nodes coloured by `node.type`. Edges labelled by `edge.type`. Reading the SOLL live at every page load — no watch mode yet, so refresh the page to pick up filesystem changes.

Exit codes: `0` on Ctrl-C shutdown, `1` on any startup error.

---

## Task 1: Create the working branch

**Files:** git ref `HEAD`.

**Step 1: Confirm clean main**
```bash
git status && git branch --show-current && git log --oneline -1
```
Expected: clean, on `main`, tip is `58afc9f` or later.

**Step 2: Create branch**
```bash
git switch -c ts/slice-x-readonly-editor
```

**Step 3: Commit plan**
```bash
git add docs/plans/2026-09-07-specifyr-ts-slice-x-readonly-editor.md
git commit -m "Add Slice X plan: read-only visual editor"
```

---

## Task 2: Turn the repo into a pnpm workspace

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `.gitignore`

**Step 1: Write `pnpm-workspace.yaml`**

Content:
```yaml
packages:
  - "."
  - "frontend"
```

The `.` entry keeps the root package addressable inside the workspace so `frontend/` can list `"specifyr": "workspace:*"`.

**Step 2: Extend `.gitignore`**

Append:
```
frontend/.nuxt/
frontend/.output/
frontend/node_modules/
```

Keep the existing entries. If `node_modules/` is already ignored via a top-level `node_modules/`, the `frontend/node_modules/` line is redundant but harmless — leave it for clarity.

**Step 3: Verify pnpm still installs cleanly**
```bash
pnpm install
```
Expected: succeeds, warning-free. Root deps unchanged (workspace not yet has `frontend/` populated).

**Step 4: Commit**
```bash
git add pnpm-workspace.yaml .gitignore
git commit -m "Enable pnpm workspace with root and frontend/ packages"
```

---

## Task 3: Scaffold the `frontend/` package

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/nuxt.config.ts`
- Create: `frontend/app.vue`
- Create: `frontend/.gitkeep` (delete after Task 6 adds `pages/`)

**Step 1: Write `frontend/package.json`**

```json
{
  "name": "specifyr-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev",
    "preview": "nuxt preview"
  },
  "dependencies": {
    "specifyr": "workspace:*"
  },
  "devDependencies": {
    "nuxt": "4.0.0",
    "vue": "3.5.13"
  }
}
```

Pin exact versions. If `nuxt@4.0.0` is not yet published at install time, fall back to the newest 3.x (`3.16.0` or later) and note the substitution in the commit body.

**Step 2: Write `frontend/tsconfig.json`**

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

This file only exists so IDE typechecking works. It refers to `.nuxt/tsconfig.json`, which Nuxt generates at dev/build time. Do NOT include this tsconfig from the root `tsconfig.json` or `tsconfig.build.json` — the frontend has its own toolchain.

**Step 3: Write `frontend/nuxt.config.ts`**

```typescript
export default defineNuxtConfig({
  ssr: false,
  telemetry: false,
  devtools: { enabled: false },
  app: {
    head: {
      title: "specifyr editor",
      htmlAttrs: { lang: "en" },
    },
  },
  nitro: {
    preset: "node-server",
  },
});
```

`defineNuxtConfig` is a Nuxt global auto-imported at config-load time — no `import` line needed.

**Step 4: Write `frontend/app.vue`**

Minimal placeholder — Task 6 replaces it with real content once `pages/index.vue` exists.
```vue
<template>
  <div>specifyr editor (booting)</div>
</template>
```

**Step 5: Install**

```bash
pnpm install
```
Expected: pulls Nuxt + Vue and their tree of deps. `frontend/node_modules/` populated (usually as symlinks/hoisted to root `node_modules/`). No errors.

**Step 6: Sanity-check Nuxt boots**

```bash
pnpm --filter specifyr-frontend build
```
Expected: `nuxt build` produces `frontend/.output/server/index.mjs`. No errors.

**Step 7: Commit**
```bash
git add frontend/package.json frontend/tsconfig.json frontend/nuxt.config.ts frontend/app.vue pnpm-lock.yaml
git commit -m "Scaffold specifyr-frontend Nuxt package"
```

---

## Task 4: Add Vue Flow to the frontend

**Files:** `frontend/package.json`.

**Step 1: Add Vue Flow**

Update `frontend/package.json` `dependencies`:
```json
  "dependencies": {
    "@vue-flow/core": "1.42.0",
    "@vue-flow/background": "1.3.2",
    "specifyr": "workspace:*"
  },
```
Pin exact versions. If either version is unavailable at install time, use the latest 1.x and note the substitution in the commit body.

**Step 2: Install**
```bash
pnpm install
```
Expected: adds Vue Flow to the frontend package.

**Step 3: Commit**
```bash
git add frontend/package.json pnpm-lock.yaml
git commit -m "Add Vue Flow to the frontend"
```

---

## Task 5: Server route `/api/soll` (TDD-ish)

Nuxt server routes live under `frontend/server/api/*.ts`. Nitro auto-registers them. The route reads `SPECIFYR_REPO_PATH` from `process.env`, calls `loadSoll` from `specifyr/storage`, returns the Model as JSON.

Testing: we do NOT spin up `@nuxt/test-utils` for Slice X. The handler is a pure function that we import in a Vitest unit test.

**Files:**
- Create: `frontend/server/api/soll.get.ts`
- Create: `frontend/server/utils/soll.ts` (extracted handler for unit-testability)
- Create: `tests/frontend/soll-handler.test.ts` (in the ROOT tests/ tree, not frontend/)

**Step 1: Failing test**

Create `tests/frontend/soll-handler.test.ts`:
```typescript
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveSoll } from "../../src/storage/soll.js";
import { loadSollForRequest } from "../../frontend/server/utils/soll.js";

describe("loadSollForRequest", () => {
  let repoPath: string;
  const originalEnv = process.env.SPECIFYR_REPO_PATH;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-frontend-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.SPECIFYR_REPO_PATH;
    else process.env.SPECIFYR_REPO_PATH = originalEnv;
  });

  it("throws when SPECIFYR_REPO_PATH is not set", async () => {
    delete process.env.SPECIFYR_REPO_PATH;
    await expect(loadSollForRequest()).rejects.toThrow(/SPECIFYR_REPO_PATH/);
  });

  it("returns an empty model when SOLL is empty", async () => {
    await saveSoll(repoPath, { meta: { source: "soll" }, nodes: [], edges: [] });
    process.env.SPECIFYR_REPO_PATH = repoPath;

    const model = await loadSollForRequest();
    expect(model.meta.source).toBe("soll");
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it("returns a populated model with nodes and edges", async () => {
    await saveSoll(repoPath, {
      meta: { source: "soll" },
      nodes: [
        { id: "auth", type: "component", name: "Auth", classes: [] },
        { id: "postgres", type: "data-store", name: "Postgres", classes: [] },
      ],
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });
    process.env.SPECIFYR_REPO_PATH = repoPath;

    const model = await loadSollForRequest();
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["auth", "postgres"]);
    expect(model.edges).toHaveLength(1);
  });
});
```

Note: `frontend/server/utils/soll.js` will be imported via the workspace root's TS toolchain, but frontend files are NOT part of `tsconfig.json`'s `include`. Update `tsconfig.json` to include `frontend/server/**/*.ts`:

**Step 2: Extend root `tsconfig.json`**

Change the `include` field:
```json
  "include": ["src", "tests", "vitest.config.ts", "frontend/server/**/*.ts"]
```

Vitest will pick up the test file and its imports. The frontend's own Nuxt tsconfig continues to handle everything else in `frontend/`.

**Step 3: Run to FAIL**
```bash
pnpm test tests/frontend/soll-handler.test.ts
```
Expected: FAIL — module not found.

**Step 4: Implement `frontend/server/utils/soll.ts`**

```typescript
import { loadSoll } from "specifyr/storage";
import type { Model } from "specifyr";

export async function loadSollForRequest(): Promise<Model> {
  const repoPath = process.env.SPECIFYR_REPO_PATH;
  if (!repoPath) {
    throw new Error(
      "SPECIFYR_REPO_PATH is not set. The specifyr editor sets this automatically; " +
        "if you are running the frontend directly, export SPECIFYR_REPO_PATH=<path>.",
    );
  }
  return await loadSoll(repoPath);
}
```

**Step 5: Implement `frontend/server/api/soll.get.ts`**

```typescript
import { loadSollForRequest } from "../utils/soll.js";

export default defineEventHandler(async (event) => {
  try {
    return await loadSollForRequest();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setResponseStatus(event, 500);
    return { error: message };
  }
});
```

`defineEventHandler` and `setResponseStatus` are Nuxt/Nitro globals — no import required.

**Step 6: Run PASS**
```bash
pnpm test tests/frontend/soll-handler.test.ts
```
Expected: 3 tests pass. If Vitest complains about the `specifyr/storage` import chain (the built version), that means the workspace protocol requires `pnpm build` first. Run `pnpm build` at root once, then re-run.

**Step 7: Commit**
```bash
git add tsconfig.json frontend/server tests/frontend
git commit -m "Add /api/soll server route with unit-tested handler (TDD)"
```

---

## Task 6: Vue Flow page rendering the model

**Files:**
- Create: `frontend/pages/index.vue`
- Delete: `frontend/app.vue` (replaced by pages routing) — actually keep `app.vue` as `<NuxtPage />` wrapper
- Modify: `frontend/app.vue`

**Step 1: Rewrite `frontend/app.vue` as a page host**

```vue
<template>
  <NuxtPage />
</template>
```

**Step 2: Write `frontend/pages/index.vue`**

```vue
<script setup lang="ts">
import { VueFlow, type Node as FlowNode, type Edge as FlowEdge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

interface SollNode {
  id: string;
  type: string;
  name: string;
}

interface SollEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

interface SollModel {
  meta: { source: string; generatedAt?: string };
  nodes: SollNode[];
  edges: SollEdge[];
}

const { data, error, pending } = await useFetch<SollModel>("/api/soll");

const flowNodes = computed<FlowNode[]>(() => {
  if (!data.value?.nodes) return [];
  return data.value.nodes.map((node, index) => ({
    id: node.id,
    type: "default",
    position: {
      x: (index % 4) * 240,
      y: Math.floor(index / 4) * 160,
    },
    data: { label: `${node.name}\n(${node.type})` },
    class: `soll-node soll-node--${node.type}`,
  }));
});

const flowEdges = computed<FlowEdge[]>(() => {
  if (!data.value?.edges) return [];
  return data.value.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.type,
    animated: false,
  }));
});
</script>

<template>
  <div class="editor-shell">
    <header class="editor-topbar">
      <strong>specifyr editor</strong>
      <span v-if="data?.meta">
        · source: {{ data.meta.source }}
        <span v-if="data.meta.generatedAt">· {{ data.meta.generatedAt }}</span>
      </span>
    </header>
    <div v-if="pending" class="editor-status">Loading…</div>
    <div v-else-if="error" class="editor-status editor-status--error">
      Error: {{ error.message }}
    </div>
    <div v-else class="editor-canvas">
      <VueFlow :nodes="flowNodes" :edges="flowEdges" :nodes-draggable="false" :nodes-connectable="false" :elements-selectable="false">
        <Background />
      </VueFlow>
    </div>
  </div>
</template>

<style scoped>
.editor-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: system-ui, -apple-system, sans-serif;
}
.editor-topbar {
  padding: 0.5rem 1rem;
  background: #f4f4f5;
  border-bottom: 1px solid #d4d4d8;
  font-size: 0.9rem;
}
.editor-status {
  flex: 1;
  display: grid;
  place-items: center;
  color: #71717a;
}
.editor-status--error {
  color: #dc2626;
  white-space: pre-wrap;
}
.editor-canvas {
  flex: 1;
  min-height: 0;
}
</style>

<style>
.soll-node.vue-flow__node-default {
  border-radius: 8px;
  border: 1px solid #a1a1aa;
  padding: 8px 12px;
  font-size: 12px;
  white-space: pre-line;
  text-align: center;
  min-width: 140px;
}
.soll-node--component.vue-flow__node-default { background: #dbeafe; border-color: #3b82f6; }
.soll-node--module.vue-flow__node-default { background: #dcfce7; border-color: #22c55e; }
.soll-node--external-service.vue-flow__node-default { background: #fef3c7; border-color: #f59e0b; }
.soll-node--data-store.vue-flow__node-default { background: #fce7f3; border-color: #ec4899; }
</style>
```

The style block for `.soll-node--*` is unscoped because Vue Flow renders inside its own DOM tree; scoped styles wouldn't reach the injected nodes.

**Step 3: Verify build**
```bash
pnpm --filter specifyr-frontend build
```
Expected: exit 0, no errors. `frontend/.output/` regenerated.

**Step 4: Commit**
```bash
git add frontend/app.vue frontend/pages
git commit -m "Add Vue Flow graph page for the SOLL"
```

---

## Task 7: Root deps for the editor CLI (`open`, `get-port`)

**Files:** `package.json`, `pnpm-lock.yaml`.

**Step 1: Add deps**

Update root `package.json` `dependencies`:
```json
  "dependencies": {
    "citty": "0.1.6",
    "get-port": "7.1.0",
    "open": "10.1.0",
    "zod": "4.0.0"
  },
```
Pin exact. Both `open@10.x` and `get-port@7.x` require Node 20+ (matches our engine).

**Step 2: Install**
```bash
pnpm install
```

**Step 3: Verify gates still green**
```bash
pnpm typecheck && pnpm lint && pnpm test
```
All exit 0. Test count still 104 + 3 (from Task 5) = 107.

**Step 4: Commit**
```bash
git add package.json pnpm-lock.yaml
git commit -m "Add open and get-port for the editor CLI"
```

---

## Task 8: `runEditor` command handler (unit-tested where possible)

Pure logic — port selection, env var construction, ready-check — is extracted into unit-testable helpers. The `child_process.spawn` call and browser open are kept in the top-level handler and covered by the integration test in Task 12.

**Files:**
- Create: `src/cli/commands/editor.ts`
- Create: `tests/cli/commands/editor.test.ts`

**Step 1: Failing test**

Create `tests/cli/commands/editor.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { editorChildEnv, waitForHttpReady } from "../../../src/cli/commands/editor.js";

describe("editorChildEnv", () => {
  it("sets SPECIFYR_REPO_PATH and PORT and preserves the rest", () => {
    const env = editorChildEnv({ FOO: "bar" }, { repoPath: "/tmp/repo", port: 3939 });
    expect(env.SPECIFYR_REPO_PATH).toBe("/tmp/repo");
    expect(env.PORT).toBe("3939");
    expect(env.FOO).toBe("bar");
  });

  it("strips vitest env vars so consola prints normally in the child", () => {
    const env = editorChildEnv(
      { VITEST: "true", VITEST_POOL_ID: "1", VITEST_WORKER_ID: "1", NODE_ENV: "test", TEST: "true" },
      { repoPath: "/tmp/repo", port: 3939 },
    );
    expect(env.VITEST).toBeUndefined();
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.TEST).toBeUndefined();
  });
});

describe("waitForHttpReady", () => {
  it("resolves as soon as the URL responds with any status", async () => {
    // 1. Bind a temporary HTTP server on a fresh port.
    // 2. waitForHttpReady({ url, timeoutMs: 2000 }) resolves without throwing.
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await waitForHttpReady({ url: `http://127.0.0.1:${port}/`, timeoutMs: 2000 });
    } finally {
      server.close();
    }
  });

  it("rejects with a timeout when the URL never responds", async () => {
    await expect(
      waitForHttpReady({ url: "http://127.0.0.1:1/", timeoutMs: 200 }),
    ).rejects.toThrow(/ready|timeout/i);
  });
});
```

**Step 2: Run to FAIL**
```bash
pnpm test tests/cli/commands/editor.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement `src/cli/commands/editor.ts`**

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import getPort, { portNumbers } from "get-port";
import open from "open";

const HERE = dirname(fileURLToPath(import.meta.url));
// From dist/cli/commands/editor.js to frontend/.output/server/index.mjs
const FRONTEND_SERVER = resolve(HERE, "..", "..", "..", "frontend", ".output", "server", "index.mjs");

const VITEST_ENV_KEYS = ["VITEST", "VITEST_POOL_ID", "VITEST_WORKER_ID", "NODE_ENV", "TEST"] as const;

export interface EditorOptions {
  repoPath: string;
  port?: number;
  openBrowser?: boolean;
}

export function editorChildEnv(
  parent: NodeJS.ProcessEnv,
  { repoPath, port }: { repoPath: string; port: number },
): NodeJS.ProcessEnv {
  const {
    VITEST: _v,
    VITEST_POOL_ID: _vp,
    VITEST_WORKER_ID: _vw,
    NODE_ENV: _ne,
    TEST: _t,
    ...clean
  } = parent;
  void [_v, _vp, _vw, _ne, _t];
  return {
    ...clean,
    SPECIFYR_REPO_PATH: repoPath,
    PORT: String(port),
    NO_COLOR: parent.NO_COLOR ?? "1",
  };
}

export async function waitForHttpReady({
  url,
  timeoutMs,
  intervalMs = 100,
}: {
  url: string;
  timeoutMs: number;
  intervalMs?: number;
}): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      // any response — including 4xx/5xx — proves the server is bound
      await res.arrayBuffer();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error(`Timed out waiting for editor to be ready at ${url} after ${timeoutMs}ms`);
}

export async function runEditor(options: EditorOptions): Promise<ChildProcess> {
  const { repoPath, openBrowser = true } = options;

  if (!existsSync(FRONTEND_SERVER)) {
    throw new Error(
      `Editor build not found at ${FRONTEND_SERVER}. Run \`pnpm build\` first.`,
    );
  }

  const port = options.port ?? (await getPort({ port: portNumbers(3939, 3999) }));
  const url = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [FRONTEND_SERVER], {
    env: editorChildEnv(process.env, { repoPath, port }),
    stdio: ["ignore", "inherit", "inherit"],
  });

  const shutdown = (): void => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  child.once("exit", () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  });

  await waitForHttpReady({ url: `${url}/`, timeoutMs: 15000 });

  process.stdout.write(`Editor running at ${url} (SOLL: ${repoPath})\n`);

  if (openBrowser) {
    await open(url);
    process.stdout.write("Browser opened.\n");
  }

  return child;
}
```

**Step 4: Run to PASS**
```bash
pnpm test tests/cli/commands/editor.test.ts
```
Expected: 4 tests pass. If the port-picker test flakes because 3939 is actually busy on the test machine, that's fine — `getPort` finds a free one; the unit tests don't call `getPort`.

**Step 5: Commit**
```bash
git add src/cli/commands/editor.ts tests/cli/commands/editor.test.ts
git commit -m "Add editor command handler with port pick + child spawn (TDD)"
```

---

## Task 9: Wire `editor` into the CLI

**Files:** Modify `src/cli/index.ts`.

**Step 1: Add subcommand**

Insert after the existing `statusCommand`:
```typescript
const editorCommand = defineCommand({
  meta: {
    name: "editor",
    description: "Start the read-only editor on the given path (default: current directory).",
  },
  args: {
    path: {
      type: "positional",
      required: false,
      description: "Repository root (default: cwd).",
    },
    port: {
      type: "string",
      description: "Port to bind (default: 3939 or next free).",
      required: false,
    },
    "no-open": {
      type: "boolean",
      description: "Do not open the browser automatically.",
    },
  },
  async run({ args }) {
    const repoPath = resolve(args.path ?? process.cwd());
    const port = args.port ? Number.parseInt(args.port, 10) : undefined;
    if (port !== undefined && (Number.isNaN(port) || port < 1 || port > 65535)) {
      throw new Error(`Invalid --port value: ${args.port}`);
    }
    const child = await runEditor({
      repoPath,
      port,
      openBrowser: !args["no-open"],
    });
    // Keep the CLI process alive until the child exits (Ctrl-C forwards SIGINT).
    await new Promise<void>((resolvePromise) => {
      child.once("exit", () => resolvePromise());
    });
  },
});
```

Import at the top:
```typescript
import { runEditor } from "./commands/editor.js";
```

And register in `main`'s `subCommands`:
```typescript
  subCommands: {
    init: initCommand,
    status: statusCommand,
    editor: editorCommand,
  },
```

**Step 2: Verify gates**
```bash
pnpm typecheck && pnpm lint && pnpm test
```
All exit 0.

**Step 3: Commit**
```bash
git add src/cli/index.ts
git commit -m "Wire editor subcommand into the CLI"
```

---

## Task 10: Build orchestration includes the frontend

**Files:** Modify `package.json`.

**Step 1: Extend `build`**

Change:
```json
    "build": "tsc -p tsconfig.build.json && node scripts/copy-packs.mjs",
```
To:
```json
    "build": "tsc -p tsconfig.build.json && node scripts/copy-packs.mjs && pnpm --filter specifyr-frontend build",
```

Also add a `files` entry so the tarball ships the Nuxt output:
```json
  "files": ["dist", "frontend/.output"],
```

**Step 2: Verify full build**
```bash
pnpm install --frozen-lockfile
pnpm build
ls dist/cli
ls frontend/.output/server
```
Expected: `dist/cli/commands/editor.js` exists; `frontend/.output/server/index.mjs` exists.

**Step 3: Sanity check the tarball**
```bash
pnpm pack --pack-destination /tmp
tar -tzf /tmp/specifyr-0.1.0.tgz | grep -E 'frontend/\.output|dist/cli/commands/editor' | head -20
```
Expected: at least `package/dist/cli/commands/editor.js` and one file under `package/frontend/.output/server/`.

Cleanup: `rm /tmp/specifyr-0.1.0.tgz`.

**Step 4: Commit**
```bash
git add package.json
git commit -m "Extend build to include frontend and ship it in the tarball"
```

---

## Task 11: End-to-end integration test for `specifyr editor`

Spawn the built CLI, wait for HTTP readiness on the bound port, curl `/api/soll`, verify the JSON shape, kill the process.

**Files:** Create `tests/cli/editor-integration.test.ts`.

```typescript
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveSoll } from "../../src/storage/soll.js";

const CLI_ENTRY = resolve(process.cwd(), "dist", "cli", "index.js");
const FRONTEND_BUILD = resolve(
  process.cwd(),
  "frontend",
  ".output",
  "server",
  "index.mjs",
);

function stripVitestEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { VITEST, VITEST_POOL_ID, VITEST_WORKER_ID, NODE_ENV, TEST, ...clean } = env;
  void [VITEST, VITEST_POOL_ID, VITEST_WORKER_ID, NODE_ENV, TEST];
  return { ...clean, NO_COLOR: "1" };
}

async function waitForOutput(child: ChildProcessWithoutNullStreams, needle: RegExp, timeoutMs: number): Promise<string> {
  return await new Promise((resolvePromise, rejectPromise) => {
    let buffer = "";
    const timer = setTimeout(() => {
      rejectPromise(new Error(`Timed out waiting for ${needle} in\n${buffer}`));
    }, timeoutMs);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const match = buffer.match(needle);
      if (match) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.stderr.off("data", onData);
        resolvePromise(match[0]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });
}

describe("specifyr editor (end-to-end)", () => {
  let repoPath: string;
  let child: ChildProcessWithoutNullStreams | undefined;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) throw new Error(`CLI not built: ${CLI_ENTRY} — run 'pnpm build'`);
    if (!existsSync(FRONTEND_BUILD)) throw new Error(`Frontend not built: ${FRONTEND_BUILD}`);
  });

  beforeEach(async () => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-editor-e2e-"));
    await saveSoll(repoPath, {
      meta: { source: "soll", generatedAt: "2026-09-07T12:00:00Z" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });
  });

  afterEach(() => {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
    child = undefined;
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("boots the editor, serves /api/soll, and returns the current model", async () => {
    child = spawn(process.execPath, [CLI_ENTRY, "editor", repoPath, "--no-open"], {
      env: stripVitestEnv(process.env),
    }) as ChildProcessWithoutNullStreams;

    const runningLine = await waitForOutput(child, /Editor running at (http:\/\/127\.0\.0\.1:\d+)/, 20000);
    const url = runningLine.replace(/^Editor running at /, "");

    const res = await fetch(`${url}/api/soll`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta).toEqual({ source: "soll", generatedAt: "2026-09-07T12:00:00Z" });
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0].id).toBe("auth");
  }, 30000);
});
```

**Step 1: Ensure fresh build**
```bash
pnpm build
```

**Step 2: Run the test**
```bash
pnpm test tests/cli/editor-integration.test.ts
```
Expected: 1 test passes. Runtime ~5-15 seconds because Nuxt boot is not fast.

If Nuxt refuses to bind because of a stale port, verify no orphan process from a previous run: `lsof -iTCP:3939 -sTCP:LISTEN`.

**Step 3: Commit**
```bash
git add tests/cli/editor-integration.test.ts
git commit -m "Add end-to-end integration test for specifyr editor"
```

---

## Task 12: README section for the editor

**Files:** Modify `README.md`.

**Step 1: Update Status**

Replace the current Status list with:
```markdown
Slice 1: repo skeleton, core Zod model, tests, CI. ✅
Slice 2: SOLL storage layer — load/save `.specifyr/soll/`. ✅
Slice 3: CLI skeleton — `specifyr init` and `specifyr status`. ✅
Slice 4: vocabulary packs v1 — ten shipped language packs + loader + resolver. ✅
Slice X (current): read-only visual editor — `specifyr editor` opens a Vue Flow graph of the SOLL in the browser. ✅
Slice X+1+ (planned): editing, WebSocket live updates, MCP endpoint, drift views, auto-layout.
```

**Step 2: Extend Usage**

Insert after the existing `pnpm specifyr status ./my-repo` line:
```
    pnpm specifyr editor ./my-repo
```

And add below the fenced block:
```markdown
The editor is read-only in this slice. It fetches `.specifyr/soll/` on every page load; refresh the browser to pick up on-disk changes.
```

**Step 3: Commit**
```bash
git add README.md
git commit -m "Update README for Slice X: read-only editor"
```

---

## Task 13: Final green-checkpoint + PR

**Step 1: Full gate**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0. Test count: 104 (baseline) + 3 (soll-handler) + 4 (editor unit) + 1 (editor e2e) = **112**.

**Step 2: Push**
```bash
git push -u origin ts/slice-x-readonly-editor
```

**Step 3: Open PR**
```bash
gh pr create --base main --head ts/slice-x-readonly-editor \
  --title "TS rewrite Slice X: read-only visual editor" \
  --body-file - <<'EOF'
## Summary

Slice X of the TypeScript rewrite tracked in
[docs/plans/2026-09-07-specifyr-ts-slice-x-readonly-editor.md](docs/plans/2026-09-07-specifyr-ts-slice-x-readonly-editor.md).

Ships the first visible user surface — a `specifyr editor` command that opens a browser and renders the SOLL as a read-only Vue Flow graph.

### What's in

- pnpm workspace with root (`specifyr`) and `frontend/` (`specifyr-frontend`) subpackages.
- Nuxt 4 fullstack frontend under `frontend/`, `ssr: false`, own package.json.
- `frontend/server/api/soll.get.ts` — reads `SPECIFYR_REPO_PATH`, calls `loadSoll` from `specifyr/storage` via workspace protocol, returns the Model.
- `frontend/pages/index.vue` — fetches `/api/soll`, feeds Vue Flow, colours nodes by `type`, labels edges by `type`. No editing, no dragging-to-persist.
- `specifyr editor [path] [--port N] [--no-open]` — picks a free port (default 3939, else next), spawns Nuxt server with `SPECIFYR_REPO_PATH=<cwd>`, waits for HTTP readiness, opens the browser.
- Two new root runtime deps: `open` (browser launcher) and `get-port` (port picker).
- Root `pnpm build` now also builds Nuxt; `files` ships `frontend/.output/` in the tarball.
- End-to-end test spawns the built CLI, waits for `/api/soll` on the bound port, verifies the response matches the SOLL on disk.

### Non-goals for this slice
- Editing / dragging-to-persist / node creation
- WebSocket for live updates
- MCP endpoint
- SOLL / PLAN / IST drift views
- Auto-layout beyond Vue Flow defaults
- shadcn-vue polish / Pinia state
- Playwright browser-automation tests
- Config file support

## Test plan

- [x] `pnpm install --frozen-lockfile` clean
- [x] `pnpm build` clean — TS emit + pack copy + Nuxt build (~30-60s total)
- [x] `pnpm lint`, `pnpm typecheck` clean
- [x] `pnpm test` — 112 tests pass (baseline 104 + 3 soll-handler + 4 editor unit + 1 editor e2e)
- [x] `pnpm pack` — tarball includes `package/frontend/.output/server/index.mjs`
- [x] E2E test proves the whole stack: CLI spawns Nuxt, `/api/soll` returns live model data

## Manual verification (do this locally before merging)

    pnpm build
    mkdir /tmp/demo && pnpm specifyr init /tmp/demo
    # Optionally add some nodes/edges manually to /tmp/demo/.specifyr/soll/
    pnpm specifyr editor /tmp/demo
    # Browser opens, Vue Flow graph renders.

## Notes for reviewer
- Ports 3939-3999 are the search range for the default `--port` flag.
- The child process inherits the CLI's stdout/stderr for Nuxt logs, so any Nuxt error surfaces in the parent terminal.
- `frontend/tsconfig.json` intentionally extends `.nuxt/tsconfig.json` (generated). Do not include `frontend/` in root's `tsconfig.json` — it has its own toolchain.
EOF
```

**Step 4: Wait for CodeRabbit before merging.**

---

## Notes for the executing agent

- **YAGNI:** no shadcn-vue, no Pinia, no auto-layout library, no watch/WebSocket. Slice X is minimal on purpose.
- **DRY:** the vitest-env stripping trick lives in two places (`editorChildEnv` in `src/cli/commands/editor.ts` and `stripVitestEnv` in `tests/cli/editor-integration.test.ts`). Two callers, two lines — inline in both; a shared helper is overkill.
- **Import discipline:** every local `.ts` import inside `src/` uses `.js` extension. `frontend/server/**/*.ts` files also use `.js` on their imports (Nuxt/Nitro follows the same emit contract as our root).
- **TDD:** Tasks 5 and 8 are strict test-first. Tasks 2, 3, 4, 6, 7, 9, 10 are wiring / config / infra. Task 11 is a fresh integration test.
- **Nuxt build time** dominates `pnpm build` — ~30-60s. CI runtime jumps. Acceptable for now.
- **Do not touch Slice 1-4 code** except the additive extensions listed per task.
- **Main is protected**, work on `ts/slice-x-readonly-editor`, land via PR, **CR before merge**.
- **Failure to run `pnpm build` before tests will cause both Task 5 and Task 11 to fail** with import-resolution errors — the workspace protocol needs at least one prior build so `dist/storage/index.js` exists. If Task 5 fails with an import error, `pnpm build` at root, then retry.
