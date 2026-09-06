# specifyr TS Rewrite — Slice 4: Vocabulary Packs v1

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the ten shipped-with-v1 vocabulary packs (`generic`, `python`, `typescript`, `vue`, `angular`, `c`, `cpp`, `rust`, `java`, `go`) as JSON data, plus a loader and a resolver that turns a `VocabularyConfig` into a flat map of allowed node/edge types.

**Architecture:** Ten JSON files at `src/packs/*.json`, one per pack. A `VocabularyPackSchema` (Zod) locks in the shape: `{ name, nodeTypes, edgeTypes, viewTemplates? }`. `loadPack(name)` reads the bundled JSON from disk relative to the compiled module. `resolveVocabulary(config)` unions active packs + custom types and reports collisions. `bucket.ts` from Slice 2 stays hard-coded; a cross-slice test asserts that its `SUPPORTED_NODE_TYPES` matches the generic pack's `topLevel` types — drift shows up as a failing test, not as a silent inconsistency at editor-time. A tiny `scripts/copy-packs.mjs` copies `src/packs/*.json` to `dist/packs/` after tsc emit, since tsc does not copy JSON.

**Tech Stack:** TypeScript 5, Zod 4, Node `node:fs/promises`, Vitest. No new runtime dependencies.

**Reference:**
- Design doc §7.2 Vocabulary system, §7.1 Common schema, §7.3 SOLL storage layout ([docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md))
- Slice 1 (already on main): `AttributeDefinitionSchema`, `CustomTypeSchema`, `VocabularyConfigSchema`, `PackNameSchema`, `SHIPPED_PACKS` at `src/core/vocabulary.ts`
- Slice 2: `SUPPORTED_NODE_TYPES = ["component", "module", "external-service", "data-store"]` hard-coded at `src/storage/bucket.ts`
- Slice 3: CLI on `main` (`f93851a`)

**Branch:** `ts/slice-4-vocabulary-packs` off current `main` (`f93851a`). Main is protected. Land via PR. Wait for CodeRabbit (memory: `CR before merge`).

**Non-goals for Slice 4:**
- Refactoring Slice 2's `bucket.ts` to consult the vocabulary at runtime (deferred; cross-slice test catches drift instead)
- User-authored packs (design doc lists them in the config as `activePacks: [...]` — Slice 4 only ships built-ins)
- Pack merging semantics beyond "union with duplicate detection" (no priority ordering, no per-pack override)
- View templates content — schema allows the field, Slice 4 leaves it empty in every pack
- Wiring vocabulary into the CLI (later slice adds `specifyr vocab list`)
- Wiring vocabulary into `Model`/`Node` validation (defer until a slice needs it)

**Language pack authoring depth per slice:**
- `generic` — **authoritative**: exactly the 4 top-level types from Slice 2's `SUPPORTED_NODE_TYPES`, plus every edge type listed in design doc §7.1 (`depends-on`, `contains`, `implements`, `exposes`, `calls`, `imports`, `reads-from`, `writes-to`, `passes-through`)
- `python`, `typescript`, `vue` — **reasonable v1**: 5-8 node types each based on common convention (see task 3)
- `angular`, `c`, `cpp`, `rust`, `java`, `go` — **minimal seed**: 2-4 node types + a clear README note that expert domain-fill is a follow-up

---

## Task 1: Create the working branch

**Files:** git ref `HEAD`.

**Step 1: Confirm clean main**
```bash
git status && git branch --show-current && git log --oneline -1
```
Expected: clean, on `main`, tip is `f93851a` or later.

**Step 2: Create branch**
```bash
git switch -c ts/slice-4-vocabulary-packs
```

**Step 3: Commit plan**
```bash
git add docs/plans/2026-09-06-specifyr-ts-slice-4-vocabulary-packs.md
git commit -m "Add Slice 4 plan: vocabulary packs v1"
```

---

## Task 2: `VocabularyPackSchema` (TDD)

Defines the shape of ONE pack. Reuses `AttributeDefinitionSchema` from Slice 1.

