# specifyr TS Rewrite — Slice B: TypeScript `imports` edges

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract ES `import ... from "..."` statements from every parsed TypeScript file, resolve relative specifiers against the walked file set, and emit module→module `imports` edges so the Vue Flow IST view actually shows connections instead of a grid of orphan tiles.

**Architecture:** `extractSource` from Slice A stays responsible for nodes only. A new sibling `extractImports` reads the same tree and returns a per-file list of raw specifier records (`{ fromRelative, specifier }`). A new pure `resolveImport(fromRelative, specifier, allFilesSet)` turns a relative specifier into a concrete `.ts`/`.tsx` file path (or `undefined` for external / unresolvable). The orchestrator makes two passes: (1) walk + parse + collect nodes + collect raw imports per file; (2) resolve raw imports to concrete target modules, drop external and unresolvable ones, dedupe, emit `Edge` objects. Edge ids are `tse-<12hex sha1 of "<from>::<to>::imports">` — deterministic, matches Slice 1's `EdgeSchema` id constraints.

**Tech Stack:** No new dependencies. Reuses `web-tree-sitter@0.27.0` + `tree-sitter-typescript@0.23.2` (Slice A). Node `node:path`, `node:crypto`. Slice 1's `EdgeSchema` at `src/core/schemas.ts`.

**Reference:**
- Design doc §7.1 (Common schema — `Edge`), §7.6 (IST) at [docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md)
- Slice A plan: [docs/plans/2026-09-07-specifyr-ts-slice-a-typescript-ist.md](2026-09-07-specifyr-ts-slice-a-typescript-ist.md)
- Slice 4 typescript pack: declares `imports` as an edge type — matches what this slice emits.
- `EdgeSchema` (Slice 1, on main): `{ id: string, from: NODE_ID_PATTERN, to: NODE_ID_PATTERN, type: non-empty string }`. `from` and `to` must both match `^[a-z0-9][a-z0-9_-]{0,63}$` — module node ids from Slice A (`ts-<12hex>`) do.
- `ModelSchema.check` (Slice 1): edges must reference known node ids in the same Model. Our resolver must only emit edges where both ends are extracted module nodes.

**Branch:** `ts/slice-b-typescript-import-edges` off current `main` (`39070b0` at time of writing). Main protected. Land via PR. Wait for CodeRabbit before merging (memory: `CR before merge`).

**Non-goals for Slice B:**
- `extends`, `implements`, `calls`, `reads-from`, `writes-to`, `passes-through` edges (Slice C)
- Per-symbol edges (module → symbol) — Slice B emits only module → module
- External synthetic nodes (`vue`, `node:fs`, `@vue-flow/core`) — external imports are dropped, not linked to fake nodes
- `tsconfig.json` `paths` alias resolution (e.g., `@/foo` → `src/foo`)
- Package-relative imports resolved through `node_modules` — everything non-relative is external, period
- Dynamic imports (`import("./foo")`), `require(...)` — Slice B parses only static `import_statement` nodes
- `import type` treated differently from value imports — both count
- Re-exports (`export * from "./bar"`, `export { X } from "./bar"`) — deferred, they don't parse as `import_statement`

**Edge id contract:**

`Edge.id` must satisfy Slice 1's schema (`z.string().min(1)`, but by convention we use ids that also match `NODE_ID_PATTERN` shape so they're safe to embed in URLs / filenames later). Slice B uses:

`tse-<12hex sha1 of "<fromNodeId>::<toNodeId>::imports">`

- `tse` prefix distinguishes edges from nodes (`ts-`)
- 12 hex chars = 48 bits — same collision envelope Slice A settled on for nodes
- Total length: `tse-` (4) + 12 = 16 chars — well within any conceivable limit
- Deterministic across runs — same (from, to) pair always yields the same id

---

## Task 1: Create the working branch

**Files:** git ref `HEAD`.

**Step 1: Confirm clean main**
```bash
git status && git branch --show-current && git log --oneline -1
```
Expected: clean, on `main`, tip is `39070b0` or later.

**Step 2: Create branch**
```bash
git switch -c ts/slice-b-typescript-import-edges
```

**Step 3: Commit plan**
```bash
git add docs/plans/2026-09-07-specifyr-ts-slice-b-typescript-import-edges.md
git commit -m "Add Slice B plan: TypeScript imports edges"
```

