# specifyr TS Rewrite — Slice 1: Repo Skeleton + Core Model

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rip out the Python MVP and stand up the TypeScript project skeleton (single npm package `specifyr`, Node 20+, pnpm) with the core Zod schemas (`Node`, `Class`, `Edge`, `Model`, `Vocabulary`) covered by unit tests. Foundation only — no CLI, no Nitro, no UI.

**Architecture:** Single npm package. Root `package.json` with pnpm as package manager. Layout follows design doc §11: `src/core/`, `src/cli/`, `src/adapters/`, etc. — Slice 1 populates only `src/core/`. Toolchain is Biome (lint+format in one), Vitest (tests), tsc (typecheck), tsup (bundle in later slices), citty (CLI in later slice). Zod for schema definitions.

**Tech Stack:** TypeScript 5, Zod 4, Vitest, Biome, pnpm 9, Node 20. GitHub Actions replaces the current Python `test.yml`.

**Reference:**
- Full design doc: [docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md)
- §5 Decision summary (stack), §7.1 Common schema (Zod), §7.2 Vocabulary system, §11 Package layout & testing strategy.

**Branch:** Work on a new branch `ts/slice-1-skeleton`. Do not push to `main` — `main` is protected. Open a PR at the end.

**Non-goals for Slice 1:** Nitro server, Vue Flow, shadcn-vue, Nuxt frontend, MCP endpoint, CLI commands beyond a stub, SOLL storage, rules evaluator, extractors, drift compute. Those are later slices.

---

## Task 1: Create the working branch

**Files:**
- Modify: git ref `HEAD`

**Step 1: Confirm you are on a clean main**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean` and branch is `main` matching `origin/main`.

**Step 2: Create and switch to the slice branch**

Run: `git switch -c ts/slice-1-skeleton`
Expected: `Zu neuem Branch 'ts/slice-1-skeleton' gewechselt` (or English equivalent).

**Step 3: Commit checkpoint (empty)**

No commit yet — the branch is created, work begins in Task 2.

---

## Task 2: Delete the Python MVP

**Files:**
- Delete: `src/specifyr/` (whole tree)
- Delete: `tests/` (whole tree — will be rebuilt for TS)
- Delete: `benchmarks/` (Python-only artifact set; ported later as TS golden corpus)
- Delete: `packs/` (Python-format packs; TS packs come later)
- Delete: `integrations/` (Python-format adapters)
- Delete: `schemas/` (Python-emitted JSON schemas; TS defines schemas via Zod)
- Delete: `pyproject.toml`
- Delete: `.github/workflows/test.yml`
- Modify: `.gitignore` (drop Python-specific lines)

**Step 1: List everything you are about to delete**

Run:
```bash
ls -la src/specifyr tests benchmarks packs integrations schemas pyproject.toml .github/workflows/test.yml
```
Expected: all listed as present. If any is already gone, note it — do not fail.

**Step 2: Delete the Python tree**

Run:
```bash
git rm -r src/specifyr tests benchmarks packs integrations schemas pyproject.toml .github/workflows/test.yml
```
Expected: `rm 'path/...'` lines for every file. No errors.

**Step 3: Clean the .gitignore**

Open [.gitignore](../../.gitignore) and remove the Python-specific lines. Final content should be exactly:
```
node_modules/
dist/
.nuxt/
.output/
coverage/
.vitest-cache/
specifyr-out/
graphify-out/cache/
graphify-out/cost.json
.coderabbit_reviews/
```

**Step 4: Verify the tree**

Run: `ls`
Expected: only `.git`, `.github`, `.gitignore`, `LICENSE`, `README.md`, `docs/` remain. `src/` is gone (will be re-created in Task 4).

**Step 5: Commit**

```bash
git add -A
git commit -m "Remove Python MVP ahead of TypeScript rewrite

