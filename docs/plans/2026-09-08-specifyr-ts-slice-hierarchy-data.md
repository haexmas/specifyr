# Slice Hierarchy Data Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Lay the data foundation for the Explorer tree + nested canvas
redesign (see `docs/plans/2026-09-08-specifyr-ts-ist-hierarchy-design.md`):
symbol nodes carry a `path` back to their file, and a pure `buildHierarchy()`
function turns any flat node list into a `Folder → File → Symbol` tree. No UI
changes in this slice — the tree/canvas consume this in later slices.

**Architecture:** One-line extractor change (`extract-source.ts` sets `path`
on symbol nodes it emits). One new view-agnostic composable,
`buildHierarchy(nodes)`, that groups by `path`/`name` alone — it does not
know or care whether nodes came from SOLL, PLAN, or IST.

**Tech Stack:** TypeScript, Vitest (TDD), existing `Node` Zod schema
(`src/core/schemas.ts`) — `path` is already optional there, no schema change.

**Non-goals (deferred to later slices per the design doc):**
- Explorer tree UI, nested canvas wrapper nodes, edge aggregation, hybrid
  layout, `selectedNodeId` sync — all later slices.
- Expand/collapse state — doesn't exist yet; `buildHierarchy` returns the
  full static tree, unaware of any UI expand state.
- PLAN view itself (endpoint/storage) — not built; `buildHierarchy` just
  doesn't hard-code SOLL/IST so PLAN can use it later.

---

## Task 1: Branch + plan doc

**Files:**
- Create: `docs/plans/2026-09-08-specifyr-ts-slice-hierarchy-data.md` (this file)

```bash
git add docs/plans/2026-09-08-specifyr-ts-slice-hierarchy-data.md
git commit -m "Add Slice Hierarchy Data plan: path field + buildHierarchy"
```

---

## Task 2: Extractor sets `path` on symbol nodes (TDD)

**Files:**
- Modify: `src/extractors/typescript/extract-source.ts`
- Modify: `tests/extractors/typescript/extract-source.test.ts`