**Files:**
- Create: `src/vocabulary/pack.ts`
- Create: `tests/vocabulary/pack.test.ts`

**Step 1: Failing tests**

Create `tests/vocabulary/pack.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { VocabularyPackSchema } from "../../src/vocabulary/pack.js";

describe("VocabularyPackSchema", () => {
  it("accepts a minimal pack with only a name", () => {
    const parsed = VocabularyPackSchema.parse({ name: "generic" });
    expect(parsed.name).toBe("generic");
    expect(parsed.nodeTypes).toEqual([]);
    expect(parsed.edgeTypes).toEqual([]);
    expect(parsed.viewTemplates).toEqual([]);
  });

  it("accepts a pack with node and edge types", () => {
    const parsed = VocabularyPackSchema.parse({
      name: "generic",
      nodeTypes: [
        { name: "component", topLevel: true },
        { name: "module", topLevel: true, attributes: [{ name: "path", type: "string" }] },
      ],
      edgeTypes: [{ name: "depends-on" }],
    });
    expect(parsed.nodeTypes).toHaveLength(2);
    expect(parsed.nodeTypes[1]?.attributes).toEqual([{ name: "path", type: "string" }]);
    expect(parsed.edgeTypes[0]?.name).toBe("depends-on");
  });

  it("rejects a pack whose name is not a shipped pack", () => {
    expect(() => VocabularyPackSchema.parse({ name: "cobol" })).toThrow();
  });

  it("rejects duplicate node type names inside a pack", () => {
    expect(() =>
      VocabularyPackSchema.parse({
        name: "generic",
        nodeTypes: [
          { name: "component", topLevel: true },
          { name: "component", topLevel: false },
        ],
      }),
    ).toThrow(/duplicate node type/i);
  });

  it("rejects duplicate edge type names inside a pack", () => {
    expect(() =>
      VocabularyPackSchema.parse({
        name: "generic",
        edgeTypes: [{ name: "depends-on" }, { name: "depends-on" }],
      }),
    ).toThrow(/duplicate edge type/i);
  });

  it("defaults topLevel to false when omitted", () => {
    const parsed = VocabularyPackSchema.parse({
      name: "typescript",
      nodeTypes: [{ name: "interface" }],
    });
    expect(parsed.nodeTypes[0]?.topLevel).toBe(false);
  });
});
```

**Step 2: Run FAIL** — module not found.

**Step 3: Implement**

Create `src/vocabulary/pack.ts`:
```typescript
import { z } from "zod";

import { AttributeDefinitionSchema, PackNameSchema } from "../core/vocabulary.js";

export const NodeTypeDefinitionSchema = z.object({
  name: z.string().min(1),
  topLevel: z.boolean().default(false),
  attributes: z.array(AttributeDefinitionSchema).default([]),
});

export const EdgeTypeDefinitionSchema = z.object({
  name: z.string().min(1),
  attributes: z.array(AttributeDefinitionSchema).default([]),
});

export const ViewTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const VocabularyPackSchema = z
  .object({
    name: PackNameSchema,
    nodeTypes: z.array(NodeTypeDefinitionSchema).default([]),
    edgeTypes: z.array(EdgeTypeDefinitionSchema).default([]),
    viewTemplates: z.array(ViewTemplateSchema).default([]),
  })
  .check((ctx) => {
    const pack = ctx.value;
    const seenNodes = new Map<string, number>();
    for (const [index, node] of pack.nodeTypes.entries()) {
      const prior = seenNodes.get(node.name);
      if (prior !== undefined) {
        ctx.issues.push({
          code: "custom",
          path: ["nodeTypes", index, "name"],
          message: `duplicate node type in pack ${pack.name}: ${node.name} (also at nodeTypes[${prior}])`,
          input: node.name,
        });
      } else {
        seenNodes.set(node.name, index);
      }
    }
    const seenEdges = new Map<string, number>();
    for (const [index, edge] of pack.edgeTypes.entries()) {
      const prior = seenEdges.get(edge.name);
      if (prior !== undefined) {
        ctx.issues.push({
          code: "custom",
          path: ["edgeTypes", index, "name"],
          message: `duplicate edge type in pack ${pack.name}: ${edge.name} (also at edgeTypes[${prior}])`,
          input: edge.name,
        });
      } else {
        seenEdges.set(edge.name, index);
      }
    }
  });

export type NodeTypeDefinition = z.infer<typeof NodeTypeDefinitionSchema>;
export type EdgeTypeDefinition = z.infer<typeof EdgeTypeDefinitionSchema>;
export type ViewTemplate = z.infer<typeof ViewTemplateSchema>;
export type VocabularyPack = z.infer<typeof VocabularyPackSchema>;
```