---

## Task 2: `edge-id.ts` — deterministic edge-id helper (TDD)

Mirror Slice A's `istNodeId` but for edges. Kept as a separate helper file so the `tse-` prefix and hash-slice are one-liners, not scattered.

**Files:**
- Create: `src/extractors/typescript/edge-id.ts`
- Create: `tests/extractors/typescript/edge-id.test.ts`

**Step 1: Failing test**

Create `tests/extractors/typescript/edge-id.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { istEdgeId } from "../../../src/extractors/typescript/edge-id.js";

describe("istEdgeId", () => {
  it("returns a stable id for the same (from, to, type)", () => {
    const a = istEdgeId("ts-abc123abc123", "ts-def456def456", "imports");
    const b = istEdgeId("ts-abc123abc123", "ts-def456def456", "imports");
    expect(a).toBe(b);
  });

  it("differs when the source node changes", () => {
    const a = istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports");
    const b = istEdgeId("ts-cccccccccccc", "ts-bbbbbbbbbbbb", "imports");
    expect(a).not.toBe(b);
  });

  it("differs when the target node changes", () => {
    const a = istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports");
    const b = istEdgeId("ts-aaaaaaaaaaaa", "ts-cccccccccccc", "imports");
    expect(a).not.toBe(b);
  });

  it("differs when the edge type changes", () => {
    const a = istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports");
    const b = istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "extends");
    expect(a).not.toBe(b);
  });

  it("starts with the tse- prefix", () => {
    expect(istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports")).toMatch(/^tse-/);
  });

  it("total length is 16 chars", () => {
    expect(istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports")).toHaveLength(16);
  });
});
```

**Step 2: Run to FAIL** — module not found.

**Step 3: Implement**

Create `src/extractors/typescript/edge-id.ts`:
```typescript
import { createHash } from "node:crypto";

export function istEdgeId(fromNodeId: string, toNodeId: string, type: string): string {
  const hash = createHash("sha1")
    .update(`${fromNodeId}::${toNodeId}::${type}`)
    .digest("hex")
    .slice(0, 12);
  return `tse-${hash}`;
}
```

**Step 4: Run PASS** — 6 tests.

**Step 5: Commit**
```
Add deterministic IST edge-id helper (TDD)
```

---

## Task 3: `resolve-import.ts` — relative-specifier resolver (TDD)

Pure function. Given the importing file's relative path, the specifier string, and the set of all walked TS files, return the target file path if it exists in the set, or `undefined` for external / unresolvable.

**Files:**
- Create: `src/extractors/typescript/resolve-import.ts`
- Create: `tests/extractors/typescript/resolve-import.test.ts`

**Step 1: Failing tests**

Create `tests/extractors/typescript/resolve-import.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { resolveImport } from "../../../src/extractors/typescript/resolve-import.js";

describe("resolveImport", () => {
  const files = new Set([
    "src/core/schemas.ts",
    "src/core/index.ts",
    "src/storage/soll.ts",
    "src/storage/index.ts",
    "src/storage/paths.ts",
    "frontend/pages/index.tsx",
    "src/cli/commands/init.ts",
  ]);

  it("resolves a sibling .ts file", () => {
    expect(resolveImport("src/storage/soll.ts", "./paths", files)).toBe("src/storage/paths.ts");
  });

  it("resolves a sibling with an explicit .js extension (Node ESM convention)", () => {
    // Our codebase uses .js in imports even for .ts files — must strip the .js
    // before searching the file set.
    expect(resolveImport("src/storage/soll.ts", "./paths.js", files)).toBe("src/storage/paths.ts");
  });

  it("resolves parent-relative specifiers", () => {
    expect(resolveImport("src/storage/soll.ts", "../core/schemas", files)).toBe(
      "src/core/schemas.ts",
    );
  });

  it("resolves a directory index.ts", () => {
    expect(resolveImport("src/storage/soll.ts", "../core", files)).toBe("src/core/index.ts");
  });

  it("resolves a .tsx target", () => {
    expect(resolveImport("src/storage/soll.ts", "../../frontend/pages", files)).toBe(
      "frontend/pages/index.tsx",
    );
  });

  it("returns undefined for a specifier that resolves to a file outside the set", () => {
    expect(resolveImport("src/storage/soll.ts", "./missing", files)).toBeUndefined();
  });

  it("returns undefined for an external / package specifier", () => {
    expect(resolveImport("src/storage/soll.ts", "zod", files)).toBeUndefined();
    expect(resolveImport("src/storage/soll.ts", "@vue-flow/core", files)).toBeUndefined();
    expect(resolveImport("src/storage/soll.ts", "node:fs/promises", files)).toBeUndefined();
  });

  it("returns undefined for an absolute specifier", () => {
    expect(resolveImport("src/storage/soll.ts", "/absolute/path", files)).toBeUndefined();
  });

  it("returns undefined for a specifier that resolves to the same file (self-import loop)", () => {
    expect(resolveImport("src/storage/soll.ts", "./soll", files)).toBeUndefined();
    expect(resolveImport("src/storage/soll.ts", ".", files)).toBeUndefined();
  });
});
```

