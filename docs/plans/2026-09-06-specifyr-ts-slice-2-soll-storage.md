# specifyr TS Rewrite — Slice 2: SOLL Storage Layer

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist and hydrate the `Model` (from Slice 1) as a git-friendly file tree under `.specifyr/soll/`, path-traversal-hardened, TDD-covered against a temp-dir per test.

**Architecture:** New `src/storage/` module with `loadSoll(root)` and `saveSoll(root, model)`. Bucket decision is a pure function on `node.type`: `"component" | "module"` → `components/<id>/component.json` (folder-per-node), `"external-service" | "data-store"` → `external/<id>.json` (single file). Cross-component and intra-component edges all live in `_index.json` for now — intra-component edges make sense only once class-level nodes exist (later slice). Every path derived from a node id goes through a single `resolveInsideRoot()` helper that re-validates the id against `NODE_ID_PATTERN` and confirms the resolved absolute path is still under the SOLL root. Writes are two-phase (tmp file → `rename`) for atomicity per file. Removals on re-save are explicit: `saveSoll` computes a diff of on-disk files vs. the incoming model and deletes stale ones so the tree tracks the model.

**Tech Stack:** TypeScript 5, Zod 4 (via existing schemas), Node `node:fs/promises`, Vitest. No new runtime dependencies.

**Reference:**
- Design doc: [docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md) §7.3 SOLL storage layout, §7.1 Common schema
- Slice 1 plan: [docs/plans/2026-09-06-specifyr-ts-slice-1-skeleton-core-model.md](2026-09-06-specifyr-ts-slice-1-skeleton-core-model.md)
- Slice 1 exports (already published): `ModelSchema`, `NodeSchema`, `EdgeSchema`, `NODE_ID_PATTERN`, `Model`, `Node`, `Edge`, `ModelMeta`, `ModelSource` from `src/core/index.ts`

**Branch:** Work on `ts/slice-2-soll-storage` off current `main` (`bdf6916` at time of writing). Do not push to `main` — protected. Open a PR at the end. Wait for CodeRabbit before merging (memory: `CR before merge`).

**Non-goals for Slice 2:**
- `_views.json`, `_layout.json`, `notes.md`, `classes.json` split-per-class
- Vocabulary-driven type→bucket mapping (hard-coded 4 types this slice)
- PLAN and IST extractors (later slices)
- CLI commands (`specifyr init`, etc. — later slice)
- Watchers / chokidar (later slice)
- Concurrency locking between multiple processes

**On-disk layout Slice 2 produces:**
```
<root>/.specifyr/soll/
├── _meta.json                 # ModelMeta (source: "soll", generatedAt?)
├── _index.json                # { edges: Edge[] }
├── components/
│   └── <id>/
│       └── component.json     # Node (classes[] inlined)
└── external/
    └── <id>.json              # Node
```

---

## Task 1: Create the working branch

**Files:**
- Modify: git ref `HEAD`

**Step 1: Confirm clean main**

Run: `git status && git branch --show-current && git log --oneline -1`
Expected: clean, on `main`, tip is `bdf6916` (or later if `main` moved).

**Step 2: Create and switch**

Run: `git switch -c ts/slice-2-soll-storage`
Expected: `Zu neuem Branch 'ts/slice-2-soll-storage' gewechselt`.

**Step 3: Commit the plan doc**

```bash
git add docs/plans/2026-09-06-specifyr-ts-slice-2-soll-storage.md
git commit -m "Add Slice 2 plan: SOLL storage layer"
```

---

## Task 2: Bucket helper (TDD)

Pure function that maps a `Node` to its storage bucket + layout. Everything else in the storage module builds on this.

**Files:**
- Create: `src/storage/bucket.ts`
- Create: `tests/storage/bucket.test.ts`

**Step 1: Failing test**

