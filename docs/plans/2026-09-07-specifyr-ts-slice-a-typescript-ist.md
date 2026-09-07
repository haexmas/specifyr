# specifyr TS Rewrite — Slice A: TypeScript IST extractor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the IST (actual code state) of a TypeScript repository via tree-sitter WASM, expose it as `/api/ist`, and let the editor toggle between SOLL and IST views via a TopBar segmenter.

**Architecture:** New `src/extractors/typescript/` module uses `web-tree-sitter` to load the pre-built `tree-sitter-typescript.wasm` grammar. A file walker under a given repo root picks up `.ts` / `.tsx` files (skipping `node_modules`, `dist`, `.output`, `.nuxt`, `.git`), parses each into an AST, and emits per-file `module` nodes plus one node per top-level `class` / `interface` / `type-alias` / `enum` / `function` declaration. Node IDs are hash-based (`ts-<8char sha1>`) to satisfy Slice 1's strict `^[a-z0-9][a-z0-9_-]{0,63}$` pattern without collisions. The extractor returns a validated `Model` with `meta.source: "ist"`. A `/api/ist` route mirrors `/api/soll`. `frontend/pages/index.vue` gains a TopBar segmenter that swaps the fetch URL between the two.

**Tech Stack:** `web-tree-sitter@0.27.0` + `tree-sitter-typescript@0.23.2` — both ship pre-built WASM under `node_modules`, no native compilation. Slice 1's Zod schemas, Slice 2's Model types, Slice X's `frontend/` Nuxt shell. Existing toolchain: pnpm 9.15.0, Node 20+, TypeScript 5.6.3 strict, Vitest 2.1.4, Biome 1.9.4.

**Reference:**
- Design doc §7.6 IST, §7.1 Common schema, §10 Drift views ([docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md))
- Slice 4 (`generic` + `typescript` vocabulary packs): `typescript` pack declares node types `module`, `class`, `interface`, `type-alias`, `enum`, `function` — all `topLevel: false`. That is why IST-emitted nodes cannot be saved via SOLL (`bucket.ts` rejects them) — IST is a read-only view.
- Slice X: `frontend/pages/index.vue` currently fetches only `/api/soll`. Slice A adds a segmenter and a second endpoint.