**Step 2: Run to FAIL** — module not found.

**Step 3: Implement**

Create `src/extractors/typescript/resolve-import.ts`:
```typescript
import { dirname, join, normalize } from "node:path";

// Suffixes tried in order for a bare specifier. Matches Node ESM + TS module
// resolution as we use it in this codebase: source is authored as .ts / .tsx,
// but imports are written with .js (dist emit contract). Both forms resolve
// to the .ts / .tsx source file in the walked set.
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

export function resolveImport(
  fromRelative: string,
  specifier: string,
  allFiles: ReadonlySet<string>,
): string | undefined {
  if (!isRelative(specifier)) return undefined;

  // Strip trailing .js (our imports write .js; the file set holds .ts / .tsx).
  const withoutJs = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;

  const fromDir = dirname(fromRelative);
  const base = normalize(join(fromDir, withoutJs));

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (candidate === fromRelative) continue; // ignore self-import
    if (allFiles.has(candidate)) return candidate;
  }

  return undefined;
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier === ".";
}
```

**Step 4: Run PASS** — 9 tests.

**Step 5: Commit**
```
Add relative-import resolver against the walked file set (TDD)
```

---

## Task 4: `extract-imports.ts` — per-source raw-specifier extractor (TDD)

Walk the parsed tree's top-level for `import_statement` nodes, extract the specifier string (the `"..."` after `from`). Return `RawImport[]`. Does NOT resolve — that's Task 5's job.

**Files:**
- Create: `src/extractors/typescript/extract-imports.ts`
- Create: `tests/extractors/typescript/extract-imports.test.ts`

**Step 1: Failing tests**

Create `tests/extractors/typescript/extract-imports.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { extractImports } from "../../../src/extractors/typescript/extract-imports.js";

describe("extractImports", () => {
  it("returns an empty list for a file with no imports", async () => {
    const raw = await extractImports("src/x.ts", "export const y = 1;");
    expect(raw).toEqual([]);
  });

  it("extracts a single named import", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      'import { Bar } from "./bar";\n',
    );
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./bar" }]);
  });

  it("extracts a default import", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      'import Bar from "./bar";\n',
    );
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./bar" }]);
  });

  it("extracts a namespace import", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      'import * as Bar from "./bar";\n',
    );
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./bar" }]);
  });

  it("extracts a side-effect-only import", async () => {
    const raw = await extractImports("src/foo.ts", 'import "./bar";\n');
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./bar" }]);
  });

  it("extracts multiple imports in file order (no dedup at this layer)", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      [
        'import { A } from "./a";',
        'import { B } from "./b";',
        'import { AA } from "./a";', // duplicate specifier
        "",
      ].join("\n"),
    );
    expect(raw.map((r) => r.specifier)).toEqual(["./a", "./b", "./a"]);
  });

  it("extracts imports even when preceded by comments", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      '// header comment\nimport { X } from "./x";\n',
    );
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./x" }]);
  });

  it("does NOT extract require() calls (Slice B is static imports only)", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      'const bar = require("./bar");\n',
    );
    expect(raw).toEqual([]);
  });

  it("does NOT extract dynamic imports (Slice B is static imports only)", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      "const bar = () => import(\"./bar\");\n",
    );
    expect(raw).toEqual([]);
  });

  it("extracts external and node: specifiers too (resolver drops them later)", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      [
        'import { readFile } from "node:fs/promises";',
        'import { z } from "zod";',
        "",
      ].join("\n"),
    );
    expect(raw.map((r) => r.specifier).sort()).toEqual(["node:fs/promises", "zod"]);
  });
});
```