Create `tests/storage/bucket.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { bucketForNode, SUPPORTED_NODE_TYPES } from "../../src/storage/bucket.ts";

describe("bucketForNode", () => {
  it("maps component to components/ folder layout", () => {
    expect(bucketForNode({ id: "auth", type: "component", name: "Auth" })).toEqual({
      bucket: "components",
      layout: "folder",
    });
  });

  it("maps module to components/ folder layout", () => {
    expect(bucketForNode({ id: "core", type: "module", name: "Core" })).toEqual({
      bucket: "components",
      layout: "folder",
    });
  });

  it("maps external-service to external/ file layout", () => {
    expect(bucketForNode({ id: "stripe", type: "external-service", name: "Stripe" })).toEqual({
      bucket: "external",
      layout: "file",
    });
  });

  it("maps data-store to external/ file layout", () => {
    expect(bucketForNode({ id: "postgres", type: "data-store", name: "Postgres" })).toEqual({
      bucket: "external",
      layout: "file",
    });
  });

  it("throws for an unknown node type and lists supported types in the message", () => {
    expect(() =>
      bucketForNode({ id: "auth", type: "person", name: "Auth" }),
    ).toThrow(/person.*supported.*component/i);
  });

  it("exposes the supported set for callers that need to whitelist upfront", () => {
    expect(SUPPORTED_NODE_TYPES).toEqual(["component", "module", "external-service", "data-store"]);
  });
});
```

**Step 2: Run to see it fail**

Run: `pnpm test tests/storage/bucket.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement**

Create `src/storage/bucket.ts`:
```typescript
import type { Node } from "../core/schemas.ts";

export type SollBucket = "components" | "external";
export type SollLayout = "folder" | "file";

export const SUPPORTED_NODE_TYPES = [
  "component",
  "module",
  "external-service",
  "data-store",
] as const;

export type SupportedNodeType = (typeof SUPPORTED_NODE_TYPES)[number];

export function bucketForNode(node: Pick<Node, "type">): {
  bucket: SollBucket;
  layout: SollLayout;
} {
  switch (node.type) {
    case "component":
    case "module":
      return { bucket: "components", layout: "folder" };
    case "external-service":
    case "data-store":
      return { bucket: "external", layout: "file" };
    default:
      throw new Error(
        `SOLL storage: unsupported node type ${JSON.stringify(node.type)}. ` +
          `Supported types: ${SUPPORTED_NODE_TYPES.join(", ")}.`,
      );
  }
}
```

**Step 4: Run to see it pass**

Run: `pnpm test tests/storage/bucket.test.ts`
Expected: PASS, 6 tests.

**Step 5: Commit**

```bash
git add src/storage/bucket.ts tests/storage/bucket.test.ts
git commit -m "Add bucket helper mapping Node.type to SOLL layout (TDD)"
```

---

## Task 3: Path-safety helper (TDD)

Single choke point that turns `(root, ...segments)` into an absolute path, re-validates every id segment against `NODE_ID_PATTERN`, and confirms the resolved path is inside `root`. Any storage code that touches the filesystem must go through this.

**Files:**
- Create: `src/storage/paths.ts`
- Create: `tests/storage/paths.test.ts`

**Step 1: Failing test**

Create `tests/storage/paths.test.ts`:
```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveInsideRoot, sollRoot } from "../../src/storage/paths.ts";

describe("sollRoot", () => {
  it("returns <root>/.specifyr/soll", () => {
    expect(sollRoot("/tmp/repo")).toBe(join("/tmp/repo", ".specifyr", "soll"));
  });
});