**Branch:** `ts/slice-a-typescript-ist` off current `main` at the time Slice A starts (after PR #6 merges). Main is protected. Land via PR. Wait for CodeRabbit before merging (memory: `CR before merge`).

**Non-goals for Slice A:**
- Edges (imports/extends/implements) — Slice B
- Any language other than TypeScript — Slice C
- Auto-detection of languages present in a repo — Slice D
- Matching SOLL vs IST for drift visualization — later slice
- Distinctive per-type colouring of IST node types (default gray fine for v1)
- Persisting IST to disk (IST is always live, never stored)
- Handling `.tsx` differently from `.ts` (both go through same parser via TSX grammar)
- Respecting `.gitignore` (fixed skip-list only for Slice A)
- Incremental parsing / caching between requests

**Node id design:**

Slice 1 pins `NODE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/`. Ids must be lowercase + digits + hyphens + underscores, 1-64 chars, starts with a letter/digit. TypeScript identifiers (`AuthService`, `MyInterface`) contain uppercase, and file paths contain slashes and dots.

Slice A uses **`ts-<8char lower-hex sha1 of "<relative_file>::<qualified_name>">`** as node id. Deterministic per source, collision-safe across files, always matches the pattern. Total length ≈ 11 chars.

- `qualified_name` for a module = the empty string, so hash is over `"<relative_file>::"`
- `qualified_name` for a top-level declaration = its identifier (`AuthService`, `Point`)
- Ids are stable across runs — the same source produces the same id

---

## Task 1: Create the working branch

**Files:** git ref `HEAD`.

**Step 1: Confirm clean main**
```bash
git status && git branch --show-current && git log --oneline -1
```
Expected: clean, on `main`, tip is the squash of PR #6 or later.

**Step 2: Create branch**
```bash
git switch -c ts/slice-a-typescript-ist
```

**Step 3: Commit plan**
```bash
git add docs/plans/2026-09-07-specifyr-ts-slice-a-typescript-ist.md
git commit -m "Add Slice A plan: TypeScript IST extractor via tree-sitter WASM"
```

---

## Task 2: Add tree-sitter deps to root

**Files:** `package.json`, `pnpm-lock.yaml`.

**Step 1: Add deps**

Update root `package.json` `dependencies`:
```json
  "dependencies": {
    "citty": "0.1.6",
    "get-port": "7.1.0",
    "open": "10.1.0",
    "tree-sitter-typescript": "0.23.2",
    "web-tree-sitter": "0.27.0",
    "zod": "4.0.0"
  },
```
Exact pins, alphabetical. Both packages ship pre-built WASM at:
- `node_modules/web-tree-sitter/web-tree-sitter.wasm` — runtime
- `node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm` — TS grammar
- `node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm` — TSX grammar

If either exact version is unavailable, use the newest published in the same 0.27 / 0.23 line and note the substitution in the commit body.

**Step 2: Install**
```bash
pnpm install
```

**Step 3: Verify WASMs are actually there**
```bash
ls node_modules/web-tree-sitter/*.wasm
ls node_modules/tree-sitter-typescript/*.wasm
```
Expected: `web-tree-sitter.wasm`, `tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm`.

**Step 4: Verify existing gates**
```bash
pnpm typecheck && pnpm lint && pnpm test
```
All exit 0. Test count still 112.

**Step 5: Commit**
```
Add tree-sitter WASM deps for the TypeScript IST extractor
```

---

## Task 3: Deterministic node-id helper (TDD)

Pure function that turns `(relativePath, qualifiedName)` into a schema-compliant id.

**Files:**
- Create: `src/extractors/typescript/node-id.ts`
- Create: `tests/extractors/typescript/node-id.test.ts`

**Step 1: Failing test**

Create `tests/extractors/typescript/node-id.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { NODE_ID_PATTERN } from "../../../src/core/schemas.js";
import { istNodeId } from "../../../src/extractors/typescript/node-id.js";

describe("istNodeId", () => {
  it("returns an id that matches NODE_ID_PATTERN", () => {
    const id = istNodeId("src/auth/service.ts", "AuthService");
    expect(NODE_ID_PATTERN.test(id)).toBe(true);
  });

  it("is deterministic across runs", () => {
    const a = istNodeId("src/auth/service.ts", "AuthService");
    const b = istNodeId("src/auth/service.ts", "AuthService");
    expect(a).toBe(b);
  });

  it("differs by file even when the name is the same", () => {
    const a = istNodeId("src/auth/service.ts", "AuthService");
    const b = istNodeId("src/users/service.ts", "AuthService");
    expect(a).not.toBe(b);
  });

  it("differs by name even when the file is the same", () => {
    const a = istNodeId("src/auth/service.ts", "AuthService");
    const b = istNodeId("src/auth/service.ts", "OtherService");
    expect(a).not.toBe(b);
  });

  it("accepts the empty name for a module-level id", () => {
    const id = istNodeId("src/auth/service.ts", "");
    expect(NODE_ID_PATTERN.test(id)).toBe(true);
  });

  it("starts with the ts- prefix", () => {
    expect(istNodeId("src/x.ts", "Y")).toMatch(/^ts-/);
  });
});
```

**Step 2: Run to FAIL**
```bash
pnpm test tests/extractors/typescript/node-id.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement**

Create `src/extractors/typescript/node-id.ts`:
```typescript
import { createHash } from "node:crypto";

export function istNodeId(relativePath: string, qualifiedName: string): string {
  const hash = createHash("sha1")
    .update(`${relativePath}::${qualifiedName}`)
    .digest("hex")
    .slice(0, 8);
  return `ts-${hash}`;
}
```

**Step 4: Run to PASS** — 6 tests.

**Step 5: Commit**
```
Add hash-based IST node-id helper (TDD)
```

---

## Task 4: File walker for TypeScript sources (TDD)

Recursive walk of a repo root, filter to `.ts` / `.tsx`, skip well-known noise directories. Returns paths relative to the repo root, sorted.

**Files:**
- Create: `src/extractors/typescript/walk.ts`
- Create: `tests/extractors/typescript/walk.test.ts`

**Step 1: Failing test**

Create `tests/extractors/typescript/walk.test.ts`:
```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { walkTsFiles, SKIP_DIRS } from "../../../src/extractors/typescript/walk.js";

describe("walkTsFiles", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "specifyr-walk-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty list for an empty tree", async () => {
    expect(await walkTsFiles(root)).toEqual([]);
  });

  it("finds .ts files at every depth", async () => {
    writeFileSync(join(root, "a.ts"), "");
    mkdirSync(join(root, "sub", "deep"), { recursive: true });
    writeFileSync(join(root, "sub", "b.ts"), "");
    writeFileSync(join(root, "sub", "deep", "c.ts"), "");
    const paths = await walkTsFiles(root);
    expect(paths).toEqual(["a.ts", "sub/b.ts", "sub/deep/c.ts"]);
  });

  it("finds .tsx files too", async () => {
    writeFileSync(join(root, "a.tsx"), "");
    const paths = await walkTsFiles(root);
    expect(paths).toEqual(["a.tsx"]);
  });

  it("skips node_modules, dist, .output, .nuxt, .git and their contents", async () => {
    for (const dir of SKIP_DIRS) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, "x.ts"), "");
    }
    writeFileSync(join(root, "keep.ts"), "");
    expect(await walkTsFiles(root)).toEqual(["keep.ts"]);
  });

  it("ignores non-TypeScript files", async () => {
    writeFileSync(join(root, "keep.ts"), "");
    writeFileSync(join(root, "ignore.js"), "");
    writeFileSync(join(root, "ignore.md"), "");
    expect(await walkTsFiles(root)).toEqual(["keep.ts"]);
  });

  it("returns paths sorted for determinism", async () => {
    writeFileSync(join(root, "z.ts"), "");
    writeFileSync(join(root, "a.ts"), "");
    writeFileSync(join(root, "m.ts"), "");
    expect(await walkTsFiles(root)).toEqual(["a.ts", "m.ts", "z.ts"]);
  });
});
```

**Step 2: Run to FAIL**

**Step 3: Implement**

Create `src/extractors/typescript/walk.ts`:
```typescript
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".output",
  ".nuxt",
  ".git",
]);

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

