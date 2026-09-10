# Contract: `src/extractors/typescript/extract-inheritance.ts`

Public module signature for the new heritage-clause extractor. Consumed by `src/extractors/typescript/extract.ts` (pass 1's per-file loop). Unit-tested in isolation via `tests/extractors/typescript/extract-inheritance.test.ts`.

```ts
import type { Tree } from "web-tree-sitter";

export interface RawInheritance {
  /** Repo-relative file path of the file declaring the deriving symbol. */
  relativePath: string;
  /** The declared name of the class or interface that has the clause. */
  fromSymbolName: string;
  /** Identifier being extended or implemented, with generic wrappers stripped. */
  targetName: string;
  /** Which relationship this record represents. */
  edgeType: "extends" | "implements";
}

/**
 * Convenience wrapper — parses `source` and walks its heritage clauses.
 * Prefer `extractInheritanceFromTree` when a parsed tree is already at hand.
 */
export function extractInheritance(input: {
  relativePath: string;
  source: string;
}): Promise<RawInheritance[]>;

/**
 * Walk an already-parsed tree-sitter tree and emit one `RawInheritance` per
 * declared clause.
 *
 * Rules:
 * - `class_declaration` / `abstract_class_declaration` → 0-1 extends record
 *   (single super) + 0-N implements records.
 * - `interface_declaration` → 0-N extends records (multi-super).
 * - `generic_type` targets are unwrapped to their base identifier (`Base<T>` → `"Base"`).
 * - `member_expression` targets (`Foo.Bar`) are silently dropped.
 * - Duplicate raw records are NOT deduped here — dedup happens at emit time in `extract.ts`.
 */
export function extractInheritanceFromTree(
  tree: Tree,
  relativePath: string,
): RawInheritance[];
```

## Behavior contract (must hold for all inputs)

| Input snippet | Expected emitted records |
|---|---|
| `class Foo extends Bar {}` | 1 × `{fromSymbolName: "Foo", targetName: "Bar", edgeType: "extends"}` |
| `class Foo implements A, B {}` | 2 × implements (targets `"A"`, `"B"`), 0 extends |
| `class Foo extends Bar implements A {}` | 1 extends (`"Bar"`) + 1 implements (`"A"`) |
| `abstract class Foo extends Bar {}` | Same as non-abstract |
| `interface Foo extends A, B {}` | 2 × extends (targets `"A"`, `"B"`) |
| `interface Foo {}` | 0 records |
| `class Foo extends Base<T> {}` | 1 extends, target `"Base"` (generics stripped) |
| `class Foo extends Bar.Baz {}` | 0 records (namespace target dropped) |
| Empty file | 0 records |

## Non-contract

- Does not consult imports.
- Does not resolve targets to node ids.
- Does not know about the walked file set.
- Does not touch the emitted `Edge` shape.
- Does not track source-position (line/column) — future improvement, not needed here.