describe("resolveInsideRoot", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "specifyr-paths-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("joins segments beneath root", () => {
    const resolved = resolveInsideRoot(root, ["components", "auth", "component.json"]);
    expect(resolved).toBe(join(root, "components", "auth", "component.json"));
  });

  it("passes id segments that match NODE_ID_PATTERN", () => {
    expect(() => resolveInsideRoot(root, ["components", "auth-service_1"])).not.toThrow();
  });

  it("rejects an id segment containing a slash", () => {
    expect(() => resolveInsideRoot(root, ["components", `nested${sep}bad`])).toThrow(
      /invalid path segment/i,
    );
  });

  it("rejects an id segment equal to ..", () => {
    expect(() => resolveInsideRoot(root, ["components", ".."])).toThrow(/invalid path segment/i);
  });

  it("rejects an id segment with an absolute prefix", () => {
    expect(() => resolveInsideRoot(root, ["components", "/etc"])).toThrow(
      /invalid path segment/i,
    );
  });

  it("rejects id segments that would traverse outside root even if each segment looks fine", () => {
    // Symlink-based escape not tested here; string-level defence only.
    expect(() =>
      resolveInsideRoot(root, ["components", "auth", "..", "..", "..", "escape"]),
    ).toThrow(/outside soll root/i);
  });
});
```

**Step 2: Run to see it fail**

Run: `pnpm test tests/storage/paths.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement**

Create `src/storage/paths.ts`:
```typescript
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { NODE_ID_PATTERN } from "../core/schemas.ts";

const FIXED_NAMES = new Set([
  ".specifyr",
  "soll",
  "components",
  "external",
  "_meta.json",
  "_index.json",
  "component.json",
]);

export function sollRoot(repoRoot: string): string {
  return join(repoRoot, ".specifyr", "soll");
}

export function resolveInsideRoot(root: string, segments: string[]): string {
  for (const segment of segments) {
    if (!isValidSegment(segment)) {
      throw new Error(`SOLL storage: invalid path segment ${JSON.stringify(segment)}`);
    }
  }
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, ...segments);
  const rel = relative(absoluteRoot, candidate);
  if (rel === "" || rel === "." || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return candidate;
  }
  throw new Error(`SOLL storage: resolved path escapes outside SOLL root: ${candidate}`);
}

function isValidSegment(segment: string): boolean {
  if (segment.length === 0) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\") || segment.includes(sep)) return false;
  if (FIXED_NAMES.has(segment)) return true;
  // JSON files for external nodes: <id>.json
  if (segment.endsWith(".json")) {
    const stem = segment.slice(0, -".json".length);
    return NODE_ID_PATTERN.test(stem);
  }
  return NODE_ID_PATTERN.test(segment);
}
```

**Step 4: Run to see it pass**

Run: `pnpm test tests/storage/paths.test.ts`
Expected: PASS, 7 tests.

**Step 5: Commit**

```bash
git add src/storage/paths.ts tests/storage/paths.test.ts
git commit -m "Add path-safety helper for SOLL storage (TDD)"
```

---

## Task 4: `loadSoll` — happy path (TDD)

Read `.specifyr/soll/` under a root and assemble a validated `Model`.

**Files:**
- Create: `src/storage/soll.ts`
- Create: `tests/storage/soll.load.test.ts`

**Step 1: Failing test**

Create `tests/storage/soll.load.test.ts`:
```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSoll } from "../../src/storage/soll.ts";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("loadSoll (happy path)", () => {
  let repoRoot: string;
  let sollRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-load-"));
    sollRoot = join(repoRoot, ".specifyr", "soll");
    mkdirSync(join(sollRoot, "components"), { recursive: true });
    mkdirSync(join(sollRoot, "external"), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns an empty model when only _meta.json and _index.json exist", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), { edges: [] });

    const model = await loadSoll(repoRoot);
    expect(model.meta.source).toBe("soll");
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it("assembles nodes from components/<id>/component.json and external/<id>.json", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), {
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });

    const authDir = join(sollRoot, "components", "auth");
    mkdirSync(authDir);
    writeJson(join(authDir, "component.json"), {
      id: "auth",
      type: "component",
      name: "Auth",
    });

    writeJson(join(sollRoot, "external", "postgres.json"), {
      id: "postgres",
      type: "data-store",
      name: "Postgres",
    });

    const model = await loadSoll(repoRoot);
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["auth", "postgres"]);
    expect(model.edges).toEqual([
      { id: "e1", from: "auth", to: "postgres", type: "reads-from" },
    ]);
  });

  it("returns nodes and edges in a deterministic order", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), { edges: [] });

    for (const id of ["zeta", "alpha", "middle"]) {
      const dir = join(sollRoot, "components", id);
      mkdirSync(dir);
      writeJson(join(dir, "component.json"), { id, type: "component", name: id });
    }

    const model = await loadSoll(repoRoot);
    expect(model.nodes.map((n) => n.id)).toEqual(["alpha", "middle", "zeta"]);
  });
});
```