export async function walkTsFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  await walk(root, root, results);
  return results.sort();
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(root, join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (!TS_EXTENSIONS.has(ext)) continue;
    out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
  }
}

function extname(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot);
}
```

**Step 4: Run to PASS** — 6 tests.

**Step 5: Commit**
```
Add TypeScript file walker (TDD)
```

---

## Task 5: tree-sitter WASM loader (TDD)

Load `web-tree-sitter` once, resolve the TS grammar WASM once, expose a `parseTypeScript(source)` that returns a tree.

**Files:**
- Create: `src/extractors/typescript/parser.ts`
- Create: `tests/extractors/typescript/parser.test.ts`

**Step 1: Failing test**

Create `tests/extractors/typescript/parser.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { parseTypeScript } from "../../../src/extractors/typescript/parser.js";

describe("parseTypeScript", () => {
  it("parses a trivial source into a tree", async () => {
    const tree = await parseTypeScript("export const x = 1;");
    expect(tree.rootNode.type).toBe("program");
  });

  it("parses class declarations", async () => {
    const tree = await parseTypeScript("export class Foo {}");
    const classes = tree.rootNode.descendantsOfType("class_declaration");
    expect(classes).toHaveLength(1);
  });

  it("parses interface declarations", async () => {
    const tree = await parseTypeScript("export interface Bar { x: number }");
    const interfaces = tree.rootNode.descendantsOfType("interface_declaration");
    expect(interfaces).toHaveLength(1);
  });

  it("does not throw on syntactically invalid input (produces error nodes instead)", async () => {
    const tree = await parseTypeScript("export class");
    expect(tree.rootNode.type).toBe("program");
  });
});
```

**Step 2: Run to FAIL**

**Step 3: Implement**

Create `src/extractors/typescript/parser.ts`:
```typescript
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Language, Parser } from "web-tree-sitter";

const require_ = createRequire(import.meta.url);
let cachedParser: Parser | undefined;

export async function parseTypeScript(source: string): Promise<Parser.Tree> {
  const parser = await getParser();
  return parser.parse(source);
}

async function getParser(): Promise<Parser> {
  if (cachedParser) return cachedParser;

  await Parser.init({
    locateFile(scriptName: string): string {
      // web-tree-sitter loads its own runtime WASM via this callback.
      if (scriptName.endsWith(".wasm")) {
        return require_.resolve("web-tree-sitter/web-tree-sitter.wasm");
      }
      return scriptName;
    },
  });

  const wasmPath = require_.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm");
  const wasmBytes = await readFile(wasmPath);
  const language = await Language.load(wasmBytes);

  const parser = new Parser();
  parser.setLanguage(language);
  cachedParser = parser;
  return parser;
}
```

Notes:
- `web-tree-sitter` exposes a namespace-style export. The `Parser.init` call bootstraps the shared WASM runtime. `locateFile` is the emscripten hook — it must resolve the runtime WASM's disk path.
- `createRequire(import.meta.url)` gives a CJS-style `require.resolve` inside our ESM module — the only reliable way to locate a package-shipped file across dev (source layout) and build (dist layout).
- The parser is cached at module scope so subsequent `parseTypeScript` calls skip re-init.
- If `web-tree-sitter@0.27.0`'s TypeScript surface differs from the imports above (e.g., the `Tree` type moved), adjust imports but keep the semantics. Record any deviation in the commit body.

**Step 4: Run to PASS** — 4 tests.

Troubleshooting:
- If `Parser.init` fails with "Missing WebAssembly", the `locateFile` callback returned a bogus path. Print the returned path and confirm the file exists on disk.
- If `Language.load` fails with a version mismatch, `tree-sitter-typescript@0.23.2` was built against a different `web-tree-sitter` ABI. Try `web-tree-sitter@0.24.x` as the runtime.

**Step 5: Commit**
```
Add tree-sitter TypeScript WASM loader (TDD)
```

---

## Task 6: Extract top-level declarations from a single parsed source (TDD)

Given a parsed tree and its relative path, emit the per-file `module` node plus one node per top-level `class`, `interface`, `type-alias`, `enum`, `function`.

**Files:**
- Create: `src/extractors/typescript/extract-source.ts`
- Create: `tests/extractors/typescript/extract-source.test.ts`

**Step 1: Failing test**

Create `tests/extractors/typescript/extract-source.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { extractSource } from "../../../src/extractors/typescript/extract-source.js";
import { istNodeId } from "../../../src/extractors/typescript/node-id.js";