**Step 4: Run PASS** — 6 tests.

**Step 5: Commit**
```
Add VocabularyPackSchema (TDD)
```

---

## Task 3: Author the ten shipped packs as JSON

**Files:**
- Create: `src/packs/generic.json`
- Create: `src/packs/python.json`
- Create: `src/packs/typescript.json`
- Create: `src/packs/vue.json`
- Create: `src/packs/angular.json`
- Create: `src/packs/c.json`
- Create: `src/packs/cpp.json`
- Create: `src/packs/rust.json`
- Create: `src/packs/java.json`
- Create: `src/packs/go.json`
- Create: `src/packs/README.md`
- Create: `tests/vocabulary/packs.test.ts`

Every pack file is a JSON document conforming to `VocabularyPackSchema`. Author each verbatim below. The test at the end validates all ten.

### `src/packs/generic.json`

```json
{
  "name": "generic",
  "nodeTypes": [
    { "name": "component", "topLevel": true },
    { "name": "module", "topLevel": true },
    { "name": "external-service", "topLevel": true },
    { "name": "data-store", "topLevel": true }
  ],
  "edgeTypes": [
    { "name": "depends-on" },
    { "name": "contains" },
    { "name": "implements" },
    { "name": "exposes" },
    { "name": "calls" },
    { "name": "imports" },
    { "name": "reads-from" },
    { "name": "writes-to" },
    { "name": "passes-through" }
  ]
}
```

### `src/packs/python.json`

```json
{
  "name": "python",
  "nodeTypes": [
    { "name": "package" },
    { "name": "module" },
    { "name": "class" },
    { "name": "function" },
    { "name": "coroutine" }
  ],
  "edgeTypes": [
    { "name": "imports" },
    { "name": "inherits" },
    { "name": "calls" },
    { "name": "decorates" }
  ]
}
```

### `src/packs/typescript.json`

```json
{
  "name": "typescript",
  "nodeTypes": [
    { "name": "module" },
    { "name": "class" },
    { "name": "interface" },
    { "name": "type-alias" },
    { "name": "enum" },
    { "name": "function" }
  ],
  "edgeTypes": [
    { "name": "imports" },
    { "name": "extends" },
    { "name": "implements" },
    { "name": "calls" }
  ]
}
```

### `src/packs/vue.json`

```json
{
  "name": "vue",
  "nodeTypes": [
    { "name": "component" },
    { "name": "composable" },
    { "name": "store" },
    { "name": "route" },
    { "name": "plugin" }
  ],
  "edgeTypes": [
    { "name": "imports" },
    { "name": "emits" },
    { "name": "provides" },
    { "name": "injects" },
    { "name": "uses-composable" }
  ]
}
```

### `src/packs/angular.json`

```json
{
  "name": "angular",
  "nodeTypes": [
    { "name": "module" },
    { "name": "component" },
    { "name": "service" },
    { "name": "directive" }
  ],
  "edgeTypes": [
    { "name": "declares" },
    { "name": "imports" },
    { "name": "injects" }
  ]
}
```

### `src/packs/c.json`

```json
{
  "name": "c",
  "nodeTypes": [
    { "name": "translation-unit" },
    { "name": "function" },
    { "name": "struct" }
  ],
  "edgeTypes": [
    { "name": "includes" },
    { "name": "calls" }
  ]
}
```

### `src/packs/cpp.json`