**Step 2: Run to FAIL** — module not found.

**Step 3: Implement**

Create `src/extractors/typescript/extract-imports.ts`:
```typescript
import { parseTypeScript } from "./parser.js";

export interface RawImport {
  fromRelative: string;
  specifier: string;
}

export async function extractImports(
  fromRelative: string,
  source: string,
): Promise<RawImport[]> {
  const tree = await parseTypeScript(source);
  const results: RawImport[] = [];

  // Top-level import_statement nodes only. Ignore anything nested (dynamic
  // imports inside function bodies parse as call_expression, not
  // import_statement).
  for (const child of tree.rootNode.namedChildren) {
    if (child.type !== "import_statement") continue;
    const specifier = readImportSpecifier(child);
    if (specifier === undefined) continue;
    results.push({ fromRelative, specifier });
  }

  return results;
}

// The specifier lives in a `string` child of `import_statement`. tree-sitter
// wraps it in a `string_fragment` (the actual text without the surrounding
// quotes). Walk the AST for that fragment and return its text.
function readImportSpecifier(node: {
  namedChildren: Array<{
    type: string;
    text: string;
    namedChildren: Array<{ type: string; text: string }>;
  }>;
}): string | undefined {
  for (const child of node.namedChildren) {
    if (child.type !== "string") continue;
    for (const grandchild of child.namedChildren) {
      if (grandchild.type === "string_fragment") return grandchild.text;
    }
  }
  return undefined;
}
```

Notes:
- `readImportSpecifier` uses the same permissive structural typing pattern as Slice A's `unwrapExport`. If `web-tree-sitter@0.27.0`'s named type is available, prefer it (`import type { Node as TsNode } from "web-tree-sitter"`) — noted in commit body.
- The `namedChildren` walk avoids picking up `import type` vs value import distinction — both produce the same `string_fragment`, both are extracted (per plan).

**Step 4: Run PASS** — 10 tests.

**Step 5: Commit**
```
Extract raw import specifiers from TypeScript sources (TDD)
```

---

## Task 5: Extend `extractIst` to emit `imports` edges (TDD)

Two-pass orchestrator: (1) walk + parse per file, collect nodes AND raw imports; (2) resolve each raw import to a concrete target file, look up the module node ids at both ends in a `(relativePath → moduleNodeId)` map, emit `Edge` objects, dedupe by `from+to+type`.

**Files:**
- Modify: `src/extractors/typescript/extract.ts`
- Modify: `tests/extractors/typescript/extract.test.ts`

**Step 1: Failing tests**

Append to `tests/extractors/typescript/extract.test.ts`:
```typescript
describe("extractIst — imports edges", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-ist-edges-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("emits a module→module imports edge for a resolvable relative import", async () => {
    writeFileSync(join(repoPath, "a.ts"), 'import { B } from "./b";\nexport const A = 1;\n');
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\n");

    const model = await extractIst(repoPath);
    const modules = new Map(
      model.nodes.filter((n) => n.type === "module").map((n) => [n.name, n.id]),
    );
    expect(model.edges).toHaveLength(1);
    const edge = model.edges[0];
    expect(edge?.type).toBe("imports");
    expect(edge?.from).toBe(modules.get("a.ts"));
    expect(edge?.to).toBe(modules.get("b.ts"));
    expect(edge?.id).toMatch(/^tse-[0-9a-f]{12}$/);
  });

  it("resolves .js import specifiers to the .ts source (dist-emit convention)", async () => {
    writeFileSync(join(repoPath, "a.ts"), 'import { B } from "./b.js";\n');
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\n");

    const model = await extractIst(repoPath);
    expect(model.edges).toHaveLength(1);
  });

  it("resolves a directory index import", async () => {
    mkdirSync(join(repoPath, "sub"), { recursive: true });
    writeFileSync(join(repoPath, "a.ts"), 'import { Sub } from "./sub";\n');
    writeFileSync(join(repoPath, "sub", "index.ts"), "export const Sub = 1;\n");

    const model = await extractIst(repoPath);
    expect(model.edges).toHaveLength(1);
  });

  it("drops external and node: imports", async () => {
    writeFileSync(
      join(repoPath, "a.ts"),
      [
        'import { z } from "zod";',
        'import { readFile } from "node:fs/promises";',
        'import { B } from "./b";',
        "",
      ].join("\n"),
    );
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\n");

    const model = await extractIst(repoPath);
    expect(model.edges).toHaveLength(1);
  });

  it("deduplicates identical from→to→type edges (multiple imports from the same module)", async () => {
    writeFileSync(
      join(repoPath, "a.ts"),
      ['import { B } from "./b";', 'import { C } from "./b";', ""].join("\n"),
    );
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\nexport const C = 3;\n");

    const model = await extractIst(repoPath);
    expect(model.edges).toHaveLength(1);
  });

  it("returns a Model that still passes ModelSchema.parse (edges reference known nodes)", async () => {
    const { ModelSchema } = await import("../../../src/core/schemas.js");
    writeFileSync(join(repoPath, "a.ts"), 'import { B } from "./b";\n');
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\n");
    const model = await extractIst(repoPath);
    ModelSchema.parse(model);
  });
});
```