describe("extractSource", () => {
  it("emits exactly one module node for an empty file", async () => {
    const nodes = await extractSource({ relativePath: "src/empty.ts", source: "" });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe("module");
    expect(nodes[0]?.name).toBe("src/empty.ts");
    expect(nodes[0]?.id).toBe(istNodeId("src/empty.ts", ""));
  });

  it("emits a class node for a top-level class", async () => {
    const nodes = await extractSource({
      relativePath: "src/auth.ts",
      source: "export class AuthService {}\n",
    });
    const classNode = nodes.find((n) => n.type === "class");
    expect(classNode).toBeDefined();
    expect(classNode?.name).toBe("AuthService");
    expect(classNode?.id).toBe(istNodeId("src/auth.ts", "AuthService"));
  });

  it("emits interface / type-alias / enum / function nodes", async () => {
    const source = `
      export interface User {}
      export type UserId = string;
      export enum Role { admin, user }
      export function login() {}
    `;
    const nodes = await extractSource({ relativePath: "src/all.ts", source });
    const byType = new Set(nodes.map((n) => n.type));
    expect(byType).toContain("module");
    expect(byType).toContain("interface");
    expect(byType).toContain("type-alias");
    expect(byType).toContain("enum");
    expect(byType).toContain("function");
    expect(nodes).toHaveLength(5);
  });

  it("does NOT emit nested declarations (methods, inner classes, inner functions)", async () => {
    const source = `
      export class Outer {
        method() {}
      }
      function outerFn() {
        function inner() {}
      }
    `;
    const nodes = await extractSource({ relativePath: "src/nested.ts", source });
    const names = nodes.map((n) => n.name).sort();
    expect(names).toEqual(["Outer", "outerFn", "src/nested.ts"]);
  });

  it("uses the file path as the module node's name", async () => {
    const nodes = await extractSource({ relativePath: "src/deep/module.ts", source: "" });
    expect(nodes[0]?.name).toBe("src/deep/module.ts");
  });
});
```

**Step 2: Run to FAIL**

**Step 3: Implement**

Create `src/extractors/typescript/extract-source.ts`:
```typescript
import type { Node } from "../../core/schemas.js";
import { istNodeId } from "./node-id.js";
import { parseTypeScript } from "./parser.js";

interface Source {
  relativePath: string;
  source: string;
}

// Map tree-sitter node type -> our vocabulary node type.
const TOP_LEVEL_KINDS: Record<string, string> = {
  class_declaration: "class",
  interface_declaration: "interface",
  type_alias_declaration: "type-alias",
  enum_declaration: "enum",
  function_declaration: "function",
};

export async function extractSource({ relativePath, source }: Source): Promise<Node[]> {
  const tree = await parseTypeScript(source);
  const nodes: Node[] = [];

  nodes.push({
    id: istNodeId(relativePath, ""),
    type: "module",
    name: relativePath,
    classes: [],
  });

  for (const child of tree.rootNode.namedChildren) {
    const declaration = unwrapExport(child);
    const emittedType = TOP_LEVEL_KINDS[declaration.type];
    if (!emittedType) continue;
    const name = declaration.childForFieldName("name")?.text;
    if (!name) continue;
    nodes.push({
      id: istNodeId(relativePath, name),
      type: emittedType,
      name,
      classes: [],
    });
  }

  return nodes;
}

// `export class Foo {}` parses as export_statement > class_declaration.
// Peel one level of export_statement to reach the actual declaration.
function unwrapExport(node: { type: string; namedChildren: unknown[] } & Record<string, unknown>): {
  type: string;
  childForFieldName(name: string): { text: string } | null;
  namedChildren: unknown[];
} {
  const typed = node as unknown as {
    type: string;
    namedChildren: Array<{ type: string; childForFieldName(n: string): { text: string } | null }>;
    childForFieldName(n: string): { text: string } | null;
  };
  if (typed.type === "export_statement" && typed.namedChildren.length > 0) {
    const first = typed.namedChildren[0];
    if (first) return first;
  }
  return typed as unknown as {
    type: string;
    childForFieldName(name: string): { text: string } | null;
    namedChildren: unknown[];
  };
}
```

Typing note: `web-tree-sitter`'s Node type is opaque and the ESM types in 0.27 are looser than we'd like. We coerce narrowly in `unwrapExport` rather than sprinkle `any` — accepting that this is the ugliest part of the module. If the tree-sitter types improve later, tighten this. For Slice A, keep the coercion contained to one function.

**Step 4: Run to PASS** — 5 tests.

**Step 5: Commit**
```
Extract top-level declarations from parsed TypeScript source (TDD)
```

---

## Task 7: Orchestrator `extractIst(repoRoot)` (TDD)

Walks the repo, parses each file, unions the node lists into a validated `Model`.

**Files:**
- Create: `src/extractors/typescript/extract.ts`
- Create: `tests/extractors/typescript/extract.test.ts`

**Step 1: Failing test**

Create `tests/extractors/typescript/extract.test.ts`:
```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractIst } from "../../../src/extractors/typescript/extract.js";