```json
{
  "name": "cpp",
  "nodeTypes": [
    { "name": "translation-unit" },
    { "name": "class" },
    { "name": "function" },
    { "name": "namespace" }
  ],
  "edgeTypes": [
    { "name": "includes" },
    { "name": "inherits" },
    { "name": "calls" }
  ]
}
```

### `src/packs/rust.json`

```json
{
  "name": "rust",
  "nodeTypes": [
    { "name": "crate" },
    { "name": "module" },
    { "name": "trait" },
    { "name": "struct" }
  ],
  "edgeTypes": [
    { "name": "uses" },
    { "name": "implements" }
  ]
}
```

### `src/packs/java.json`

```json
{
  "name": "java",
  "nodeTypes": [
    { "name": "package" },
    { "name": "class" },
    { "name": "interface" }
  ],
  "edgeTypes": [
    { "name": "imports" },
    { "name": "extends" },
    { "name": "implements" }
  ]
}
```

### `src/packs/go.json`

```json
{
  "name": "go",
  "nodeTypes": [
    { "name": "package" },
    { "name": "struct" },
    { "name": "interface" }
  ],
  "edgeTypes": [
    { "name": "imports" }
  ]
}
```

### `src/packs/README.md`

```markdown
# Vocabulary Packs

Each `<name>.json` in this directory is one vocabulary pack conforming to
`VocabularyPackSchema` in `src/vocabulary/pack.ts`.

- `generic.json` is authoritative — its top-level node types are the ones
  Slice 2's `bucket.ts` supports for filesystem persistence. A cross-slice test
  (`tests/vocabulary/integration.test.ts`) fails if the two drift.
- `python.json`, `typescript.json`, `vue.json` cover common architectural
  concepts for those stacks.
- `angular.json`, `c.json`, `cpp.json`, `rust.json`, `java.json`, `go.json`
  are seed packs. Expert domain fill-in (idiomatic node types + edge kinds
  per language) is a follow-up.

Packs are shipped in the npm tarball under `dist/packs/` (copied by
`scripts/copy-packs.mjs` after tsc emit).
```

### `tests/vocabulary/packs.test.ts`

Suite-wide validator that reads every JSON file and parses it through the schema.

```typescript
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHIPPED_PACKS } from "../../src/core/vocabulary.js";
import { VocabularyPackSchema } from "../../src/vocabulary/pack.js";

const PACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "packs");

describe("shipped vocabulary packs", () => {
  it("has exactly one JSON file per SHIPPED_PACKS entry", () => {
    const found = readdirSync(PACKS_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length))
      .sort();
    expect(found).toEqual([...SHIPPED_PACKS].sort());
  });

  for (const name of SHIPPED_PACKS) {
    it(`${name} pack validates against VocabularyPackSchema`, () => {
      const raw = readFileSync(join(PACKS_DIR, `${name}.json`), "utf8");
      const pack = VocabularyPackSchema.parse(JSON.parse(raw));
      expect(pack.name).toBe(name);
    });
  }
});
```

**Steps 1-3:** Author all 11 files. Run:
```bash
pnpm test tests/vocabulary/packs.test.ts
```
Expected: 11 tests pass (1 file-count + 10 per-pack validations).

**Step 4: Commit**
```
Author ten shipped vocabulary packs with schema validation
```

---

## Task 4: `loadPack(name)` (TDD)

Reads a bundled pack from disk relative to the compiled module and validates it. Callers get a typed `VocabularyPack`.

**Files:**
- Create: `src/vocabulary/loader.ts`
- Create: `tests/vocabulary/loader.test.ts`

**Step 1: Failing test**