**Step 2: Run to FAIL** — the new tests fail because `extract.ts` still returns `edges: []`.

**Step 3: Modify `src/extractors/typescript/extract.ts`**

Replace the current implementation with the two-pass version. Concrete shape:

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ModelSchema } from "../../core/schemas.js";
import type { Edge, Model, Node } from "../../core/schemas.js";
import { istEdgeId } from "./edge-id.js";
import { istNodeId } from "./node-id.js";
import { extractImports, type RawImport } from "./extract-imports.js";
import { extractSource } from "./extract-source.js";
import { resolveImport } from "./resolve-import.js";
import { walkTsFiles } from "./walk.js";

export async function extractIst(repoRoot: string): Promise<Model> {
  const files = await walkTsFiles(repoRoot);
  const fileSet: ReadonlySet<string> = new Set(files);
  const allNodes: Node[] = [];
  const rawImports: RawImport[] = [];

  // Pass 1: walk + parse each file, collect nodes and raw import specifiers.
  for (const relativePath of files) {
    const source = await readFile(join(repoRoot, relativePath), "utf8");
    let nodes: Node[];
    try {
      nodes = await extractSource({ relativePath, source });
    } catch (cause) {
      throw new Error(`extractSource failed for ${relativePath}`, { cause });
    }
    allNodes.push(...nodes);
    const imports = await extractImports(relativePath, source);
    rawImports.push(...imports);
  }

  // Pass 2: resolve each raw import to a target file, look up module node ids
  // at both ends, dedupe by (from, to, type), and emit Edge objects.
  const moduleIdByPath = new Map<string, string>();
  for (const relativePath of files) {
    moduleIdByPath.set(relativePath, istNodeId(relativePath, ""));
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const raw of rawImports) {
    const targetPath = resolveImport(raw.fromRelative, raw.specifier, fileSet);
    if (targetPath === undefined) continue; // external or unresolvable
    const fromId = moduleIdByPath.get(raw.fromRelative);
    const toId = moduleIdByPath.get(targetPath);
    if (!fromId || !toId) continue; // defensive, should be unreachable
    const key = `${fromId}::${toId}::imports`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: istEdgeId(fromId, toId, "imports"),
      from: fromId,
      to: toId,
      type: "imports",
    });
  }

  return ModelSchema.parse({
    meta: { source: "ist", generatedAt: new Date().toISOString() },
    nodes: allNodes,
    edges,
  });
}
```

**Step 4: Run PASS** — the 4 pre-existing `extractIst` tests plus the 6 new edge tests all pass.

Note: the pre-existing "returns an empty model when the repo has no .ts files" and similar tests continue to assert `model.edges` shape. The new implementation must not break those (empty repo → empty edges).

**Step 5: Commit**
```
Emit imports edges in extractIst (TDD)
```

---

## Task 6: `src/extractors/typescript/index.ts` re-exports

**Files:** Modify `src/extractors/typescript/index.ts`.

Add the new symbols alongside the existing ones:

```typescript
export { extractIst } from "./extract.js";
export { extractSource } from "./extract-source.js";
export { extractImports, type RawImport } from "./extract-imports.js";
export { istEdgeId } from "./edge-id.js";
export { istNodeId } from "./node-id.js";
export { parseTypeScript } from "./parser.js";
export { resolveImport } from "./resolve-import.js";
export { SKIP_DIRS, walkTsFiles } from "./walk.js";
```

**Verify:**
```bash
pnpm typecheck && pnpm lint && pnpm test
```
All exit 0.

**Commit:**
```
Re-export imports-edge helpers from src/extractors/typescript/index.ts
```

---

## Task 7: Tighten the E2E test — assert `/api/ist` returns edges

**Files:** Modify `tests/cli/editor-ist-integration.test.ts`.

**Step 1: Extend the assertions**

The existing test verifies `body.nodes.length > 10` and that `src/core/schemas.ts` appears. Slice B adds a check that we get imports edges too:

Change:
```typescript
    expect(body.meta.source).toBe("ist");
    expect(body.nodes.length).toBeGreaterThan(10);
    const names = body.nodes.map((n) => n.name);
    expect(names).toContain("src/core/schemas.ts");