**Change:** In `extractSourceFromTree`, the symbol-node push
(`nodes.push({ id: ..., type: emittedType, name, classes: [] })`, around line
59) gains a `path: relativePath` field. The module-node push (line 37-42) is
**not** changed — a module's path is already its `name`; adding a redundant
`path` there is explicitly not wanted (design doc: "module nodes already
carry their path as `name`", framed as the reason NOT to duplicate it).

**Step 1: Write failing tests** (append to `extract-source.test.ts`, same
style as the existing tests — `describe("extractSource")` block already
there):

```typescript
it("sets path on a symbol node to the file's relative path", async () => {
  const nodes = await extractSource({
    relativePath: "src/auth.ts",
    source: "export class AuthService {}\n",
  });
  const classNode = nodes.find((n) => n.type === "class");
  expect(classNode?.path).toBe("src/auth.ts");
});

it("sets path on every symbol type in a file", async () => {
  const source = `
    export interface User {}
    export type UserId = string;
    export enum Role { admin, user }
    export function login() {}
  `;
  const nodes = await extractSource({ relativePath: "src/all.ts", source });
  const symbols = nodes.filter((n) => n.type !== "module");
  expect(symbols).toHaveLength(4);
  for (const symbol of symbols) {
    expect(symbol.path).toBe("src/all.ts");
  }
});

it("does not set path on the module node itself", async () => {
  const nodes = await extractSource({
    relativePath: "src/auth.ts",
    source: "export class AuthService {}\n",
  });
  const moduleNode = nodes.find((n) => n.type === "module");
  expect(moduleNode?.path).toBeUndefined();
});
```

**Step 2: Run, confirm fail**

```bash
pnpm test tests/extractors/typescript/extract-source.test.ts
```

Expect the three new tests to fail (`path` is `undefined` on symbol nodes
today).

**Step 3: Implement** — add `path: relativePath` to the symbol-node object
literal in `extractSourceFromTree`. One line.

**Step 4: Run, confirm pass**

```bash
pnpm test tests/extractors/typescript/extract-source.test.ts
```

All tests in the file green, including the 3 new ones and all pre-existing
ones (pre-existing tests don't assert on `path`, so they're unaffected by
this additive change).

**Step 5: Also run the full extractor suite** — `extract.test.ts` builds full
models via `extractIst`; confirm nothing there asserts an exact node shape
that a new `path` field would break:

```bash
pnpm test tests/extractors/typescript/
```

**Step 6: Commit**

```bash
git add src/extractors/typescript/extract-source.ts tests/extractors/typescript/extract-source.test.ts
git commit -m "Set path on IST symbol nodes for hierarchy grouping (TDD)"
```

---

## Task 3: `buildHierarchy` composable (TDD)

**Files:**
- Create: `frontend/composables/build-hierarchy.ts`
- Test: `tests/frontend/build-hierarchy.test.ts`

**Contract:**

```typescript
import type { Node } from "specifyr";

export type HierarchyNodeKind = "folder" | "file" | "symbol";

export interface HierarchyNode {
  kind: HierarchyNodeKind;
  /** Stable id. Real Node id when selectable; synthesized otherwise. */
  id: string;
  /** Display label — folder/file segment name, or the node's own name for symbols. */
  label: string;
  /** True when a real Node backs this entry (module or symbol) — can become `selectedNodeId`. */
  selectable: boolean;
  /** The real backing Node. Present only when `selectable` is true. */
  node: Node | undefined;
  children: HierarchyNode[];
}

export function buildHierarchy(nodes: readonly Node[]): HierarchyNode[];
```

**Algorithm — spec precisely so there's no ambiguity to guess at:**

1. **Resolve each node's file path:**
   - `node.type === "module"` → file path = `node.name`. This node itself
     **is** the file (a `kind: "file"` entry, `selectable: true`).
   - else, `node.path` is a non-empty string → file path = `node.path`. This
     node becomes a `kind: "symbol"` child of that file.
   - else (no `path`, not a module) → assigned to the sentinel file path
     `"\0no-path"` (a leading null byte can never collide with a real
     repo-relative path).

2. **Build file entries**, one per distinct file path found in step 1:
   - If some module node's file path equals this key, that entry is
     `{kind: "file", id: <module's own id>, label: <basename>, selectable: true, node: <that module>}`.
   - Else (no module owns this path — the SOLL/PLAN case, or the sentinel)
     the entry is `{kind: "file", id: "file:" + filePath, label: <basename, or "(no file)" for the sentinel>, selectable: false, node: undefined}`.
   - `children` = every node whose resolved file path equals this key AND
     is not itself the module (i.e. all the `kind: "symbol"` nodes for this
     file), each mapped to `{kind: "symbol", id: node.id, label: node.name, selectable: true, node, children: []}`, **in original input array order** (not sorted — source declaration order is the useful reading order for "what's in this file top to bottom").

3. **Build folder entries** by grouping file paths on `/`:
   - All segments except the last are directory segments; the last segment
     is the file's basename (used as its `label` unless it's the sentinel).
   - A file path with zero directory segments (no `/`) is a **root-level
     file** — it goes directly into the top-level result array, not wrapped
     in a folder.
   - Files sharing a directory chain nest under shared folder entries. Folder
     id = `"folder:" + <full folder path>` (e.g. `"folder:src/core"`), label
     = last path segment only (e.g. `"core"`), `selectable: false`,
     `node: undefined`.
   - The sentinel file path always nests two synthetic levels deep:
     `{kind: "folder", id: "folder:\0no-path", label: "(no folder)", selectable: false, node: undefined, children: [{kind: "file", id: "file:\0no-path", label: "(no file)", selectable: false, node: undefined, children: [...pathless symbols]}]}`.
     This synthetic folder is present in the top-level result **only if**
     at least one pathless, non-module node exists in the input.

4. **Sort order:**
   - At every level, folder and file entries are sorted by `label` using
     case-insensitive `localeCompare` — same convention as
     `frontend/server/utils/browse.ts` and `frontend/composables/neighbors.ts`.
   - Exception: the synthetic `"(no folder)"` entry always sorts **last** at
     the top level, regardless of what `localeCompare` would say about its
     label — it's a catch-all bucket, not real structure.
   - Symbol children are never sorted (see step 2 — original order).

5. **Empty input** (`nodes = []`) → `[]`.

**Tests to write (TDD — red first):**

- Empty array → `[]`.
- Single module, no symbols → one top-level `file` entry, `selectable: true`, `node` is the module, `children: []`.
- Module + 2 symbols in the same file → file entry's `children` has both symbols, in original array order (construct input with symbols in a specific non-alphabetical order and assert that exact order survives).
- Two modules in different top-level folders (e.g. `"src/a.ts"`, `"tests/b.ts"`) → two separate top-level folder entries, `"src"` and `"tests"`, each containing their one file.
- Two modules in the *same* folder (e.g. `"src/a.ts"`, `"src/b.ts"`) → one `"src"` folder entry with two file children.
- Deep nesting (e.g. `"src/extractors/typescript/parser.ts"`) → 2 nested folder levels (`"src"` → `"src/extractors"` → `"src/extractors/typescript"`... — write out the exact expected id chain in the test) before reaching the file.
- Root-level file (e.g. module `name: "index.ts"`, no `/`) → appears directly in the top-level array as a `file` entry, not wrapped in any folder.
- SOLL-style input: a non-module node with `.path` set but no module node owns that path → a virtual `file` entry, `selectable: false`, `node: undefined`, containing that node as a symbol child.
- Pathless, non-module node (no `.path`, `type !== "module"`) → appears under `folder:"\0no-path"` (label `"(no folder)"`) → `file:"\0no-path"` (label `"(no file)"`).
- Mixed pathful + pathless input in the same call → pathful nodes land in their real folders, pathless nodes land under `"(no folder)"` → `"(no file)"`, and both are present simultaneously in the result (this is the case CodeRabbit specifically flagged as needing explicit coverage in the design-doc review — do not skip it).
- Sorting: build input with folders/files whose labels are NOT already alphabetical (e.g. `"zebra.ts"`, `"Apple.ts"`) and assert the result is case-insensitively sorted.
- The `"(no folder)"` entry sorts last even when its label would otherwise sort earlier than a real folder alphabetically (e.g. real folder named `"zzz"` — assert `"(no folder)"` still comes after `"zzz"` in the top-level array, not before).