**Step 2: Run to see it fail**

Run: `pnpm test tests/storage/soll.load.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement**

Create `src/storage/soll.ts`:
```typescript
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { EdgeSchema, ModelMetaSchema, ModelSchema, NodeSchema } from "../core/schemas.ts";
import type { Edge, Model, Node } from "../core/schemas.ts";
import { resolveInsideRoot, sollRoot as computeSollRoot } from "./paths.ts";

async function readJson(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`SOLL storage: failed to parse ${path}: ${(cause as Error).message}`);
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (cause) {
    const err = cause as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw cause;
  }
}

export async function loadSoll(repoRoot: string): Promise<Model> {
  const root = computeSollRoot(repoRoot);

  const metaPath = resolveInsideRoot(root, ["_meta.json"]);
  const indexPath = resolveInsideRoot(root, ["_index.json"]);

  const meta = ModelMetaSchema.parse(await readJson(metaPath));
  const indexRaw = (await readJson(indexPath)) as { edges?: unknown };
  const edges: Edge[] = Array.isArray(indexRaw.edges)
    ? indexRaw.edges.map((entry) => EdgeSchema.parse(entry))
    : [];

  const nodes: Node[] = [];

  const componentDirs = (await listDir(resolveInsideRoot(root, ["components"]))).sort();
  for (const id of componentDirs) {
    const componentPath = resolveInsideRoot(root, ["components", id, "component.json"]);
    nodes.push(NodeSchema.parse(await readJson(componentPath)));
  }

  const externalFiles = (await listDir(resolveInsideRoot(root, ["external"])))
    .filter((name) => name.endsWith(".json"))
    .sort();
  for (const file of externalFiles) {
    const externalPath = resolveInsideRoot(root, ["external", file]);
    nodes.push(NodeSchema.parse(await readJson(externalPath)));
  }

  return ModelSchema.parse({ meta, nodes, edges });
}
```

**Step 4: Run to see it pass**

Run: `pnpm test tests/storage/soll.load.test.ts`
Expected: PASS, 3 tests.

**Step 5: Commit**

```bash
git add src/storage/soll.ts tests/storage/soll.load.test.ts
git commit -m "Add loadSoll happy-path (TDD)"
```

---

## Task 5: `loadSoll` — error paths (TDD)

**Files:**
- Modify: `tests/storage/soll.load.test.ts`
- Modify: `src/storage/soll.ts` (only if a test fails)

**Step 1: Add failing tests**

Append to `tests/storage/soll.load.test.ts`:
```typescript
describe("loadSoll (error paths)", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-load-err-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("throws a clear error when .specifyr/soll/_meta.json is missing", async () => {
    await expect(loadSoll(repoRoot)).rejects.toThrow(/_meta\.json/);
  });

  it("throws a clear error when _meta.json is malformed JSON", async () => {
    const soll = join(repoRoot, ".specifyr", "soll");
    mkdirSync(soll, { recursive: true });
    writeFileSync(join(soll, "_meta.json"), "{ not json");
    writeFileSync(join(soll, "_index.json"), "{ \"edges\": [] }");

    await expect(loadSoll(repoRoot)).rejects.toThrow(/failed to parse/i);
  });

  it("propagates a Zod error when a component.json fails schema validation", async () => {
    const soll = join(repoRoot, ".specifyr", "soll");
    mkdirSync(join(soll, "components", "auth"), { recursive: true });
    writeJson(join(soll, "_meta.json"), { source: "soll" });
    writeJson(join(soll, "_index.json"), { edges: [] });
    writeJson(join(soll, "components", "auth", "component.json"), {
      id: "auth",
      // missing required "type" and "name"
    });

    await expect(loadSoll(repoRoot)).rejects.toThrow();
  });
});
```

**Step 2: Run to see them fail**

Run: `pnpm test tests/storage/soll.load.test.ts`
Expected: the first case likely fails only on message shape; the malformed-JSON case should already pass because Task 4 catches JSON parse errors. Adjust `loadSoll` if needed to include the file name in the missing-file error. Do NOT expand behavior beyond what tests require.

**Step 3: Adjust `loadSoll` if the missing-file message is not friendly**

If the raw ENOENT error does not name `_meta.json`, wrap the `readJson` call for `_meta.json` (and `_index.json`) with a try/catch that rethrows with the filename. Otherwise leave the code alone.

**Step 4: Run to see all pass**

Run: `pnpm test tests/storage/soll.load.test.ts`
Expected: PASS, 6 tests total in this file.

**Step 5: Commit**

```bash
git add tests/storage/soll.load.test.ts src/storage/soll.ts
git commit -m "Cover loadSoll error paths (TDD)"
```

---

## Task 6: `saveSoll` — happy path (TDD)

**Files:**
- Modify: `src/storage/soll.ts`
- Create: `tests/storage/soll.save.test.ts`

**Step 1: Failing test**

Create `tests/storage/soll.save.test.ts`:
```typescript
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveSoll } from "../../src/storage/soll.ts";