Create `tests/vocabulary/loader.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { SHIPPED_PACKS } from "../../src/core/vocabulary.js";
import { loadPack } from "../../src/vocabulary/loader.js";

describe("loadPack", () => {
  it("loads the generic pack with the canonical top-level node types", async () => {
    const pack = await loadPack("generic");
    const topLevel = pack.nodeTypes.filter((n) => n.topLevel).map((n) => n.name);
    expect(topLevel.sort()).toEqual(
      ["component", "data-store", "external-service", "module"].sort(),
    );
  });

  it("loads every shipped pack without error", async () => {
    for (const name of SHIPPED_PACKS) {
      const pack = await loadPack(name);
      expect(pack.name).toBe(name);
    }
  });

  it("throws for an unknown pack name at runtime", async () => {
    await expect(
      // deliberately pass an invalid name to prove the schema catches it
      loadPack("cobol" as unknown as (typeof SHIPPED_PACKS)[number]),
    ).rejects.toThrow();
  });
});
```

**Step 2: Run FAIL** — module not found.

**Step 3: Implement**

Create `src/vocabulary/loader.ts`:
```typescript
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { PackNameSchema } from "../core/vocabulary.js";
import type { PackName } from "../core/vocabulary.js";
import { VocabularyPackSchema } from "./pack.js";
import type { VocabularyPack } from "./pack.js";

// Resolve packs relative to this module. When emitted to dist/vocabulary/loader.js,
// this yields dist/packs/. When run from source (vitest, ts-node), it yields src/packs/.
const PACKS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "packs");

export async function loadPack(name: PackName): Promise<VocabularyPack> {
  const validName = PackNameSchema.parse(name);
  const path = join(PACKS_DIR, `${validName}.json`);
  const raw = await readFile(path, "utf8");
  return VocabularyPackSchema.parse(JSON.parse(raw));
}

export function packsDirectory(): string {
  return PACKS_DIR;
}
```

**Step 4: Run PASS** — 3 tests.

**Step 5: Commit**
```
Add loadPack that reads bundled pack JSON with schema validation (TDD)
```

---

## Task 5: `resolveVocabulary(config)` (TDD)

Unions the active packs' types with the config's `customTypes`, reports duplicates across packs.

**Files:**
- Create: `src/vocabulary/resolve.ts`
- Create: `tests/vocabulary/resolve.test.ts`

**Step 1: Failing test**

Create `tests/vocabulary/resolve.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { resolveVocabulary } from "../../src/vocabulary/resolve.js";

describe("resolveVocabulary", () => {
  it("returns node and edge types from a single active pack", async () => {
    const resolved = await resolveVocabulary({ activePacks: ["generic"], customTypes: [] });
    expect(resolved.nodeTypes.has("component")).toBe(true);
    expect(resolved.nodeTypes.has("module")).toBe(true);
    expect(resolved.edgeTypes.has("depends-on")).toBe(true);
    expect(resolved.edgeTypes.has("calls")).toBe(true);
  });

  it("unions types across multiple active packs", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic", "typescript"],
      customTypes: [],
    });
    expect(resolved.nodeTypes.has("component")).toBe(true); // from generic
    expect(resolved.nodeTypes.has("interface")).toBe(true); // from typescript
  });

  it("adds custom node and edge types on top of the packs", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic"],
      customTypes: [
        { kind: "node", name: "gateway", attributes: [] },
        { kind: "edge", name: "authenticates", attributes: [] },
      ],
    });
    expect(resolved.nodeTypes.has("gateway")).toBe(true);
    expect(resolved.edgeTypes.has("authenticates")).toBe(true);
  });

  it("reports a collision when two packs declare the same node type", async () => {
    // generic has "component", angular also has "component" — verify collision detection
    const resolved = await resolveVocabulary({
      activePacks: ["generic", "angular"],
      customTypes: [],
    });
    expect(resolved.collisions).toContainEqual({
      kind: "node",
      name: "component",
      sources: ["generic", "angular"],
    });
  });

  it("reports a collision when a custom type shadows a pack type", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic"],
      customTypes: [{ kind: "node", name: "component", attributes: [] }],
    });
    expect(resolved.collisions).toContainEqual({
      kind: "node",
      name: "component",
      sources: ["generic", "custom"],
    });
  });

  it("preserves the first-seen definition when a collision occurs", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic", "angular"],
      customTypes: [],
    });
    // generic declares component with topLevel: true; angular does not
    expect(resolved.nodeTypes.get("component")?.topLevel).toBe(true);
  });
});
```