```
To (append):
```typescript
    expect(body.meta.source).toBe("ist");
    expect(body.nodes.length).toBeGreaterThan(10);
    const names = body.nodes.map((n) => n.name);
    expect(names).toContain("src/core/schemas.ts");
    expect(body.edges.length).toBeGreaterThan(0);
    for (const edge of body.edges) {
      expect(edge.type).toBe("imports");
      expect(edge.id).toMatch(/^tse-[0-9a-f]{12}$/);
    }
```

The typing of `body` also needs to include `edges`:
```typescript
    const body = (await res.json()) as {
      meta: { source: string };
      nodes: Array<{ type: string; name: string }>;
      edges: Array<{ id: string; from: string; to: string; type: string }>;
    };
```

**Step 2: Rebuild and re-run**
```bash
pnpm build
pnpm test tests/cli/editor-ist-integration.test.ts
```
Expected: 1 test still passes, now with the stricter assertion — specifyr's own repo has many relative imports, so `edges.length > 0` is trivially true.

**Step 3: Commit**
```
Assert /api/ist returns imports edges in the E2E test
```

---

## Task 8: README + PR

**Files:** Modify `README.md`.

**Step 1: Update Status**

Change:
```markdown
Slice A (current): TypeScript IST extractor via tree-sitter WASM (nodes only) + TopBar SOLL/IST segmenter. ✅
Slice B+ (planned): IST edges (imports/extends/implements), Python + Java IST, SOLL↔IST drift matching, auto-layout, editing via MCP.
```
To:
```markdown
Slice A: TypeScript IST extractor via tree-sitter WASM (nodes only) + TopBar SOLL/IST segmenter. ✅
Slice B (current): IST `imports` edges — module→module dependencies drawn as arrows in the Vue Flow graph. ✅
Slice C+ (planned): extends/implements edges, Python + Java IST, SOLL↔IST drift matching, auto-layout, editing via MCP.
```

**Step 2: Update the IST usage note**

Replace:
```markdown
Click **IST** in the TopBar to see the TypeScript IST of the same repo: every `.ts` / `.tsx` file becomes
a `module` node, plus top-level `class` / `interface` / `type-alias` / `enum`
/ `function` nodes. Edges land in a later slice.
```
With:
```markdown
Click **IST** in the TopBar to see the TypeScript IST of the same repo: every `.ts` / `.tsx` file becomes
a `module` node, plus top-level `class` / `interface` / `type-alias` / `enum`
/ `function` nodes. `import ... from "./..."` statements are drawn as arrows
between modules. Extends/implements edges and per-symbol edges land in a
later slice.
```

**Step 3: Commit**
```
Update README with Slice B status and imports-edge note
```

**Step 4: Full gate**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0. Test count: baseline (149) + 6 (edge-id) + 9 (resolve-import) + 10 (extract-imports) + 6 (extractIst edges) = **180 tests**.

**Step 5: Push**
```bash
git push -u origin ts/slice-b-typescript-import-edges
```

**Step 6: Open PR**
```bash
gh pr create --base main --head ts/slice-b-typescript-import-edges \
  --title "TS rewrite Slice B: TypeScript imports edges" \
  --body-file - <<'EOF'