describe("saveSoll (happy path)", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-save-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("creates the SOLL tree from scratch and writes _meta.json and _index.json", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll", generatedAt: "2026-09-06T12:00:00Z" },
      nodes: [],
      edges: [],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "_meta.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(soll, "_meta.json"), "utf8"))).toEqual({
      source: "soll",
      generatedAt: "2026-09-06T12:00:00Z",
    });
    expect(JSON.parse(readFileSync(join(soll, "_index.json"), "utf8"))).toEqual({
      edges: [],
    });
  });

  it("writes each component as components/<id>/component.json and each external as external/<id>.json", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [
        { id: "auth", type: "component", name: "Auth" },
        { id: "postgres", type: "data-store", name: "Postgres" },
      ],
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "components", "auth", "component.json"))).toBe(true);
    expect(existsSync(join(soll, "external", "postgres.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(soll, "_index.json"), "utf8"))).toEqual({
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });
  });

  it("rejects a node whose type is not supported by the storage layer", async () => {
    await expect(
      saveSoll(repoRoot, {
        meta: { source: "soll" },
        nodes: [{ id: "auth", type: "person", name: "Auth" }],
        edges: [],
      }),
    ).rejects.toThrow(/unsupported node type/);
  });
});
```

**Step 2: Run to see it fail**

Run: `pnpm test tests/storage/soll.save.test.ts`
Expected: FAIL — `saveSoll` not exported.

**Step 3: Implement `saveSoll`**

Append to `src/storage/soll.ts`:
```typescript
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";

import { bucketForNode } from "./bucket.ts";

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
}

