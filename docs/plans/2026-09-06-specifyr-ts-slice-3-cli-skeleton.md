# specifyr TS Rewrite — Slice 3: CLI Skeleton

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the first user-facing surface: a `specifyr` binary with two commands — `init` (create an empty SOLL) and `status` (load a SOLL and print a summary) — wired on top of Slice 2's storage.

**Architecture:** Command handlers live under `src/cli/commands/` as pure async functions taking a plain options object and returning a report structure. Reports are formatted by a separate `format*` function so tests assert on structured output, not on prose. `src/cli/index.ts` uses [citty](https://github.com/unjs/citty) to parse args and dispatch. The compiled binary is published as `dist/cli/index.js` and referenced from `package.json`'s `bin` field with a `#!/usr/bin/env node` shebang preserved through the tsc emit.

**Tech Stack:** TypeScript 5, Zod 4 (via Slice 1), Node `node:fs/promises`, `citty@0.1.6` (only new dependency), Vitest. Slice 2's `loadSoll`/`saveSoll` from the `specifyr/storage` subpath.

**Reference:**
- Design doc: [docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md) §11.2 CLI commands
- Slice 1 plan: [docs/plans/2026-09-06-specifyr-ts-slice-1-skeleton-core-model.md](2026-09-06-specifyr-ts-slice-1-skeleton-core-model.md)
- Slice 2 plan: [docs/plans/2026-09-06-specifyr-ts-slice-2-soll-storage.md](2026-09-06-specifyr-ts-slice-2-soll-storage.md)
- Slice 2 exports (already on main): `loadSoll`, `saveSoll`, `sollRoot`, `resolveInsideRoot`, `bucketForNode`, `SUPPORTED_NODE_TYPES` from `specifyr/storage`
- Slice 1 exports: `ModelSchema`, `NodeSchema`, `Model`, `Node`, etc. from `specifyr`
- Note: `resolveInsideRoot` is **async** since the Slice 2 merge (symlink hardening) — remember to `await` it if the CLI code touches it directly

**Branch:** `ts/slice-3-cli-skeleton` off current `main` (`a19c720` at time of writing). Main is protected. Land via PR. Wait for CodeRabbit before merging (memory: `CR before merge`).

**Non-goals for Slice 3:**
- `specifyr editor` (needs Nitro — later slice)
- `specifyr check --model` (needs rules evaluator port)
- `specifyr extract`, `graphify-import`, `rules-verify`, `benchmark`
- `--json` output flag (add the first command that needs it)
- Colour / spinner / progress output
- Config file (`.specifyrrc`, `.specifyr/config.json`) — CLI takes flags only
- Watcher / `--watch` mode

**User-facing behaviour Slice 3 ships:**

```text
$ specifyr --help
USAGE specifyr [OPTIONS] <command>

COMMANDS
  init      Create an empty .specifyr/soll/ under the given path.
  status    Load .specifyr/soll/ under the given path and print a summary.

Use specifyr <command> --help for more information about a command.

$ specifyr init /some/repo
Created .specifyr/soll/ under /some/repo.

$ specifyr status /some/repo
SOLL summary for /some/repo
  source:       soll
  generated at: 2026-09-06T12:00:00Z
  nodes:        4
    component:        1
    module:           1
    external-service: 1
    data-store:       1
  edges:        2

$ specifyr status /empty/repo
Error: SOLL storage: required file missing (_meta.json): /empty/repo/.specifyr/soll/_meta.json

Run `specifyr init /empty/repo` to create an empty SOLL.
```

Exit codes: `0` on success, `1` on any error.

---

## Task 1: Create the working branch

**Files:** git ref `HEAD`.

**Step 1: Confirm clean main**
```bash
git status && git branch --show-current && git log --oneline -1
```
Expected: clean, on `main`, tip is `a19c720` or later.

**Step 2: Create the branch**
```bash
git switch -c ts/slice-3-cli-skeleton
```

**Step 3: Commit the plan doc**
```bash
git add docs/plans/2026-09-06-specifyr-ts-slice-3-cli-skeleton.md
git commit -m "Add Slice 3 plan: CLI skeleton"
```

---

## Task 2: Add citty dependency

**Files:** `package.json`, `pnpm-lock.yaml`.

**Step 1: Add to dependencies**

Edit `package.json` `dependencies`:
```json
  "dependencies": {
    "citty": "0.1.6",
    "zod": "4.0.0"
  },
```
Exact pin — no caret.

**Step 2: Install**
```bash
pnpm install
```
Expected: `+ citty 0.1.6`, `pnpm-lock.yaml` updated.

**Step 3: Verify no unexpected changes**
```bash
git diff pnpm-lock.yaml | head -40
```
Expected: additions for citty and its (small) tree of deps. No unrelated changes.

**Step 4: Verify gates still green**
```bash
pnpm typecheck && pnpm lint && pnpm test
```
All exit 0. Test count still 58 (no code changes yet).

**Step 5: Commit**
```bash
git add package.json pnpm-lock.yaml
git commit -m "Add citty dependency for CLI"
```

---

## Task 3: Report types (TDD)

Structured report objects returned by each command handler. Tests assert on structure; formatters render human strings later. Keeps parsing tests decoupled from prose.

**Files:**
- Create: `src/cli/report.ts`
- Create: `tests/cli/report.test.ts`

**Step 1: Failing test**

Create `tests/cli/report.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { formatInitReport, formatStatusReport } from "../../src/cli/report.js";

describe("formatInitReport", () => {
  it("mentions the repo path where SOLL was created", () => {
    const output = formatInitReport({ repoPath: "/tmp/repo", createdEmpty: true });
    expect(output).toMatch(/\/tmp\/repo/);
    expect(output).toMatch(/created/i);
  });
});

describe("formatStatusReport", () => {
  it("shows meta, node counts grouped by type, and edge count", () => {
    const output = formatStatusReport({
      repoPath: "/tmp/repo",
      meta: { source: "soll", generatedAt: "2026-09-06T12:00:00Z" },
      nodesByType: [
        { type: "component", count: 2 },
        { type: "data-store", count: 1 },
      ],
      totalNodes: 3,
      totalEdges: 1,
    });
    expect(output).toMatch(/\/tmp\/repo/);
    expect(output).toMatch(/source:\s+soll/);
    expect(output).toMatch(/2026-09-06T12:00:00Z/);
    expect(output).toMatch(/component:\s+2/);
    expect(output).toMatch(/data-store:\s+1/);
    expect(output).toMatch(/nodes:\s+3/);
    expect(output).toMatch(/edges:\s+1/);
  });

  it("omits the generated-at line when absent", () => {
    const output = formatStatusReport({
      repoPath: "/tmp/repo",
      meta: { source: "soll" },
      nodesByType: [],
      totalNodes: 0,
      totalEdges: 0,
    });
    expect(output).not.toMatch(/generated at/);
    expect(output).toMatch(/nodes:\s+0/);
    expect(output).toMatch(/edges:\s+0/);
  });
});
```

**Step 2: Run to FAIL**
```bash
pnpm test tests/cli/report.test.ts
```
Expected: module not found.

**Step 3: Implement**

Create `src/cli/report.ts`:
```typescript
import type { ModelMeta } from "../core/schemas.js";

export interface InitReport {
  repoPath: string;
  createdEmpty: boolean;
}

export interface NodeTypeCount {
  type: string;
  count: number;
}

export interface StatusReport {
  repoPath: string;
  meta: ModelMeta;
  nodesByType: NodeTypeCount[];
  totalNodes: number;
  totalEdges: number;
}

export function formatInitReport(report: InitReport): string {
  return `Created .specifyr/soll/ under ${report.repoPath}.\n`;
}

export function formatStatusReport(report: StatusReport): string {
  const lines: string[] = [];
  lines.push(`SOLL summary for ${report.repoPath}`);
  lines.push(`  source:       ${report.meta.source}`);
  if (report.meta.generatedAt) {
    lines.push(`  generated at: ${report.meta.generatedAt}`);
  }
  lines.push(`  nodes:        ${report.totalNodes}`);
  for (const { type, count } of report.nodesByType) {
    lines.push(`    ${type}: ${count}`);
  }
  lines.push(`  edges:        ${report.totalEdges}`);
  return `${lines.join("\n")}\n`;
}
```

**Step 4: Run to PASS** — 3 tests.

**Step 5: Commit**
```bash
git add src/cli/report.ts tests/cli/report.test.ts
git commit -m "Add CLI report types and formatters (TDD)"
```

---

## Task 4: `init` command handler (TDD)

Pure function that creates an empty SOLL at the given path via `saveSoll`. Returns an `InitReport`. Does no console I/O.

**Files:**
- Create: `src/cli/commands/init.ts`
- Create: `tests/cli/commands/init.test.ts`

**Step 1: Failing test**

Create `tests/cli/commands/init.test.ts`:
```typescript
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../../../src/cli/commands/init.js";

describe("runInit", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-init-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("creates .specifyr/soll/ with an empty model and returns a report naming the path", async () => {
    const report = await runInit({ repoPath });

    expect(report).toEqual({ repoPath, createdEmpty: true });

    const soll = join(repoPath, ".specifyr", "soll");
    expect(existsSync(join(soll, "_meta.json"))).toBe(true);
    expect(existsSync(join(soll, "_index.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(soll, "_meta.json"), "utf8"))).toEqual({
      source: "soll",
    });
    expect(JSON.parse(readFileSync(join(soll, "_index.json"), "utf8"))).toEqual({
      edges: [],
    });
  });

  it("refuses to overwrite an existing non-empty SOLL", async () => {
    // Seed a SOLL that already has a node.
    await runInit({ repoPath });
    const { saveSoll } = await import("../../../src/storage/soll.js");
    await saveSoll(repoPath, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });

    await expect(runInit({ repoPath })).rejects.toThrow(/already initialized|not empty/i);
  });

  it("is idempotent when the existing SOLL is empty", async () => {
    const first = await runInit({ repoPath });
    const second = await runInit({ repoPath });
    expect(second).toEqual(first);
  });
});
```

**Step 2: Run to FAIL**
```bash
pnpm test tests/cli/commands/init.test.ts
```
Expected: module not found.

**Step 3: Implement**

Create `src/cli/commands/init.ts`:
```typescript
import { loadSoll, saveSoll } from "../../storage/soll.js";
import type { InitReport } from "../report.js";

export interface InitOptions {
  repoPath: string;
}

export async function runInit(options: InitOptions): Promise<InitReport> {
  const { repoPath } = options;

  try {
    const existing = await loadSoll(repoPath);
    if (existing.nodes.length > 0 || existing.edges.length > 0) {
      throw new Error(
        `SOLL already initialized and not empty at ${repoPath}. ` +
          `Refusing to overwrite; ${existing.nodes.length} node(s) and ${existing.edges.length} edge(s) present.`,
      );
    }
    // empty SOLL: nothing to do
    return { repoPath, createdEmpty: true };
  } catch (cause) {
    // loadSoll failed — assume no SOLL exists yet and create one.
    if (!isMissingSollError(cause)) throw cause;
  }

  await saveSoll(repoPath, {
    meta: { source: "soll" },
    nodes: [],
    edges: [],
  });
  return { repoPath, createdEmpty: true };
}

function isMissingSollError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  return /required file missing|ENOENT/.test(cause.message);
}
```

Note: `loadSoll` throws "SOLL storage: required file missing (_meta.json): …" for a missing tree — that's what `isMissingSollError` matches. Adjust the regex if the actual error string differs.

**Step 4: Run to PASS** — 3 tests.

**Step 5: Commit**
```bash
git add src/cli/commands/init.ts tests/cli/commands/init.test.ts
git commit -m "Add init command handler (TDD)"
```

---

## Task 5: `status` command handler (TDD)

Pure function that loads the SOLL and returns a `StatusReport` with node counts grouped by type and edge total.

**Files:**
- Create: `src/cli/commands/status.ts`
- Create: `tests/cli/commands/status.test.ts`

**Step 1: Failing test**

Create `tests/cli/commands/status.test.ts`:
```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveSoll } from "../../../src/storage/soll.js";
import { runStatus } from "../../../src/cli/commands/status.js";

describe("runStatus", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-status-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("summarises an empty SOLL", async () => {
    await saveSoll(repoPath, { meta: { source: "soll" }, nodes: [], edges: [] });
    const report = await runStatus({ repoPath });

    expect(report).toEqual({
      repoPath,
      meta: { source: "soll" },
      nodesByType: [],
      totalNodes: 0,
      totalEdges: 0,
    });
  });

  it("groups node counts by type in alphabetical order", async () => {
    await saveSoll(repoPath, {
      meta: { source: "soll", generatedAt: "2026-09-06T12:00:00Z" },
      nodes: [
        { id: "auth", type: "component", name: "Auth", classes: [] },
        { id: "users", type: "component", name: "Users", classes: [] },
        { id: "stripe", type: "external-service", name: "Stripe", classes: [] },
        { id: "postgres", type: "data-store", name: "Postgres", classes: [] },
      ],
      edges: [
        { id: "e1", from: "auth", to: "postgres", type: "reads-from" },
        { id: "e2", from: "users", to: "stripe", type: "depends-on" },
      ],
    });

    const report = await runStatus({ repoPath });
    expect(report.totalNodes).toBe(4);
    expect(report.totalEdges).toBe(2);
    expect(report.nodesByType).toEqual([
      { type: "component", count: 2 },
      { type: "data-store", count: 1 },
      { type: "external-service", count: 1 },
    ]);
    expect(report.meta.generatedAt).toBe("2026-09-06T12:00:00Z");
  });

  it("propagates loadSoll errors", async () => {
    await expect(runStatus({ repoPath })).rejects.toThrow(/_meta\.json/);
  });
});
```

**Step 2: Run to FAIL**
```bash
pnpm test tests/cli/commands/status.test.ts
```
Expected: module not found.

**Step 3: Implement**

Create `src/cli/commands/status.ts`:
```typescript
import { loadSoll } from "../../storage/soll.js";
import type { NodeTypeCount, StatusReport } from "../report.js";

export interface StatusOptions {
  repoPath: string;
}

export async function runStatus(options: StatusOptions): Promise<StatusReport> {
  const { repoPath } = options;
  const model = await loadSoll(repoPath);

  const countsByType = new Map<string, number>();
  for (const node of model.nodes) {
    countsByType.set(node.type, (countsByType.get(node.type) ?? 0) + 1);
  }

  const nodesByType: NodeTypeCount[] = Array.from(countsByType.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => a.type.localeCompare(b.type));

  return {
    repoPath,
    meta: model.meta,
    nodesByType,
    totalNodes: model.nodes.length,
    totalEdges: model.edges.length,
  };
}
```

**Step 4: Run to PASS** — 3 tests.

**Step 5: Commit**
```bash
git add src/cli/commands/status.ts tests/cli/commands/status.test.ts
git commit -m "Add status command handler (TDD)"
```

---

## Task 6: citty entry point wiring

`src/cli/index.ts` uses citty to define the root command and two subcommands. Each subcommand delegates to a handler (`runInit`, `runStatus`) and writes formatted output to `process.stdout`, errors to `process.stderr`, and sets `process.exitCode = 1` on failure.

**Files:**
- Create: `src/cli/index.ts`

**Step 1: Write**

Create `src/cli/index.ts`:
```typescript
#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { resolve } from "node:path";

import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { formatInitReport, formatStatusReport } from "./report.js";

const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Create an empty .specifyr/soll/ under the given path (default: current directory).",
  },
  args: {
    path: {
      type: "positional",
      required: false,
      description: "Repository root (default: cwd).",
    },
  },
  async run({ args }) {
    const repoPath = resolve(args.path ?? process.cwd());
    const report = await runInit({ repoPath });
    process.stdout.write(formatInitReport(report));
  },
});

const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Load .specifyr/soll/ under the given path and print a summary.",
  },
  args: {
    path: {
      type: "positional",
      required: false,
      description: "Repository root (default: cwd).",
    },
  },
  async run({ args }) {
    const repoPath = resolve(args.path ?? process.cwd());
    const report = await runStatus({ repoPath });
    process.stdout.write(formatStatusReport(report));
  },
});

const main = defineCommand({
  meta: {
    name: "specifyr",
    version: "0.1.0",
    description: "Visual architecture editor with SOLL/PLAN/IST drift-check.",
  },
  subCommands: {
    init: initCommand,
    status: statusCommand,
  },
});

runMain(main).catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
```

Notes:
- The shebang MUST be on line 1 with no BOM. `tsc` preserves it in the emit because we set `target: ES2022` (no down-transpilation). Confirm after Task 8.
- Biome may want the shebang stripped — set an override if needed (Task 9 covers it).

**Step 2: Verify typecheck**
```bash
pnpm typecheck
```
Expected: exit 0.

**Step 3: Verify build emits with shebang**
```bash
pnpm build
head -1 dist/cli/index.js
```
Expected first line: `#!/usr/bin/env node`.

**Step 4: Verify lint** (Task 9 fixes any Biome complaint about the shebang)
```bash
pnpm lint
```

If it fails on the shebang, jump to Task 9's shebang override, apply just that fix, come back, then commit here.

**Step 5: Commit**
```bash
git add src/cli/index.ts
git commit -m "Wire citty entry point for init and status commands"
```

---

## Task 7: Publish the binary

**Files:** `package.json`.

**Step 1: Add `bin`**

Extend `package.json`:
```json
  "bin": {
    "specifyr": "dist/cli/index.js"
  },
```
Place it between `files` and `exports` to keep the top of the file readable.

**Step 2: Verify**
```bash
pnpm build
ls -la dist/cli/index.js
head -1 dist/cli/index.js
```
Expected: file exists, first line is the shebang, permissions can be non-executable (Node ESM tolerates `node dist/cli/index.js` and pnpm's bin linking will set the exec bit at install time).

**Step 3: Verify install-time linking works**
```bash
pnpm pack --pack-destination /tmp
```
Expected: creates `/tmp/specifyr-0.1.0.tgz`. Do NOT publish it — this is just to confirm the tarball would be usable. Remove it after: `rm /tmp/specifyr-0.1.0.tgz`.

**Step 4: Commit**
```bash
git add package.json
git commit -m "Publish specifyr binary via package.json bin"
```

---

## Task 8: End-to-end integration test

Spawn the built CLI in a temp dir and drive `init` → `status` end-to-end. This is the only test that exercises citty. Everything else is unit-tested.

**Files:**
- Create: `tests/cli/integration.test.ts`

**Step 1: Test**

```typescript
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const CLI_ENTRY = resolve(process.cwd(), "dist", "cli", "index.js");

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[]): Promise<CliResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

describe("specifyr CLI (end-to-end)", () => {
  let repoPath: string;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) {
      throw new Error(
        `CLI entry not built: ${CLI_ENTRY}. Run 'pnpm build' before this test.`,
      );
    }
  });

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-e2e-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("init followed by status walks the full flow", async () => {
    const init = await runCli(["init", repoPath]);
    expect(init.exitCode).toBe(0);
    expect(init.stdout).toMatch(new RegExp(`Created .*${repoPath}`));

    expect(existsSync(join(repoPath, ".specifyr", "soll", "_meta.json"))).toBe(true);

    const status = await runCli(["status", repoPath]);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toMatch(/SOLL summary for/);
    expect(status.stdout).toMatch(/nodes:\s+0/);
    expect(status.stdout).toMatch(/edges:\s+0/);
  });

  it("status on an uninitialized directory exits 1 with a helpful stderr", async () => {
    const result = await runCli(["status", repoPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/_meta\.json/);
  });

  it("--help lists the two commands", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/init/);
    expect(result.stdout).toMatch(/status/);
  });
});
```

**Step 2: Ensure the build is fresh**
```bash
pnpm build
```

**Step 3: Run the test**
```bash
pnpm test tests/cli/integration.test.ts
```
Expected: 3 tests pass.

If citty prints its help on stderr rather than stdout, adjust the `--help` assertion to check both streams. Do NOT loosen the exit code check.

**Step 4: Commit**
```bash
git add tests/cli/integration.test.ts
git commit -m "Add CLI end-to-end integration test"
```

---

## Task 9: Biome shebang override + `dist/cli` in build

**Files:**
- Modify: `biome.jsonc`
- Modify: `tsconfig.build.json` (only if needed)

**Step 1: Add shebang override to Biome**

If Task 6's `pnpm lint` complained about `#!/usr/bin/env node`, add to `biome.jsonc`:
```jsonc
  "overrides": [
    {
      "include": ["src/cli/index.ts"],
      "linter": {
        "rules": {
          "correctness": {
            "noNodejsModules": "off"
          }
        }
      }
    }
  ]
```
Actually the shebang is not a Biome complaint by default — the more likely complaint is `noNodejsModules` in the linter or a preference around top-level statements. If `pnpm lint` was clean in Task 6, skip this step entirely.

**Step 2: Verify tsc emits dist/cli/**
```bash
pnpm build
ls dist/cli
```
Expected: `index.js`, `index.d.ts`, `commands/`, `report.js`, `report.d.ts`. If `dist/cli/` is missing, check that `tsconfig.build.json`'s `include` is `["src"]` (already true, so this should work automatically).

**Step 3: Verify the full gate**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0.

**Step 4: Commit only if you changed a config**

If Biome or tsconfig was modified in this task:
```bash
git add biome.jsonc tsconfig.build.json
git commit -m "Adjust Biome / tsconfig for CLI shebang and dist emit"
```
Otherwise skip — no commit, move to Task 10.

---

## Task 10: README status bump

**Files:** `README.md`.

**Step 1: Extend the Status section**

Insert a new line before `Slice 3+ (planned)`:
```markdown
Slice 3 (current): CLI skeleton — `specifyr init` and `specifyr status`. ✅
Slice 4+ (planned): rules evaluator, Nitro editor, MCP endpoint, extractors.
```
Also add a Usage section under Development:
```markdown
## Usage

After building (`pnpm build`), the CLI is available as `pnpm specifyr`:

    pnpm specifyr init ./my-repo
    pnpm specifyr status ./my-repo

Or install globally (once published to npm) with `npm i -g specifyr`.
```

**Step 2: Commit**
```bash
git add README.md
git commit -m "Update README with Slice 3 status and CLI usage"
```

---

## Task 11: Final green-checkpoint + PR

**Step 1: Full gate**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
Test count: 58 (baseline) + 3 (report) + 3 (init) + 3 (status) + 3 (integration) = **70**.

**Step 2: Push**
```bash
git push -u origin ts/slice-3-cli-skeleton
```

**Step 3: Open PR**
```bash
gh pr create --base main --head ts/slice-3-cli-skeleton \
  --title "TS rewrite Slice 3: CLI skeleton with init and status" \
  --body-file - <<'EOF'
## Summary

Slice 3 of the TypeScript rewrite tracked in
[docs/plans/2026-09-06-specifyr-ts-slice-3-cli-skeleton.md](docs/plans/2026-09-06-specifyr-ts-slice-3-cli-skeleton.md).

Ships the first user-facing surface:

- `specifyr init [path]` — creates `.specifyr/soll/` with an empty `Model` at the given path (default cwd). Refuses to overwrite a non-empty SOLL, idempotent on an empty one.
- `specifyr status [path]` — loads the SOLL and prints a plain-text summary (source, generated-at, node count grouped by type, edge count).
- New `bin: { specifyr: "dist/cli/index.js" }` in `package.json`, with `#!/usr/bin/env node` shebang preserved through the tsc emit.
- Only new runtime dependency: `citty@0.1.6`.

Command handlers are pure async functions in `src/cli/commands/*` returning structured `InitReport`/`StatusReport` objects. Formatters render the strings. Citty in `src/cli/index.ts` is the only piece that touches `process.stdout`/`process.stderr`/`process.exitCode`. That split keeps ~90% of the CLI unit-testable without spawning a child process.

**Non-goals for this slice:** `specifyr editor`, `check`, `extract`, `graphify-import`, `rules-verify`, `benchmark`, `--json` output flag, config files, watchers, colours. Those land in later slices as their dependencies (rules evaluator, extractors, Nitro) come online.

## Test plan

- [x] `pnpm install --frozen-lockfile` clean
- [x] `pnpm build` clean; `dist/cli/index.js` first line is the shebang
- [x] `pnpm lint`, `pnpm typecheck` clean
- [x] `pnpm test` — 70 tests across all suites pass (baseline 58 + 12 new)
- [x] End-to-end test spawns the built CLI: `init` → `status` walks the flow, `status` on empty dir exits 1 with helpful stderr, `--help` lists both commands
- [x] `pnpm pack` produces a tarball whose bin entry resolves to the built CLI
EOF
```

**Step 4: Do not merge**

Per memory, wait for CodeRabbit and address every valid finding.

---

## Notes for the executing agent

- **Import discipline:** every `import` from local files uses `.js` extensions (matches the Slice 1 reviewer fix). Storage/core/schemas are imported as `.js` even though the source is `.ts` — the tsc emit and Node ESM both expect `.js` at runtime.
- **Async gotcha:** `resolveInsideRoot` from `src/storage/paths.ts` was made async by the Slice 2 merge. Slice 3 does not call it directly; but if you later add code that does, remember to `await`.
- **DRY:** `runInit` and `runStatus` both accept `{ repoPath: string }`. Do not build a shared `CommandOptions` type until a third command needs it (YAGNI).
- **YAGNI:** no colour library, no ora spinner, no debug logger. `console.log` is fine — actually use `process.stdout.write` for consistent trailing-newline semantics.
- **TDD:** Tasks 3-5 and 8 are strict test-first. Tasks 2, 6, 7, 9, 10 are wiring / config and can be verify-then-commit.
- **Commit hygiene:** one commit per task with the exact message shown. If a task decomposes into multiple commits (Biome forced a rework, etc.) name the follow-ups clearly.
- **Main is protected**, work on `ts/slice-3-cli-skeleton`, land via PR, **CR before merge**.
- **Do not touch Slice 1 or Slice 2 code** except the two `package.json` extensions (`dependencies` in Task 2, `bin` in Task 7).