describe("extractIst", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-ist-ts-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("returns an empty model when the repo has no .ts files", async () => {
    const model = await extractIst(repoPath);
    expect(model.meta.source).toBe("ist");
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it("emits one module node per .ts file plus its top-level declarations", async () => {
    mkdirSync(join(repoPath, "src"), { recursive: true });
    writeFileSync(join(repoPath, "src", "auth.ts"), "export class AuthService {}\n");
    writeFileSync(
      join(repoPath, "src", "types.ts"),
      "export interface User {}\nexport type UserId = string;\n",
    );

    const model = await extractIst(repoPath);
    const byType = new Map<string, string[]>();
    for (const node of model.nodes) {
      const list = byType.get(node.type) ?? [];
      list.push(node.name);
      byType.set(node.type, list);
    }
    expect(byType.get("module")?.sort()).toEqual(["src/auth.ts", "src/types.ts"]);
    expect(byType.get("class")).toEqual(["AuthService"]);
    expect(byType.get("interface")).toEqual(["User"]);
    expect(byType.get("type-alias")).toEqual(["UserId"]);
  });

  it("skips node_modules and other noise dirs", async () => {
    mkdirSync(join(repoPath, "node_modules"), { recursive: true });
    writeFileSync(join(repoPath, "node_modules", "x.ts"), "export class Junk {}\n");
    writeFileSync(join(repoPath, "keep.ts"), "export class Keep {}\n");

    const model = await extractIst(repoPath);
    const names = model.nodes.map((n) => n.name);
    expect(names).toContain("Keep");
    expect(names).not.toContain("Junk");
  });

  it("returns a Model that passes ModelSchema.parse", async () => {
    const { ModelSchema } = await import("../../../src/core/schemas.js");
    writeFileSync(join(repoPath, "one.ts"), "export class One {}\n");
    const model = await extractIst(repoPath);
    // Should not throw.
    ModelSchema.parse(model);
  });
});
```

**Step 2: Run to FAIL**

**Step 3: Implement**

Create `src/extractors/typescript/extract.ts`:
```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ModelSchema } from "../../core/schemas.js";
import type { Model, Node } from "../../core/schemas.js";
import { extractSource } from "./extract-source.js";
import { walkTsFiles } from "./walk.js";

export async function extractIst(repoRoot: string): Promise<Model> {
  const files = await walkTsFiles(repoRoot);
  const allNodes: Node[] = [];

  for (const relativePath of files) {
    const source = await readFile(join(repoRoot, relativePath), "utf8");
    const nodes = await extractSource({ relativePath, source });
    allNodes.push(...nodes);
  }

  return ModelSchema.parse({
    meta: { source: "ist", generatedAt: new Date().toISOString() },
    nodes: allNodes,
    edges: [],
  });
}
```

**Step 4: Run to PASS** — 4 tests.

Note: `ModelSchema` will re-validate that node ids are unique. Since Slice A's ids are hashes over `(path, name)`, collisions require two `(path, name)` pairs producing the same 8-hex-char hash — probability ≈ 1/2^32 per pair. Acceptable for Slice A. If we ever hit one in practice, bump the hash length.

**Step 5: Commit**
```
Add extractIst orchestrator that walks + parses + unions nodes (TDD)
```

---

## Task 8: `src/extractors/typescript/index.ts` re-exports

**Files:** Create `src/extractors/typescript/index.ts`.

Content:
```typescript
export { extractIst } from "./extract.js";
export { extractSource } from "./extract-source.js";
export { istNodeId } from "./node-id.js";
export { parseTypeScript } from "./parser.js";
export { SKIP_DIRS, walkTsFiles } from "./walk.js";
```

**Verify:** `pnpm typecheck && pnpm lint && pnpm test` all green.

**Commit:**
```
Re-export TypeScript IST extractor API
```

---

## Task 9: Publish `specifyr/extractors/typescript` subpath

**Files:** Modify `package.json`.

Add a sibling entry to the existing `exports` block:
```json
    "./extractors/typescript": {
      "types": "./dist/extractors/typescript/index.d.ts",
      "import": "./dist/extractors/typescript/index.js"
    }
```

**Verify tarball would include the extractor:**
```bash
pnpm build
pnpm pack --pack-destination /tmp
tar -tzf /tmp/specifyr-0.1.0.tgz | grep -E 'extractors/typescript/(index|extract|parser|walk|node-id)\.js' | sort
```
Expected: all five .js files listed under `package/dist/extractors/typescript/`.

Cleanup: `rm /tmp/specifyr-0.1.0.tgz`.

**Full gate:**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0.

**Commit:**
```
Publish specifyr/extractors/typescript subpath in package exports
```

---

## Task 10: `/api/ist` server route with unit-tested handler (TDD)

Mirrors Slice X's `/api/soll` route: reads `SPECIFYR_REPO_PATH`, calls the extractor, returns the Model.

**Files:**
- Create: `frontend/server/utils/ist.ts`
- Create: `frontend/server/api/ist.get.ts`
- Create: `tests/frontend/ist-handler.test.ts`

**Step 1: Failing test**

Create `tests/frontend/ist-handler.test.ts`:
```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadIstForRequest } from "../../frontend/server/utils/ist.js";