export async function saveSoll(repoRoot: string, model: Model): Promise<void> {
  const parsed = ModelSchema.parse(model);
  const root = computeSollRoot(repoRoot);
  await mkdir(root, { recursive: true });

  await writeJsonAtomic(resolveInsideRoot(root, ["_meta.json"]), parsed.meta);
  await writeJsonAtomic(resolveInsideRoot(root, ["_index.json"]), { edges: parsed.edges });

  for (const node of parsed.nodes) {
    const { bucket, layout } = bucketForNode(node);
    const path =
      layout === "folder"
        ? resolveInsideRoot(root, [bucket, node.id, "component.json"])
        : resolveInsideRoot(root, [bucket, `${node.id}.json`]);
    await writeJsonAtomic(path, node);
  }
}
```

Note: the `import` line for `mkdir` etc. sits at the top of the file next to the existing imports. Merge, don't append.

**Step 4: Run to see it pass**

Run: `pnpm test tests/storage/soll.save.test.ts`
Expected: PASS, 3 tests.

**Step 5: Commit**

```bash
git add src/storage/soll.ts tests/storage/soll.save.test.ts
git commit -m "Add saveSoll happy path with atomic per-file writes (TDD)"
```

---

## Task 7: `saveSoll` — cleanup of stale nodes (TDD)

Re-saving a model with fewer nodes than currently on disk must delete the stale ones. Otherwise disk state diverges from model state.

**Files:**
- Modify: `tests/storage/soll.save.test.ts`
- Modify: `src/storage/soll.ts`

**Step 1: Failing tests**

Append to `tests/storage/soll.save.test.ts`:
```typescript
describe("saveSoll (cleanup)", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-cleanup-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("removes a component folder that is no longer in the model", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [
        { id: "auth", type: "component", name: "Auth" },
        { id: "users", type: "component", name: "Users" },
      ],
      edges: [],
    });

    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth" }],
      edges: [],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "components", "users"))).toBe(false);
    expect(existsSync(join(soll, "components", "auth", "component.json"))).toBe(true);
  });

  it("removes an external file that is no longer in the model", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [
        { id: "stripe", type: "external-service", name: "Stripe" },
        { id: "postgres", type: "data-store", name: "Postgres" },
      ],
      edges: [],
    });

    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "postgres", type: "data-store", name: "Postgres" }],
      edges: [],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "external", "stripe.json"))).toBe(false);
    expect(existsSync(join(soll, "external", "postgres.json"))).toBe(true);
  });
});
```

**Step 2: Run to see them fail**

Run: `pnpm test tests/storage/soll.save.test.ts`
Expected: two new FAIL cases.

**Step 3: Add cleanup to `saveSoll`**

Extend `saveSoll` after the write loop:
```typescript
  const keptComponents = new Set<string>();
  const keptExternal = new Set<string>();
  for (const node of parsed.nodes) {
    const { bucket, layout } = bucketForNode(node);
    if (bucket === "components" && layout === "folder") {
      keptComponents.add(node.id);
    } else if (bucket === "external" && layout === "file") {
      keptExternal.add(`${node.id}.json`);
    }
  }

  await pruneDirectory(
    resolveInsideRoot(root, ["components"]),
    (name) => keptComponents.has(name),
    { rmDir: true },
  );
  await pruneDirectory(
    resolveInsideRoot(root, ["external"]),
    (name) => keptExternal.has(name),
    { rmDir: false },
  );
```

Add the helper near the file bottom:
```typescript
import { rm } from "node:fs/promises";

async function pruneDirectory(
  path: string,
  keep: (name: string) => boolean,
  options: { rmDir: boolean },
): Promise<void> {
  const entries = await listDir(path);
  for (const entry of entries) {
    if (keep(entry)) continue;
    const target = resolveInsideRoot(path, [entry]);
    await rm(target, { recursive: options.rmDir, force: true });
  }
}
```

The `import { rm } ...` line merges with existing `node:fs/promises` import at the top — do not leave two import lines from the same module.

**Step 4: Run to see all pass**

Run: `pnpm test tests/storage/soll.save.test.ts`
Expected: PASS, 5 tests total in this file.

**Step 5: Commit**

```bash
git add src/storage/soll.ts tests/storage/soll.save.test.ts
git commit -m "Prune stale nodes on saveSoll (TDD)"
```

---

## Task 8: Round-trip test

Directly exercises the load/save contract: what you save is what you load.

**Files:**
- Create: `tests/storage/soll.roundtrip.test.ts`

**Step 1: Test**

Create `tests/storage/soll.roundtrip.test.ts`:
```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Model } from "../../src/core/schemas.ts";
import { loadSoll, saveSoll } from "../../src/storage/soll.ts";