## Summary

Slice B of the TypeScript rewrite tracked in
[docs/plans/2026-09-07-specifyr-ts-slice-b-typescript-import-edges.md](docs/plans/2026-09-07-specifyr-ts-slice-b-typescript-import-edges.md).

Adds module→module `imports` edges to the TypeScript IST extractor so the Vue Flow graph shows actual dependencies instead of an orphan grid.

### What's in

- **`src/extractors/typescript/edge-id.ts`** — `istEdgeId(from, to, type)` — deterministic `tse-<12hex sha1>` edge id, mirrors Slice A's `istNodeId` convention.
- **`src/extractors/typescript/resolve-import.ts`** — pure function turning a relative specifier into a target file path against the walked file set. Handles `.js`-in-specifier (dist-emit convention), directory `/index.ts`/`/index.tsx`, and drops external / package / node: specifiers.
- **`src/extractors/typescript/extract-imports.ts`** — walks top-level `import_statement` nodes in the parsed tree, returns `RawImport[]` with the raw specifier string (no resolution yet).
- **`extractIst` (modified)** — now runs two passes: (1) collect nodes + raw imports per file; (2) resolve, dedupe by `(from, to, type)`, emit `Edge` objects. Edges reference actual module node ids and satisfy `ModelSchema`'s cross-collection integrity check.
- **E2E test** now asserts `/api/ist` returns non-empty edges.

### Non-goals for this slice
- `extends` / `implements` / `calls` / `reads-from` / `writes-to` / `passes-through` edges (Slice C)
- Per-symbol edges (module → symbol) — Slice B is module → module only
- External / package synthetic nodes (external imports are dropped, not linked to fake nodes)
- `tsconfig.json` `paths` alias resolution
- Dynamic imports (`import("./foo")`), `require(...)`
- Re-exports (`export * from "./bar"`)

## Test plan

- [x] `pnpm install --frozen-lockfile` clean
- [x] `pnpm build` clean
- [x] `pnpm lint`, `pnpm typecheck` clean (root + frontend)
- [x] `pnpm test` — 180 tests pass (baseline 149 + 31 new)
- [x] E2E test proves \`/api/ist\` returns edges when pointed at the specifyr repo

## Manual verification

    pnpm build
    node dist/cli/index.js editor . --no-open --port 3939
    # open http://127.0.0.1:3939, click IST — modules now have arrows between them.

## Notes for reviewer

- Edge ids use \`tse-\` prefix to distinguish from node ids (\`ts-\`); both are 12 hex chars = 48 bits.
- The \`.js\`-in-specifier handling is intentional: our own repo writes .js in imports (Slice 1 reviewer decision, dist-emit contract) even though sources are .ts. The resolver strips \`.js\` before probing the file set.
- Deduplication is by \`(from, to, "imports")\` triple, so \`import { A } from "./x"; import { B } from "./x";\` yields ONE edge, not two.
EOF
```

**Step 7: Wait for CodeRabbit before merging.**

---

## Notes for the executing agent

- **DRY:** `istEdgeId` mirrors `istNodeId`'s shape deliberately — do NOT extract a shared "hash-id" helper for two 4-line functions. Two callers, two files, still simpler than the abstraction.
- **YAGNI:** no external synthetic nodes, no tsconfig paths, no per-symbol imports, no dynamic imports. Every deferred item is called out in Non-goals — resist scope creep during review fixes.
- **Import discipline:** every local import uses `.js` extension. `web-tree-sitter` value/type imports split per Biome's `useImportType`.
- **TDD:** Tasks 2-5 are strict test-first. Task 6 is a re-exports edit (verify-only). Task 7 tightens an existing E2E test. Task 8 is README + PR.
- **Two-pass orchestrator:** the sequential per-file loop stays sequential in Slice B (matches Slice A pattern; parallelization deferred). Cross-slice consistency wins over premature optimization.
- **Main protected**, work on `ts/slice-b-typescript-import-edges`, land via PR, **CR before merge**.
- **Do not touch** Slice 1 schemas, Slice 2 storage, Slice 3 CLI, Slice 4 vocabulary packs, Slice X's editor CLI, or the frontend. All Slice B code is purely additive under `src/extractors/typescript/` plus the tightening of one E2E test.