**Step 2: Run FAIL** — module not found.

**Step 3: Implement**

Create `src/vocabulary/resolve.ts`:
```typescript
import type { VocabularyConfig } from "../core/vocabulary.js";
import { loadPack } from "./loader.js";
import type { EdgeTypeDefinition, NodeTypeDefinition } from "./pack.js";

export interface Collision {
  kind: "node" | "edge";
  name: string;
  sources: string[];
}

export interface ResolvedVocabulary {
  nodeTypes: Map<string, NodeTypeDefinition>;
  edgeTypes: Map<string, EdgeTypeDefinition>;
  collisions: Collision[];
}

export async function resolveVocabulary(config: VocabularyConfig): Promise<ResolvedVocabulary> {
  const nodeTypes = new Map<string, NodeTypeDefinition>();
  const edgeTypes = new Map<string, EdgeTypeDefinition>();
  const nodeSources = new Map<string, string[]>();
  const edgeSources = new Map<string, string[]>();

  for (const packName of config.activePacks) {
    const pack = await loadPack(packName);
    for (const nodeType of pack.nodeTypes) {
      if (!nodeTypes.has(nodeType.name)) {
        nodeTypes.set(nodeType.name, nodeType);
      }
      nodeSources.set(nodeType.name, [...(nodeSources.get(nodeType.name) ?? []), packName]);
    }
    for (const edgeType of pack.edgeTypes) {
      if (!edgeTypes.has(edgeType.name)) {
        edgeTypes.set(edgeType.name, edgeType);
      }
      edgeSources.set(edgeType.name, [...(edgeSources.get(edgeType.name) ?? []), packName]);
    }
  }

  for (const custom of config.customTypes) {
    if (custom.kind === "node") {
      if (!nodeTypes.has(custom.name)) {
        nodeTypes.set(custom.name, { name: custom.name, topLevel: false, attributes: custom.attributes });
      }
      nodeSources.set(custom.name, [...(nodeSources.get(custom.name) ?? []), "custom"]);
    } else {
      if (!edgeTypes.has(custom.name)) {
        edgeTypes.set(custom.name, { name: custom.name, attributes: custom.attributes });
      }
      edgeSources.set(custom.name, [...(edgeSources.get(custom.name) ?? []), "custom"]);
    }
  }

  const collisions: Collision[] = [];
  for (const [name, sources] of nodeSources) {
    if (sources.length > 1) collisions.push({ kind: "node", name, sources });
  }
  for (const [name, sources] of edgeSources) {
    if (sources.length > 1) collisions.push({ kind: "edge", name, sources });
  }

  return { nodeTypes, edgeTypes, collisions };
}
```

**Step 4: Run PASS** — 6 tests.

**Step 5: Commit**
```
Add resolveVocabulary with duplicate detection across packs (TDD)
```

---

## Task 6: Cross-slice integration test (bucket ↔ generic pack)

Guards against drift between Slice 2's hard-coded `SUPPORTED_NODE_TYPES` and the generic pack's `topLevel` types.

**Files:**
- Create: `tests/vocabulary/integration.test.ts`

**Step 1: Test**

```typescript
import { describe, expect, it } from "vitest";
import { SUPPORTED_NODE_TYPES } from "../../src/storage/bucket.js";
import { loadPack } from "../../src/vocabulary/loader.js";

describe("bucket ↔ generic vocabulary pack", () => {
  it("SUPPORTED_NODE_TYPES matches the generic pack's topLevel types", async () => {
    const generic = await loadPack("generic");
    const genericTopLevel = generic.nodeTypes.filter((n) => n.topLevel).map((n) => n.name).sort();
    expect(genericTopLevel).toEqual([...SUPPORTED_NODE_TYPES].sort());
  });
});
```

**Step 2: Run**
```bash
pnpm test tests/vocabulary/integration.test.ts
```
Expected: PASS (both lists are `["component", "module", "external-service", "data-store"]`).

**Step 3: Commit**
```
Assert bucket types match generic pack topLevel (drift guard)
```