describe("SOLL storage round-trip", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-rt-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("save-then-load returns an equivalent model", async () => {
    const source: Model = {
      meta: { source: "soll", generatedAt: "2026-09-06T12:00:00Z" },
      nodes: [
        { id: "auth", type: "component", name: "Auth", classes: [] },
        { id: "core", type: "module", name: "Core Module", classes: [] },
        { id: "postgres", type: "data-store", name: "Postgres", classes: [] },
        { id: "stripe", type: "external-service", name: "Stripe", classes: [] },
      ],
      edges: [
        { id: "e1", from: "auth", to: "postgres", type: "reads-from" },
        { id: "e2", from: "core", to: "stripe", type: "depends-on" },
      ],
    };

    await saveSoll(repoRoot, source);
    const loaded = await loadSoll(repoRoot);

    expect(loaded.meta).toEqual(source.meta);
    expect(loaded.nodes.map((n) => n.id).sort()).toEqual(
      source.nodes.map((n) => n.id).sort(),
    );
    expect(loaded.edges).toEqual(source.edges);
  });

  it("round-trips a model that only has a meta (no nodes, no edges)", async () => {
    await saveSoll(repoRoot, { meta: { source: "soll" }, nodes: [], edges: [] });
    const loaded = await loadSoll(repoRoot);
    expect(loaded.meta).toEqual({ source: "soll" });
    expect(loaded.nodes).toEqual([]);
    expect(loaded.edges).toEqual([]);
  });
});
```

**Step 2: Run to see it pass immediately**

Run: `pnpm test tests/storage/soll.roundtrip.test.ts`
Expected: PASS, 2 tests. (No implementation change should be needed — this test purely verifies the existing pair works together.)

If it does not pass, do NOT change the code. Report the failure — it means Task 4-7 has a latent bug that the isolated tests missed.

**Step 3: Commit**

```bash
git add tests/storage/soll.roundtrip.test.ts
git commit -m "Add SOLL storage round-trip test (TDD)"
```

---

## Task 9: `src/storage/index.ts` re-exports

**Files:**
- Create: `src/storage/index.ts`

**Step 1: Write**

Content:
```typescript
export { bucketForNode, SUPPORTED_NODE_TYPES } from "./bucket.ts";
export type { SollBucket, SollLayout, SupportedNodeType } from "./bucket.ts";

export { resolveInsideRoot, sollRoot } from "./paths.ts";

export { loadSoll, saveSoll } from "./soll.ts";
```

**Step 2: Verify gates**

Run in sequence:
```bash
pnpm typecheck
pnpm lint
pnpm test
```
All must exit 0.

**Step 3: Commit**

```bash
git add src/storage/index.ts
git commit -m "Re-export storage API from src/storage/index.ts"
```

---

## Task 10: Publish the subpath `specifyr/storage`

**Files:**
- Modify: `package.json`

**Step 1: Add a subpath export**

Extend the `exports` block in `package.json`:
```json
  "exports": {
    ".": {
      "types": "./dist/core/index.d.ts",
      "import": "./dist/core/index.js"
    },
    "./storage": {
      "types": "./dist/storage/index.d.ts",
      "import": "./dist/storage/index.js"
    }
  },