Slice 1 of the TS rewrite deletes the Python package, tests,
benchmarks, integrations, schemas, and pyproject to make room for
the design-doc layout. The MVP is preserved in git history; a TS
port of the rules evaluator and the golden corpus lands in a later
slice."
```

---

## Task 3: Add the Node toolchain pins

**Files:**
- Create: `.nvmrc`
- Create: `.npmrc`
- Create: `package.json`

**Step 1: Write `.nvmrc`**

Content (exactly one line):
```
20
```

**Step 2: Write `.npmrc`**

Content:
```
engine-strict=true
save-exact=true
```

**Step 3: Write `package.json`**

Content:
```json
{
  "name": "specifyr",
  "version": "0.1.0",
  "description": "Visual architecture editor with SOLL/PLAN/IST drift-check, AI-assisted via MCP",
  "license": "Apache-2.0",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "packageManager": "pnpm@9.15.0",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./src/core/index.ts",
      "import": "./src/core/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "4.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "@types/node": "20.14.10",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

Note: exact versions are pinned. If any version is unavailable at install time, upgrade to the closest published patch and record it in the commit message — do NOT loosen the version range.

**Step 4: Install dependencies**

Run:
```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
```
Expected: `pnpm install` completes without errors and creates `node_modules/` and `pnpm-lock.yaml`.

**Step 5: Commit**

```bash
git add .nvmrc .npmrc package.json pnpm-lock.yaml
git commit -m "Add TypeScript toolchain pins (Node 20, pnpm, Zod, Vitest, Biome)"
```

---

## Task 4: Add tsconfig and the empty `src/core/` module

**Files:**
- Create: `tsconfig.json`
- Create: `src/core/index.ts` (initially empty re-export)

**Step 1: Write `tsconfig.json`**

Content:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

**Step 2: Create the stub `src/core/index.ts`**

Content:
```typescript
export {};
```
(Real exports come in Tasks 7-11.)

**Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: exit code 0, no output.

**Step 4: Commit**

```bash
git add tsconfig.json src/core/index.ts
git commit -m "Add strict tsconfig and empty core module stub"
```

---

## Task 5: Wire Vitest with a sanity test

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/sanity.test.ts`

**Step 1: Write `vitest.config.ts`**

Content:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      enabled: false,
    },
  },
});
```

**Step 2: Write the failing sanity test**

Create `tests/sanity.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

describe("toolchain sanity", () => {
  it("runs a passing assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 3: Run tests**

Run: `pnpm test`
Expected: 1 test file, 1 test passed.

**Step 4: Commit**

```bash
git add vitest.config.ts tests/sanity.test.ts
git commit -m "Add Vitest with a sanity test"
```

---

## Task 6: Wire Biome for lint + format

**Files:**
- Create: `biome.jsonc`

**Step 1: Write `biome.jsonc`**

Content:
```jsonc
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["node_modules", "dist", ".nuxt", ".output", "coverage", "pnpm-lock.yaml"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "style": {
        "useImportType": "error",
        "useNodejsImportProtocol": "error"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

**Step 2: Format existing sources**

Run: `pnpm lint:fix`
Expected: any files that need formatting get rewritten; exit code 0.

**Step 3: Verify lint is clean**

Run: `pnpm lint`
Expected: `Checked N files ... No fixes applied.` exit code 0.

**Step 4: Commit**

```bash
git add biome.jsonc src tests
git commit -m "Add Biome for lint and format"
```

---

## Task 7: Zod — `Class` schema (TDD)

**Files:**
- Create: `src/core/schemas.ts`
- Create: `tests/core/schemas.test.ts`

`Class` is the leaf — no other schema depends on nothing else, so build it first, then work up.

Reference (design doc §7.1):
> `Class`: `{ name, methods[], attributes[] }`

**Step 1: Write the failing test**

Create `tests/core/schemas.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { ClassSchema } from "../../src/core/schemas.ts";

describe("ClassSchema", () => {
  it("accepts a class with methods and attributes", () => {
    const parsed = ClassSchema.parse({
      name: "AuthService",
      methods: [{ name: "login" }, { name: "logout" }],
      attributes: [{ name: "sessionTimeoutMs", type: "number" }],
    });
    expect(parsed.name).toBe("AuthService");
    expect(parsed.methods).toHaveLength(2);
    expect(parsed.attributes[0]?.type).toBe("number");
  });

  it("rejects a class with a non-string name", () => {
    expect(() => ClassSchema.parse({ name: 42, methods: [], attributes: [] })).toThrow();
  });

  it("defaults methods and attributes to empty arrays when omitted", () => {
    const parsed = ClassSchema.parse({ name: "Empty" });
    expect(parsed.methods).toEqual([]);
    expect(parsed.attributes).toEqual([]);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm test tests/core/schemas.test.ts`
Expected: FAIL — module `../../src/core/schemas.ts` not found or `ClassSchema` not exported.

**Step 3: Implement the minimal schema**

Create `src/core/schemas.ts`:
```typescript
import { z } from "zod";

export const MethodSchema = z.object({
  name: z.string().min(1),
});

export const AttributeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1).optional(),
});

export const ClassSchema = z.object({
  name: z.string().min(1),
  methods: z.array(MethodSchema).default([]),
  attributes: z.array(AttributeSchema).default([]),
});

export type Class = z.infer<typeof ClassSchema>;
```

**Step 4: Run the test to verify it passes**

Run: `pnpm test tests/core/schemas.test.ts`
Expected: PASS, 3 tests.

**Step 5: Commit**

```bash
git add src/core/schemas.ts tests/core/schemas.test.ts
git commit -m "Add Zod Class schema (TDD)"
```

---

## Task 8: Zod — `Node` schema (TDD)

**Files:**
- Modify: `src/core/schemas.ts`
- Modify: `tests/core/schemas.test.ts`

Reference (design doc §7.1):
> `Node`: `{ id, type, name, description?, path?, classes[]?, ...vocabAttrs }`
> `type` values come from active vocabulary packs, not fixed enum.

**Step 1: Add failing tests**

Append to `tests/core/schemas.test.ts`:
```typescript
import { NodeSchema } from "../../src/core/schemas.ts";

describe("NodeSchema", () => {
  it("accepts a minimal node", () => {
    const parsed = NodeSchema.parse({
      id: "auth",
      type: "component",
      name: "Auth",
    });
    expect(parsed.id).toBe("auth");
    expect(parsed.classes).toEqual([]);
  });

  it("carries through optional description, path, and classes", () => {
    const parsed = NodeSchema.parse({
      id: "auth",
      type: "component",
      name: "Auth",
      description: "handles session lifecycle",
      path: "src/auth/",
      classes: [{ name: "AuthService" }],
    });
    expect(parsed.description).toBe("handles session lifecycle");
    expect(parsed.classes[0]?.name).toBe("AuthService");
  });

  it("preserves extra vocabulary-driven attributes", () => {
    const parsed = NodeSchema.parse({
      id: "gateway",
      type: "gateway",
      name: "API Gateway",
      protocol: "http",
    });
    expect((parsed as Record<string, unknown>).protocol).toBe("http");
  });

  it("rejects a node id that violates the safe-path-segment rule", () => {
    expect(() =>
      NodeSchema.parse({ id: "../escape", type: "component", name: "x" }),
    ).toThrow();
  });

  it("rejects an id starting with a hyphen", () => {
    expect(() => NodeSchema.parse({ id: "-bad", type: "component", name: "x" })).toThrow();
  });
});
```

**Step 2: Run tests to verify the new ones fail**

Run: `pnpm test tests/core/schemas.test.ts`
Expected: FAIL — `NodeSchema` not exported. Existing `ClassSchema` tests still pass.

**Step 3: Extend `src/core/schemas.ts`**

Append (after `ClassSchema`):
```typescript
export const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const NodeSchema = z
  .object({
    id: z.string().regex(NODE_ID_PATTERN, {
      message: "node id must match ^[a-z0-9][a-z0-9_-]{0,63}$",
    }),
    type: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    path: z.string().optional(),
    classes: z.array(ClassSchema).default([]),
  })
  .catchall(z.unknown());

export type Node = z.infer<typeof NodeSchema>;
```

**Step 4: Run tests**

Run: `pnpm test tests/core/schemas.test.ts`
Expected: PASS, all Node + Class tests green.

**Step 5: Commit**

```bash
git add src/core/schemas.ts tests/core/schemas.test.ts
git commit -m "Add Zod Node schema with safe-path-segment id validation (TDD)"
```

---

## Task 9: Zod — `Edge` schema (TDD)

**Files:**
- Modify: `src/core/schemas.ts`
- Modify: `tests/core/schemas.test.ts`

Reference (design doc §7.1):
> `Edge`: `{ id, from, to, type }` — types include `depends-on`, `contains`, `implements`, `exposes`, `calls`, `imports`, `reads-from`, `writes-to`, `passes-through`, and pack-specific additions.

Edge `type` is open-ended (pack-driven) just like Node `type`.

**Step 1: Add failing tests**

Append to `tests/core/schemas.test.ts`:
```typescript
import { EdgeSchema } from "../../src/core/schemas.ts";

describe("EdgeSchema", () => {
  it("accepts a well-formed edge", () => {
    const parsed = EdgeSchema.parse({
      id: "edge-1",
      from: "auth",
      to: "users",
      type: "depends-on",
    });
    expect(parsed.from).toBe("auth");
  });

  it("rejects an edge missing from/to", () => {
    expect(() => EdgeSchema.parse({ id: "edge-1", type: "depends-on" })).toThrow();
  });

  it("rejects an edge whose `from` violates the id pattern", () => {
    expect(() =>
      EdgeSchema.parse({ id: "edge-1", from: "../nope", to: "users", type: "calls" }),
    ).toThrow();
  });
});
```

**Step 2: Run tests to verify failures**

Run: `pnpm test tests/core/schemas.test.ts`
Expected: FAIL — `EdgeSchema` not exported.

**Step 3: Extend `src/core/schemas.ts`**

Append:
```typescript
export const EdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().regex(NODE_ID_PATTERN, {
    message: "edge.from must match the node id pattern",
  }),
  to: z.string().regex(NODE_ID_PATTERN, {
    message: "edge.to must match the node id pattern",
  }),
  type: z.string().min(1),
});

export type Edge = z.infer<typeof EdgeSchema>;
```

**Step 4: Run tests**

Run: `pnpm test tests/core/schemas.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/schemas.ts tests/core/schemas.test.ts
git commit -m "Add Zod Edge schema (TDD)"
```

---

## Task 10: Zod — `Model` schema (TDD)

**Files:**
- Modify: `src/core/schemas.ts`
- Modify: `tests/core/schemas.test.ts`

Reference (design doc §7.1):
> `Model`: `{ nodes[], edges[], meta: { source: "soll" | "plan" | "ist", generatedAt? } }`

Add cross-collection validation: `nodes[].id` must be unique, and every `edges[].from`/`.to` must reference a known node.

**Step 1: Add failing tests**

Append:
```typescript
import { ModelSchema } from "../../src/core/schemas.ts";

describe("ModelSchema", () => {
  it("accepts a well-formed SOLL model", () => {
    const parsed = ModelSchema.parse({
      nodes: [
        { id: "auth", type: "component", name: "Auth" },
        { id: "users", type: "component", name: "Users" },
      ],
      edges: [{ id: "e1", from: "auth", to: "users", type: "depends-on" }],
      meta: { source: "soll" },
    });
    expect(parsed.meta.source).toBe("soll");
  });

  it("rejects duplicate node ids", () => {
    expect(() =>
      ModelSchema.parse({
        nodes: [
          { id: "auth", type: "component", name: "Auth" },
          { id: "auth", type: "component", name: "Auth 2" },
        ],
        edges: [],
        meta: { source: "soll" },
      }),
    ).toThrow(/duplicate node id/);
  });

  it("rejects an edge whose from does not reference a known node", () => {
    expect(() =>
      ModelSchema.parse({
        nodes: [{ id: "auth", type: "component", name: "Auth" }],
        edges: [{ id: "e1", from: "ghost", to: "auth", type: "depends-on" }],
        meta: { source: "soll" },
      }),
    ).toThrow(/edge.*ghost/);
  });

  it("rejects an unknown meta.source", () => {
    expect(() =>
      ModelSchema.parse({ nodes: [], edges: [], meta: { source: "unknown" } }),
    ).toThrow();
  });
});
```

**Step 2: Run tests to verify failures**

Run: `pnpm test tests/core/schemas.test.ts`
Expected: FAIL — `ModelSchema` not exported.

**Step 3: Extend `src/core/schemas.ts`**

Append:
```typescript
export const MODEL_SOURCES = ["soll", "plan", "ist"] as const;

export const ModelMetaSchema = z.object({
  source: z.enum(MODEL_SOURCES),
  generatedAt: z.string().datetime().optional(),
});

export const ModelSchema = z
  .object({
    nodes: z.array(NodeSchema).default([]),
    edges: z.array(EdgeSchema).default([]),
    meta: ModelMetaSchema,
  })
  .superRefine((model, ctx) => {
    const ids = new Set<string>();
    for (const node of model.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: `duplicate node id: ${node.id}`,
        });
      }
      ids.add(node.id);
    }
    for (const [index, edge] of model.edges.entries()) {
      if (!ids.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "from"],
          message: `edge references unknown node: ${edge.from}`,
        });
      }
      if (!ids.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "to"],
          message: `edge references unknown node: ${edge.to}`,
        });
      }
    }
  });

export type Model = z.infer<typeof ModelSchema>;
export type ModelSource = (typeof MODEL_SOURCES)[number];
```

**Step 4: Run tests**

Run: `pnpm test tests/core/schemas.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/schemas.ts tests/core/schemas.test.ts
git commit -m "Add Zod Model schema with cross-collection integrity checks (TDD)"
```

---

## Task 11: Zod — `Vocabulary` schema (TDD)

**Files:**
- Create: `src/core/vocabulary.ts`
- Create: `tests/core/vocabulary.test.ts`

Reference (design doc §7.2). Shape target:
```json
{
  "activePacks": ["generic", "typescript", "vue", "python"],
  "customTypes": [
    {
      "kind": "node",
      "name": "gateway",
      "attributes": [
        { "name": "protocol", "type": "enum", "allowedValues": ["http", "grpc", "websocket"] }
      ]
    }
  ]
}
```

Shipped v1 packs: `generic`, `python`, `typescript`, `vue`, `angular`, `c`, `cpp`, `rust`, `java`, `go`.

**Step 1: Write the failing test**

Create `tests/core/vocabulary.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { VocabularyConfigSchema } from "../../src/core/vocabulary.ts";

describe("VocabularyConfigSchema", () => {
  it("accepts a minimal config with only active packs", () => {
    const parsed = VocabularyConfigSchema.parse({
      activePacks: ["generic", "typescript"],
    });
    expect(parsed.customTypes).toEqual([]);
  });

  it("accepts a custom node type with an enum attribute", () => {
    const parsed = VocabularyConfigSchema.parse({
      activePacks: ["generic"],
      customTypes: [
        {
          kind: "node",
          name: "gateway",
          attributes: [
            { name: "protocol", type: "enum", allowedValues: ["http", "grpc"] },
          ],
        },
      ],
    });
    const [custom] = parsed.customTypes;
    expect(custom?.name).toBe("gateway");
    if (custom?.attributes[0]?.type === "enum") {
      expect(custom.attributes[0].allowedValues).toContain("http");
    } else {
      throw new Error("expected an enum attribute");
    }
  });

  it("rejects a pack name that is not shipped", () => {
    expect(() =>
      VocabularyConfigSchema.parse({ activePacks: ["cobol"] }),
    ).toThrow();
  });

  it("rejects an enum attribute without allowedValues", () => {
    expect(() =>
      VocabularyConfigSchema.parse({
        activePacks: ["generic"],
        customTypes: [
          {
            kind: "node",
            name: "gateway",
            attributes: [{ name: "protocol", type: "enum" }],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a duplicate custom-type name inside the same kind", () => {
    expect(() =>
      VocabularyConfigSchema.parse({
        activePacks: ["generic"],
        customTypes: [
          { kind: "node", name: "gateway", attributes: [] },
          { kind: "node", name: "gateway", attributes: [] },
        ],
      }),
    ).toThrow(/duplicate/);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm test tests/core/vocabulary.test.ts`
Expected: FAIL — `../../src/core/vocabulary.ts` not found.

**Step 3: Implement `src/core/vocabulary.ts`**

Content:
```typescript
import { z } from "zod";

export const SHIPPED_PACKS = [
  "generic",
  "python",
  "typescript",
  "vue",
  "angular",
  "c",
  "cpp",
  "rust",
  "java",
  "go",
] as const;

export const PackNameSchema = z.enum(SHIPPED_PACKS);

const ScalarAttributeSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean"]),
});

const EnumAttributeSchema = z.object({
  name: z.string().min(1),
  type: z.literal("enum"),
  allowedValues: z.array(z.string().min(1)).min(1),
});

export const AttributeDefinitionSchema = z.discriminatedUnion("type", [
  ScalarAttributeSchema.extend({ type: z.literal("string") }),
  ScalarAttributeSchema.extend({ type: z.literal("number") }),
  ScalarAttributeSchema.extend({ type: z.literal("boolean") }),
  EnumAttributeSchema,
]);

export const CustomTypeSchema = z.object({
  kind: z.enum(["node", "edge"]),
  name: z.string().min(1),
  attributes: z.array(AttributeDefinitionSchema).default([]),
});

export const VocabularyConfigSchema = z
  .object({
    activePacks: z.array(PackNameSchema).min(1),
    customTypes: z.array(CustomTypeSchema).default([]),
  })
  .superRefine((config, ctx) => {
    const seen = new Map<string, Set<string>>();
    for (const [index, custom] of config.customTypes.entries()) {
      const perKind = seen.get(custom.kind) ?? new Set<string>();
      if (perKind.has(custom.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customTypes", index, "name"],
          message: `duplicate custom ${custom.kind} type: ${custom.name}`,
        });
      }
      perKind.add(custom.name);
      seen.set(custom.kind, perKind);
    }
  });

export type PackName = z.infer<typeof PackNameSchema>;
export type VocabularyConfig = z.infer<typeof VocabularyConfigSchema>;
export type CustomType = z.infer<typeof CustomTypeSchema>;
```

**Step 4: Run tests**

Run: `pnpm test tests/core/vocabulary.test.ts`
Expected: PASS, 5 tests.

**Step 5: Commit**

```bash
git add src/core/vocabulary.ts tests/core/vocabulary.test.ts
git commit -m "Add Zod vocabulary config schema with pack + custom-type validation (TDD)"
```

---

## Task 12: Wire the `src/core/index.ts` re-exports

**Files:**
- Modify: `src/core/index.ts`

**Step 1: Replace the stub with real re-exports**

Content:
```typescript
export {
  AttributeSchema,
  ClassSchema,
  EdgeSchema,
  MethodSchema,
  ModelMetaSchema,
  ModelSchema,
  MODEL_SOURCES,
  NODE_ID_PATTERN,
  NodeSchema,
  type Class,
  type Edge,
  type Model,
  type ModelSource,
  type Node,
} from "./schemas.ts";

export {
  AttributeDefinitionSchema,
  CustomTypeSchema,
  PackNameSchema,
  SHIPPED_PACKS,
  VocabularyConfigSchema,
  type CustomType,
  type PackName,
  type VocabularyConfig,
} from "./vocabulary.ts";
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: exit code 0.

**Step 3: Verify the full suite**

Run: `pnpm test`
Expected: 3 test files, all tests pass (sanity + schemas + vocabulary).

**Step 4: Verify lint**

Run: `pnpm lint`
Expected: exit code 0.

**Step 5: Commit**

```bash
git add src/core/index.ts
git commit -m "Re-export core schemas from src/core/index.ts"
```

---

## Task 13: Replace the CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Write the workflow**

Content:
```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Replace Python CI with Node/pnpm ci workflow"
```

---

## Task 14: Rewrite the README for the TS project

**Files:**
- Modify: `README.md`

**Step 1: Replace the README**

Content:
```markdown
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "Rewrite README for the TypeScript project"
```

---

## Task 15: Final green-checkpoint locally

**Step 1: Verify every gate**

Run each in order:
```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```
Expected: all four exit with code 0.

**Step 2: Push the branch**

Run: `git push -u origin ts/slice-1-skeleton`
Expected: branch created on remote; no error.

**Step 3: Open a PR against main**

Run:
```bash
gh pr create --base main --head ts/slice-1-skeleton \
  --title "TS rewrite Slice 1: repo skeleton + core Zod model" \
  --body-file - <<'EOF'
## Summary

Slice 1 of the TypeScript rewrite tracked in
[docs/plans/2026-09-06-specifyr-ts-slice-1-skeleton-core-model.md](docs/plans/2026-09-06-specifyr-ts-slice-1-skeleton-core-model.md).

Removes the Python MVP and stands up:
- Node 20 / pnpm 9 / TypeScript 5 toolchain
- Biome (lint + format), Vitest, strict tsconfig
- `src/core/` with Zod schemas for `Node`, `Class`, `Edge`, `Model`, and the
  vocabulary config (packs + custom types), all TDD-covered
- CI workflow (lint + typecheck + test on Node 20)

**Non-goals for this slice:** Nitro server, Vue Flow, shadcn-vue, Nuxt frontend,
MCP endpoint, CLI commands, SOLL file storage, rules evaluator. Those land in
later slices.

## Test plan

- [x] `pnpm install --frozen-lockfile` clean
- [x] `pnpm lint` clean
- [x] `pnpm typecheck` clean
- [x] `pnpm test` — all Vitest suites pass
- [x] CI runs the same four commands on Node 20
EOF
```
Expected: PR URL printed. Wait for CodeRabbit to review before merging (see memory: `CR before merge`).

**Step 4: Restore main pointer locally after PR merge (later)**

After the PR merges on GitHub, sync locally:
```bash
git switch main
git pull --ff-only
git branch -D ts/slice-1-skeleton
git push origin --delete ts/slice-1-skeleton
```

---

## Notes for the executing agent

- **DRY:** re-use `NODE_ID_PATTERN` for node ids and edge `from`/`to`. Do not duplicate the regex.
- **YAGNI:** do not add anything not called for in this plan. No CLI, no config loader, no file I/O in Slice 1. If a task feels "too small" resist expanding it — later slices depend on this being minimal.
- **TDD:** for every schema task, write the failing tests first, watch them fail, then implement. Do not skip the run-to-fail step.
- **Frequent commits:** one commit per task as written. Do not batch task 7-11 into one commit.
- **Do not push to main:** main is protected. All work stays on `ts/slice-1-skeleton` and lands via PR.
- **CR before merge:** per user memory, wait for CodeRabbit to review the PR and address every valid finding before merging.
- **Zod version:** the plan pins Zod 4. If the API differs from what is written here (e.g., `z.ZodIssueCode.custom` moved), adjust the call sites but keep the semantics — do not downgrade to Zod 3.