---

## Task 7: Ship the packs in the build output

`tsc` does not copy `.json` files. Add a tiny post-build script that copies `src/packs/*.json` to `dist/packs/*.json`, and wire it into `pnpm build`.

**Files:**
- Create: `scripts/copy-packs.mjs`
- Modify: `package.json`

**Step 1: Write the script**

Create `scripts/copy-packs.mjs`:
```javascript
#!/usr/bin/env node
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "src", "packs");
const dest = resolve(here, "..", "dist", "packs");

await mkdir(dest, { recursive: true });
const entries = await readdir(src);
let copied = 0;
for (const entry of entries) {
  if (!entry.endsWith(".json")) continue;
  await copyFile(join(src, entry), join(dest, entry));
  copied++;
}
process.stdout.write(`copied ${copied} pack(s) to ${dest}\n`);
```

**Step 2: Wire into the build**

Change `package.json`'s `build` script:
```json
    "build": "tsc -p tsconfig.build.json && node scripts/copy-packs.mjs",
```

**Step 3: Verify**
```bash
pnpm build
ls dist/packs
```
Expected: 10 JSON files (`generic.json` … `go.json`).

Also verify the build integration test still finds packs after build by running:
```bash
pnpm test tests/vocabulary/loader.test.ts
```
(Tests run from source, so they find `src/packs/` — this just confirms no regression.)

**Step 4: Commit**
```
Copy vocabulary packs to dist/packs during build
```

---

## Task 8: `src/vocabulary/index.ts` re-exports

**Files:**
- Create: `src/vocabulary/index.ts`

**Step 1: Write**
```typescript
export {
  EdgeTypeDefinitionSchema,
  NodeTypeDefinitionSchema,
  ViewTemplateSchema,
  VocabularyPackSchema,
} from "./pack.js";
export type {
  EdgeTypeDefinition,
  NodeTypeDefinition,
  ViewTemplate,
  VocabularyPack,
} from "./pack.js";

export { loadPack, packsDirectory } from "./loader.js";

export { resolveVocabulary } from "./resolve.js";
export type { Collision, ResolvedVocabulary } from "./resolve.js";
```

**Step 2: Verify**
```bash
pnpm typecheck && pnpm lint && pnpm test
```

**Step 3: Commit**
```
Re-export vocabulary API from src/vocabulary/index.ts
```

---

## Task 9: Publish `specifyr/vocabulary` subpath

**Files:**
- Modify: `package.json`

**Step 1: Extend `exports`**

Add a sibling entry to the existing `.` and `./storage`:
```json
    "./vocabulary": {
      "types": "./dist/vocabulary/index.d.ts",
      "import": "./dist/vocabulary/index.js"
    }
```

**Step 2: Confirm the tarball would include packs**

Run:
```bash
pnpm build
pnpm pack --pack-destination /tmp
tar -tzf /tmp/specifyr-0.1.0.tgz | grep 'packs/' | sort
```
Expected: 10 JSON files under `package/dist/packs/`.

Remove the tarball:
```bash
rm /tmp/specifyr-0.1.0.tgz
```

**Step 3: Full gate**
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0. Test count baseline is 75; Slice 4 adds:
- Task 2: 6 tests
- Task 3: 11 tests (1 count + 10 validations)
- Task 4: 3 tests
- Task 5: 6 tests
- Task 6: 1 test
= 27 new tests → total **102**.

**Step 4: Commit**
```
Publish specifyr/vocabulary subpath in package exports
```

---

## Task 10: README status bump

**Files:**
- Modify: `README.md`

**Step 1: Extend the Status section**

Insert before `Slice 4+ (planned)`:
```markdown
Slice 4 (current): vocabulary packs v1 — ten shipped language packs + loader + resolver. ✅
Slice 5+ (planned): rules evaluator, Nitro editor, MCP endpoint, extractors.
```