```

Nothing else changes. `tsconfig.build.json` already emits everything under `src/` to `dist/`, so the storage module will be in the tarball automatically. Verify by running:
```bash
pnpm build
ls dist/storage
```
Expected: `bucket.js`, `bucket.d.ts`, `paths.js`, `paths.d.ts`, `soll.js`, `soll.d.ts`, `index.js`, `index.d.ts`.

**Step 2: Confirm the full gate**

Run:
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All must exit 0. (No `pnpm-lock.yaml` change is expected — we did not add dependencies.)

**Step 3: Commit**

```bash
git add package.json
git commit -m "Publish specifyr/storage subpath in package exports"
```

---

## Task 11: README status bump

**Files:**
- Modify: `README.md`

**Step 1: Update the Status section**

Change the two Status lines to:
```markdown
Slice 1: repo skeleton, core Zod model, tests, CI. ✅
Slice 2 (current): SOLL storage layer — load/save `.specifyr/soll/` under a repo root. ✅
Slice 3+ (planned): rules evaluator, CLI, Nitro editor, MCP endpoint.
```

Leave the rest of the README untouched.

**Step 2: Commit**

```bash
git add README.md
git commit -m "Update README status: Slice 2 complete"
```

---

## Task 12: Final green-checkpoint and PR

**Step 1: Verify every gate**

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
Every step: exit code 0. `pnpm test` should report a total of roughly 27 (Slice 1) + 6 (bucket) + 7 (paths) + 6 (load) + 5 (save) + 2 (round-trip) = 53 tests.

**Step 2: Push the branch**

```bash
git push -u origin ts/slice-2-soll-storage
```

**Step 3: Open the PR**

```bash
gh pr create --base main --head ts/slice-2-soll-storage \
  --title "TS rewrite Slice 2: SOLL storage layer" \
  --body-file - <<'EOF'
## Summary

Slice 2 of the TypeScript rewrite tracked in
[docs/plans/2026-09-06-specifyr-ts-slice-2-soll-storage.md](docs/plans/2026-09-06-specifyr-ts-slice-2-soll-storage.md).

Adds a new `src/storage/` module that persists and hydrates the `Model`
from Slice 1 as a git-friendly file tree under `.specifyr/soll/`.

- `loadSoll(repoRoot)` reads the tree, validates every file through the
  Slice 1 Zod schemas, and returns a validated `Model`.
- `saveSoll(repoRoot, model)` writes each file atomically (tmp + rename),
  creates missing directories, and **prunes** components/external nodes
  that are no longer in the model.
- Path safety: every filesystem path derives from `resolveInsideRoot`,
  which re-validates each id segment against `NODE_ID_PATTERN` and
  refuses any resolved path that escapes the SOLL root.
- New subpath export `specifyr/storage` in `package.json`.

**Non-goals for this slice:** `_views.json`, `_layout.json`, `notes.md`,
`classes.json` split-per-class, vocabulary-driven type→bucket mapping,
PLAN/IST extractors, CLI commands, watchers.

## Test plan

- [x] `pnpm install --frozen-lockfile` clean
- [x] `pnpm build` clean (dist/ includes storage output)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` clean
- [x] Storage suite runs against a per-test `mkdtempSync` — no shared state
- [x] Round-trip test proves save+load parity
- [x] Cleanup test proves stale files are pruned on re-save
- [x] Path-traversal tests cover `..`, absolute prefixes, and slash-in-segment
EOF
```
Expected: PR URL printed.

**Step 4: Wait, do not merge**

Per user memory, wait for CodeRabbit to review before merging. Address every valid finding.

---

## Notes for the executing agent

- **DRY:** every filesystem operation goes through `resolveInsideRoot`. Do not build paths with raw `join` in `soll.ts`.
- **YAGNI:** no `SollLoadError` / `SollSaveError` class hierarchy — thrown `Error`s with clear messages are enough for Slice 2. Add the hierarchy the first time a caller needs to distinguish.
- **YAGNI:** do not implement `initSoll(root)`, watchers, or any diff API — deferred.
- **TDD:** each task's tests fail first, then pass. Task 8 is the only exception (it is a pure integration test that should pass immediately; if it does not, stop).
- **Commit hygiene:** one commit per task with the exact message shown.
- **Main is protected:** all work on `ts/slice-2-soll-storage`, land via PR.
- **CR before merge.**
- **Do not touch Slice 1 code** except for the tiny `package.json` exports extension in Task 10.