describe("loadIstForRequest", () => {
  let repoPath: string;
  const originalEnv = process.env.SPECIFYR_REPO_PATH;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-ist-req-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
    if (originalEnv === undefined) {
      // biome-ignore lint/performance/noDelete: env "" would leak the literal string "undefined"
      delete process.env.SPECIFYR_REPO_PATH;
    } else {
      process.env.SPECIFYR_REPO_PATH = originalEnv;
    }
  });

  it("throws when SPECIFYR_REPO_PATH is not set", async () => {
    // biome-ignore lint/performance/noDelete: same rationale as above
    delete process.env.SPECIFYR_REPO_PATH;
    await expect(loadIstForRequest()).rejects.toThrow(/SPECIFYR_REPO_PATH/);
  });

  it("returns an ist model for a repo with a class", async () => {
    mkdirSync(join(repoPath, "src"), { recursive: true });
    writeFileSync(join(repoPath, "src", "x.ts"), "export class Foo {}\n");
    process.env.SPECIFYR_REPO_PATH = repoPath;
    const model = await loadIstForRequest();
    expect(model.meta.source).toBe("ist");
    expect(model.nodes.map((n) => n.name)).toContain("Foo");
  });
});
```

**Step 2: Run to FAIL** (module not found)

**Step 3: Implement `frontend/server/utils/ist.ts`**

```typescript
import { extractIst } from "specifyr/extractors/typescript";
import type { Model } from "specifyr";

export async function loadIstForRequest(): Promise<Model> {
  // Assumes nitro.preset "node-server" — process.env is stable across requests.
  // If moving to an edge preset later, read from event context instead.
  const repoPath = process.env.SPECIFYR_REPO_PATH;
  if (!repoPath) {
    throw new Error(
      "SPECIFYR_REPO_PATH is not set. The specifyr editor sets this automatically; " +
        "if you are running the frontend directly, export SPECIFYR_REPO_PATH=<path>.",
    );
  }
  return await extractIst(repoPath);
}
```

**Step 4: Implement `frontend/server/api/ist.get.ts`**

```typescript
import { loadIstForRequest } from "../utils/ist.js";