**Step 1: Write the failing test file**, all cases above.

**Step 2: Run, confirm fail.**

```bash
pnpm test tests/frontend/build-hierarchy.test.ts
```

**Step 3: Implement `buildHierarchy`** following the algorithm exactly.
Style: mirror `frontend/composables/neighbors.ts` — double quotes, `.js`
extension on the local `specifyr` type import is not needed here (it's a
package import, not local), minimal comments, no docstrings beyond what's
already in the contract above (only add a comment if something is genuinely
non-obvious, e.g. the null-byte sentinel choice).

**Step 4: Run, confirm pass. Run full suite too:**

```bash
pnpm test tests/frontend/build-hierarchy.test.ts
pnpm test
```

**Step 5: Commit**

```bash
git add frontend/composables/build-hierarchy.ts tests/frontend/build-hierarchy.test.ts
git commit -m "Add buildHierarchy composable for the Explorer/canvas redesign (TDD)"
```

---

## Task 4: Code-review checkpoint

Dispatch `superpowers:code-reviewer` on the Task 2-3 commits. Focus:

- **Extractor change is truly minimal** — only the symbol-node push touched, module-node push untouched, no other extractor files affected.
- **`buildHierarchy` sentinel collision safety** — confirm no real repo-relative path could ever equal `"\0no-path"` (null byte is not a valid path character on any filesystem this project targets).
- **Sort stability** — folders/files sorted case-insensitively, `"(no folder)"` always last, symbols never sorted. Verify all three independently.
- **Mixed pathful/pathless test** — confirm it's actually present and asserts both branches land correctly in the same `buildHierarchy()` call (not two separate calls).
- **No UI/view assumptions leaked in** — `buildHierarchy` must not reference `selectedNodeId`, view source (`"soll"`/`"ist"`), or any Vue reactivity. It's a plain function over `Node[]`, matching `neighborsOf`/`matchNodes`'s existing style (no `computed()`, no `ref()` inside the composable file itself — those belong in the page that calls it, in a later slice).
- **Test coverage matches the algorithm spec** — spot-check that the "deep nesting" test actually asserts the intermediate folder ids, not just the final structure shape.

Apply approved suggestions before proceeding.

---

## Task 5: README + green + push + PR

**Files:**
- Modify: `README.md`

**Step 1:** Under `## Status`, add (this is a data-layer slice with no
user-visible change yet — phrase it as such):

```
Slice Hierarchy Data (current): IST symbol nodes carry a path back to their file; new buildHierarchy() composable groups any node list into Folder → File → Symbol, ready for the Explorer tree + nested canvas redesign in upcoming slices. No visible editor change yet. ✅
```

Move the previous `(current)` marker off Slice Repo Picker.

**Step 2:** Green gate:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Step 3:** Commit + push + PR. PR body: summarize the two additive changes,
link the design doc, note explicitly that this slice has no visible editor
behavior change (verifiable by the existing E2E bundle-content test still
passing unchanged — no new bundle guard needed since there's no new UI to
guard yet).

```bash
git add README.md
git commit -m "docs: bump README status to Slice Hierarchy Data"
git push -u origin ts/slice-hierarchy-data
```

---

## Execution notes for the subagent chain

- Baseline (main tip `1dc2081`): 256 tests, 38 files.
- Task 2 and Task 3 are independent enough to dispatch as two separate TDD
  implementer subagents, or one batched subagent — they touch entirely
  different files (extractor vs. new frontend composable) with no shared
  code. Batching is fine given both are small.
- Task 4 is the review checkpoint.
- Task 5 wraps up. No E2E bundle-content guard needed this slice (no new
  bundle content — `buildHierarchy` isn't wired into any page yet).
- Do NOT touch `frontend/pages/index.vue` in this slice — wiring is Slice 2
  (Explorer tree UI) and beyond.
- Do NOT restart the editor on port 3939.
