# Contract: `src/extractors/typescript/resolve-symbol.ts`

Public module signature for the new symbol-resolution layer. Consumed by `src/extractors/typescript/extract.ts` (pass 3, per raw-inheritance record). Unit-tested in isolation via `tests/extractors/typescript/resolve-symbol.test.ts`.

```ts
export interface SymbolIndex {
  /** All node ids matching an exported class/interface name, including in-repository re-exports. */
  get(filePath: string, exportedName: string): readonly string[];
}

export interface FileImportIndex {
  /** Import binding for `localName` in this file, or undefined if not imported. */
  get(localName: string):
    | { targetFile: string; exportedName: string }
    | undefined;
}

/**
 * Resolve an inheritance target identifier to a node id.
 *
 * Priority order (matches TypeScript's own scoping):
 *   1. `sameFileSymbols.get(targetName)` → return the sole candidate, if there
 *      is exactly one; drop ambiguous names.
 *   2. Else if `fileImports.get(targetName)` returns a binding → look up via
 *      `symbolIndex.get(binding.targetFile, binding.exportedName)`. The index
 *      follows in-repository re-exports transitively, including aliases, with
 *      a visited set so re-export cycles resolve to undefined rather than loop.
 *   3. Else return undefined.
 *
 * @param fromRelative Repo-relative file path where the reference lives.
 *                     Used for clarity in resolution failures (not for lookups).
 * @param targetName   The identifier as it appears in the heritage clause.
 * @param fileImports  Import bindings for `fromRelative` (already resolved).
 * @param symbolIndex  Global (filePath, exportedName) → all matching node ids lookup.
 *                      Return a node id only when the result has exactly one candidate.
 * @param sameFileSymbols  Local name → all matching local node ids for `fromRelative`.
 */
export function resolveSymbol(
  fromRelative: string,
  targetName: string,
  fileImports: FileImportIndex,
  symbolIndex: SymbolIndex,
  sameFileSymbols: ReadonlyMap<string, readonly string[]>,
): string | undefined;
```

## Behavior contract (must hold for all inputs)

| Scenario | Expected |
|---|---|
| Same-file class extends locally-declared parent | Returns local node id from `sameFileSymbols` |
| Class extends imported target that resolves in `symbolIndex` | Returns target node id via `fileImports.get(target).exportedName` |
| Class extends imported target with duplicate exported declarations | Returns undefined rather than selecting an arbitrary node |
| Class extends imported target with alias (`import { A as B }`, `extends B`) | Resolves `B` locally → `A` in target file |
| Class extends imported target whose target file has no such export | Returns undefined |
| Class extends target through a transitive or aliased in-repository re-export | Returns the final exported class/interface node id |
| Class extends target through a cyclic re-export chain | Returns undefined without looping |
| Import resolves to a private declaration or a function, enum, or type-alias | Returns undefined |
| Class extends identifier that is neither same-file nor imported | Returns undefined |
| Class extends target that is both same-file AND imported | Returns SAME-FILE (locals shadow imports per TS semantics) |

## Non-contract

- Does not walk trees or parse source.
- Does not know about `RawInheritance` — takes a bare `targetName` string.
- Does not decide whether an edge should be emitted (`extract.ts` does that, including the `fromId === toId` self-loop check).
- Does not maintain any cross-invocation state.