export default defineEventHandler(async (event) => {
  try {
    return await loadIstForRequest();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setResponseStatus(event, 500);
    return { error: message };
  }
});
```

**Step 5: Extend `tsconfig.json` include**

Slice X narrowed the root `tsconfig.json`'s include to `frontend/server/utils/**/*.ts`. That still covers `frontend/server/utils/ist.ts`. No change needed.

**Step 6: Run to PASS** — 2 tests. Test count adds 2 → 6 for `tests/frontend/*`.

Troubleshooting: if the import fails with "Cannot find module 'specifyr/extractors/typescript'", run `pnpm build` at root first (that emits `dist/extractors/typescript/`), then retry.

**Step 7: Commit**
```
Add /api/ist server route with unit-tested handler (TDD)
```

---

## Task 11: TopBar segmenter — SOLL / IST toggle in the editor page

**Files:** Modify `frontend/pages/index.vue`.

**Step 1: Update script**

Change:
```typescript
const { data, error, status } = useFetch<SollModel>("/api/soll");
```
To:
```typescript
type ViewSource = "soll" | "ist";
const view = ref<ViewSource>("soll");
const endpoint = computed(() => (view.value === "soll" ? "/api/soll" : "/api/ist"));
const { data, error, status, refresh } = await useFetch<SollModel>(endpoint, { watch: [view] });
```

The `watch: [view]` option re-fires `useFetch` when `view` changes. `refresh` is available if we want a manual reload button in a later slice.

Also rename the type since it now covers both SOLL and IST shapes (they're identical `Model`s, just different `meta.source`):
```typescript
type ArchitectureModel = SollModel;
```
Or better — keep the `SollModel` interface but rename in a follow-up. For Slice A, both API endpoints return the same shape so keeping the type name is fine; just update the comment above the interface to say "shared shape for SOLL and IST".

**Step 2: Update template**

Extend the `<header>` block to include the segmenter:
```vue
<header class="editor-topbar">
  <strong>specifyr editor</strong>
  <div class="editor-segmenter" role="group" aria-label="View source">
    <button
      type="button"
      :class="{ 'is-active': view === 'soll' }"
      @click="view = 'soll'"
    >
      SOLL
    </button>
    <button
      type="button"
      :class="{ 'is-active': view === 'ist' }"
      @click="view = 'ist'"
    >
      IST
    </button>
  </div>
  <span v-if="data?.meta">
    · source: {{ data.meta.source }}
    <span v-if="data.meta.generatedAt">· {{ data.meta.generatedAt }}</span>
  </span>
</header>
```

**Step 3: Add minimal segmenter styling**

Add to the scoped `<style>` block:
```css
.editor-segmenter {
  display: inline-flex;
  margin: 0 0.5rem;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  overflow: hidden;
}
.editor-segmenter button {
  padding: 0.25rem 0.75rem;
  background: transparent;
  border: none;
  border-right: 1px solid #d4d4d8;
  font: inherit;
  cursor: pointer;
}
.editor-segmenter button:last-child {
  border-right: none;
}
.editor-segmenter button.is-active {
  background: #e4e4e7;
  font-weight: 600;
}
```

**Step 4: Rebuild + smoke test**

```bash
pnpm build
```

Run the editor manually against a repo that has TypeScript in it (this specifyr repo is fine):
```bash
node dist/cli/index.js editor /home/haex/Projekte/specifyr --no-open --port 3980
```

In another terminal:
```bash
curl -s http://127.0.0.1:3980/api/soll | head -c 200
curl -s http://127.0.0.1:3980/api/ist | python3 -c "import json,sys; m=json.load(sys.stdin); print('nodes:', len(m['nodes']), 'source:', m['meta']['source'])"
```
Expected: SOLL returns whatever `.specifyr/soll/` holds (or the "required file missing" error if none). IST returns >0 nodes with source `ist`.

Kill: `curl` the process's PID via `lsof -iTCP:3980 -sTCP:LISTEN -Pn | awk 'NR==2{print $2}' | xargs -r kill` or just kill the terminal.

**Step 5: Commit**
```
Add SOLL/IST segmenter to the editor TopBar
```

---

## Task 12: End-to-end integration test — `/api/ist` returns real IST nodes

Spawn the built CLI against the specifyr repo itself (a real TypeScript codebase we control) and verify `/api/ist` reports at least one known node.

**Files:** Create `tests/cli/editor-ist-integration.test.ts`.

```typescript
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const CLI_ENTRY = resolve(process.cwd(), "dist", "cli", "index.js");
const FRONTEND_BUILD = resolve(
  process.cwd(),
  "frontend",
  ".output",
  "server",
  "index.mjs",
);

function stripVitestEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const {
    VITEST: _v,
    VITEST_POOL_ID: _vp,
    VITEST_WORKER_ID: _vw,
    NODE_ENV: _ne,
    TEST: _t,
    ...clean
  } = env;
  void [_v, _vp, _vw, _ne, _t];
  return { ...clean, NO_COLOR: "1" };
}

async function waitForOutput(
  child: ChildProcessWithoutNullStreams,
  needle: RegExp,
  timeoutMs: number,
): Promise<string> {
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

describe("specifyr editor /api/ist (end-to-end)", () => {
  let child: ChildProcessWithoutNullStreams | undefined;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) throw new Error(`CLI not built: ${CLI_ENTRY}`);
    if (!existsSync(FRONTEND_BUILD)) throw new Error(`Frontend not built: ${FRONTEND_BUILD}`);
  });

  afterEach(() => {
    if (child && !child.killed) child.kill("SIGTERM");
    child = undefined;
  });

  it("extracts IST nodes from the specifyr repo itself", async () => {
    const repoRoot = process.cwd(); // The specifyr repo — has plenty of TS.
    child = spawn(process.execPath, [CLI_ENTRY, "editor", repoRoot, "--no-open"], {
      env: stripVitestEnv(process.env),
    }) as ChildProcessWithoutNullStreams;

    const runningLine = await waitForOutput(
      child,
      /Editor running at (http:\/\/127\.0\.0\.1:\d+)/,
      20000,
    );
    const url = runningLine.replace(/^Editor running at /, "");

    const res = await fetch(`${url}/api/ist`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meta: { source: string };
      nodes: Array<{ type: string; name: string }>;
    };
    expect(body.meta.source).toBe("ist");
    expect(body.nodes.length).toBeGreaterThan(10);
    // Slice 1's schemas.ts contains classes/interfaces the extractor should find.
    const names = body.nodes.map((n) => n.name);
    expect(names).toContain("src/core/schemas.ts");
  }, 30000);
});
```

**Step 1: Rebuild**
```bash
pnpm build
```

**Step 2: Run the test**
```bash
pnpm test tests/cli/editor-ist-integration.test.ts
```
Expected: 1 test passes. Runtime ~10-20 seconds (Nuxt boot + full-repo extraction).

**Step 3: Commit**
```
Add end-to-end test for /api/ist against the specifyr repo
```

---

## Task 13: README update

**Files:** Modify `README.md`.

**Step 1: Extend the Status list**

Replace the current Status block. Insert Slice A:
```markdown
Slice X: read-only visual editor — `specifyr editor` opens a Vue Flow graph of the SOLL in the browser. ✅
Slice A (current): TypeScript IST extractor — `/api/ist` walks the repo, tree-sitter parses each `.ts`/`.tsx`, emits `module` + top-level declaration nodes. TopBar segmenter toggles SOLL/IST. ✅
Slice B+ (planned): IST edges (imports/extends/implements), Python + Java IST, drift matching (SOLL vs IST), auto-layout, editing via MCP.
```

**Step 2: Extend Usage note**

Append below the existing editor paragraph:
```markdown
Click **IST** in the TopBar to see the TypeScript IST of the same repo — every `.ts`/`.tsx` file becomes a `module` node, plus top-level classes/interfaces/type-aliases/enums/functions. Edges come in a later slice.
```

**Step 3: Commit**
```
Update README with Slice A status and IST usage note
```

---

## Task 14: Final green-checkpoint + PR

**Step 1: Full gate**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0. Expected test count:
- 112 baseline
- +6 node-id
- +6 walker
- +4 parser
- +5 extract-source
- +4 extract orchestrator
- +2 ist handler
- +1 e2e ist
= **140 tests**.

**Step 2: Push**
```bash
git push -u origin ts/slice-a-typescript-ist
```

**Step 3: Open PR**
```bash
gh pr create --base main --head ts/slice-a-typescript-ist \
  --title "TS rewrite Slice A: TypeScript IST extractor (nodes only)" \
  --body-file - <<'EOF'
## Summary

Slice A of the TypeScript rewrite tracked in
[docs/plans/2026-09-07-specifyr-ts-slice-a-typescript-ist.md](docs/plans/2026-09-07-specifyr-ts-slice-a-typescript-ist.md).

Ships the first IST (actual code state) source: a tree-sitter WASM based TypeScript extractor plus a TopBar segmenter to toggle the editor between SOLL and IST.

### What's in

- **`src/extractors/typescript/`** — WASM tree-sitter TS grammar loader (`parser.ts`), file walker (`walk.ts`), per-source extractor (`extract-source.ts`), orchestrator (`extract.ts`), hash-based node-id helper (`node-id.ts`).
- **Emitted node types** per pack — `module` (per file) plus top-level `class` / `interface` / `type-alias` / `enum` / `function`. All ids are `ts-<8char sha1>` so they satisfy Slice 1's `NODE_ID_PATTERN`.
- **Skip list**: `node_modules`, `dist`, `.output`, `.nuxt`, `.git`.
- **New subpath** `specifyr/extractors/typescript`.
- **`/api/ist`** server route mirrors `/api/soll` — reads `SPECIFYR_REPO_PATH`, returns the Model.
- **TopBar segmenter** in `frontend/pages/index.vue` toggles between `/api/soll` and `/api/ist`.
- **New runtime deps**: `web-tree-sitter@0.27.0` + `tree-sitter-typescript@0.23.2` — both ship pre-built WASM, no native compilation.
- **E2E test** runs the editor against the specifyr repo itself and verifies `/api/ist` returns >10 nodes including `src/core/schemas.ts`.

### Non-goals for this slice
- Edges (imports/extends/implements) — Slice B
- Python or any language other than TypeScript — Slice C
- Auto-detecting languages per repo — Slice D
- SOLL ↔ IST drift matching — later slice
- Per-type colouring of IST nodes (they render as default gray)
- Persisting IST to disk (IST is always live)
- Respecting `.gitignore` (fixed skip-list only)
- Incremental parsing / caching between requests

## Test plan

- [x] `pnpm install --frozen-lockfile` clean
- [x] `pnpm build` clean — TS emit + pack copy + Nuxt build
- [x] `pnpm lint`, `pnpm typecheck` clean
- [x] `pnpm test` — 140 tests pass (baseline 112 + 28 new)
- [x] `pnpm pack` tarball includes `package/dist/extractors/typescript/*.js`
- [x] E2E test proves the extractor works on a real repo

## Manual verification

    pnpm build
    node dist/cli/index.js editor . --no-open --port 3939
    # In another terminal:
    curl -s http://127.0.0.1:3939/api/ist | jq '.nodes | length'
    # Should print a number > 10 for the specifyr repo.

Then open http://127.0.0.1:3939 in a browser, click IST in the TopBar, see the TS structure of the current directory.

## Notes for reviewer

- The `web-tree-sitter` typings in 0.27 are loose. The typing coercion in `extract-source.ts::unwrapExport` is deliberate and contained — see the comment there.
- Node ids collide only if two `(path, name)` pairs produce the same 8-hex-char sha1 prefix (~1/2^32 per pair). If we ever hit one, bump the hash length.
- `frontend/server/utils/ist.ts` duplicates the env-var check from `soll.ts` — two callers, one line each, no shared helper yet.
- IST-specific per-type colouring (e.g., class = pink, interface = purple) is a later polish slice.
EOF
```

**Step 4: Wait**

Do not merge until CodeRabbit has reviewed and every valid finding is addressed.

---

## Notes for the executing agent

- **DRY:** the vitest-env-strip trick from Slice X's `editorChildEnv` and `stripVitestEnv` in this slice's E2E test — inline in both, no shared helper (two callers).
- **YAGNI:** no caching, no incremental parsing, no watch mode, no `.gitignore` handling, no language auto-detect. All deferred.
- **Import discipline:** every local import uses `.js` extension.
- **TDD:** Tasks 3-7 and 10 are strict test-first. Tasks 2, 8, 9, 11, 13 are wiring/config. Task 12 is a fresh e2e.
- **Main protected**, work on `ts/slice-a-typescript-ist`, land via PR, **CR before merge**.
- **Tree-sitter typing edge cases** — if `web-tree-sitter@0.27.0`'s API surface differs from Task 5's assumptions (e.g., `Parser` is a named export vs default, `Tree` type location moved), adjust imports but keep semantics. Document in commit body.
- **First-run WASM load** in Vitest may take 200-500ms — vitest's default per-test timeout (5s) is plenty; no adjustment needed for unit tests. The e2e test's 30000ms accounts for Nuxt boot dominating.
- **Do not touch** Slice 1 schemas, Slice 2 storage, Slice 3 CLI (init/status), Slice 4 vocabulary packs, Slice X's `runEditor` handler. All Slice A code is purely additive except the two small edits to `frontend/pages/index.vue` and `package.json`.