**Step 2: Commit**
```
Update README with Slice 4 status
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
All exit 0. Test count **102**.

**Step 2: Push**
```bash
git push -u origin ts/slice-4-vocabulary-packs
```

**Step 3: Open PR**
```bash
gh pr create --base main --head ts/slice-4-vocabulary-packs \
  --title "TS rewrite Slice 4: vocabulary packs v1" \
  --body-file - <<'EOF'
## Summary

Slice 4 of the TypeScript rewrite tracked in
[docs/plans/2026-09-06-specifyr-ts-slice-4-vocabulary-packs.md](docs/plans/2026-09-06-specifyr-ts-slice-4-vocabulary-packs.md).

Ships the ten built-in vocabulary packs plus the loader/resolver layer they will feed:

- `src/packs/*.json` — 10 shipped packs (`generic`, `python`, `typescript`, `vue`, `angular`, `c`, `cpp`, `rust`, `java`, `go`), each conforming to `VocabularyPackSchema`.
- `generic` is authoritative — its `topLevel` node types are exactly Slice 2's `SUPPORTED_NODE_TYPES`. A drift-guard test in `tests/vocabulary/integration.test.ts` fails if the two lists diverge.
- `python`, `typescript`, `vue` cover common architectural concepts for those stacks.
- The other six are minimal seeds with a README note that expert domain fill-in is a follow-up.
- `loadPack(name)` reads a bundled pack from `dist/packs/` (or `src/packs/` when running from source).
- `resolveVocabulary(config)` unions active packs + custom types with duplicate detection.
- New subpath export `specifyr/vocabulary`.
- `scripts/copy-packs.mjs` copies `src/packs/*.json` to `dist/packs/*.json` after tsc emit (tsc does not copy JSON).

**Non-goals for this slice:**
- Refactoring Slice 2's `bucket.ts` to consult the vocabulary at runtime (deferred; drift-guard test protects us in the meantime)
- User-authored packs / pack discovery on disk
- View templates content (schema allows the field; empty in every pack v1)
- CLI wiring (`specifyr vocab list` — later slice)
- Vocabulary-driven validation of `Node.type` in the Model (later slice)

## Test plan

- [x] `pnpm install --frozen-lockfile` clean
- [x] `pnpm build` clean; `dist/packs/` contains 10 JSON files
- [x] `pnpm lint`, `pnpm typecheck` clean
- [x] `pnpm test` — 102 tests across all suites pass (baseline 75 + 27 new)
- [x] `pnpm pack` produces a tarball; `tar -tzf ... | grep packs/` shows all 10 files under `package/dist/packs/`
- [x] Cross-slice test asserts `SUPPORTED_NODE_TYPES` matches `generic.topLevel`

## Notes for reviewer

- The scope decision to leave `bucket.ts` hard-coded is deliberate. The drift-guard test replaces the runtime coupling for now.
- Pack contents beyond `generic` are opinionated first-drafts. Follow-up PRs from language-experts will refine them.
EOF
```

**Step 4: Wait**

Do not merge until CodeRabbit has reviewed and every valid finding is addressed.

---

## Notes for the executing agent

- **DRY:** `NodeTypeDefinitionSchema` and `EdgeTypeDefinitionSchema` both take an `attributes` array via `AttributeDefinitionSchema` from Slice 1 — do NOT redeclare attribute shape.
- **YAGNI:** No pack precedence rules. No pack versioning. No pack signing. No enable/disable-at-runtime API — Slice 4 is a static loader.
- **Import discipline:** every local import uses `.js` extension (Slice 1 reviewer contract).
- **JSON files at runtime:** `loadPack` resolves relative to `import.meta.url`. From source (vitest, tsx) it finds `src/packs/`; from compiled `dist/vocabulary/loader.js` it finds `dist/packs/`. The build script guarantees the latter exists.
- **TDD:** Tasks 2, 4, 5 are strict test-first. Task 3 authors data + suite validation. Task 6 is one drift-guard assertion. Tasks 7-10 are wiring/config.
- **Main is protected**, work on `ts/slice-4-vocabulary-packs`, land via PR, **CR before merge**.
- **Do not touch Slice 2's `bucket.ts`.** The drift-guard replaces the refactor for now.
