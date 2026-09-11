import type { Tree, Node as TsNode } from "web-tree-sitter";
import { parseTypeScript } from "./parser.js";

export interface RawImportBinding {
  /** Name as used inside the importing file. */
  local: string;
  /**
   * Name exported from the target module.
   *
   * - `"*"` for namespace imports (`import * as NS from ...`).
   * - `"default"` for default imports (`import D from ...`).
   * - Otherwise, the exported identifier (equal to `local` unless aliased).
   */
  imported: string;
}

export interface RawImport {
  fromRelative: string;
  specifier: string;
  /** Empty for side-effect imports (`import "./polyfill"`). */
  bindings: RawImportBinding[];
}

/** Extract every static `import ... from "..."` specifier from a source file. */
export async function extractImports(fromRelative: string, source: string): Promise<RawImport[]> {
  const tree = await parseTypeScript(source);
  return extractImportsFromTree(tree, fromRelative);
}

/** Same as extractImports, but takes an already-parsed tree (no parse cost). */
export function extractImportsFromTree(tree: Tree, fromRelative: string): RawImport[] {
  const results: RawImport[] = [];

  for (const child of tree.rootNode.namedChildren) {
    if (!child || child.type !== "import_statement") continue;
    const specifier = readImportSpecifier(child);
    if (specifier === undefined) continue;
    results.push({ fromRelative, specifier, bindings: readImportBindings(child) });
  }

  return results;
}

// The specifier lives in a `string` child of `import_statement`. tree-sitter
// wraps it in a `string_fragment` (the actual text without the surrounding
// quotes). Walk the AST for that fragment and return its text.
function readImportSpecifier(node: TsNode): string | undefined {
  for (const child of node.namedChildren) {
    if (!child || child.type !== "string") continue;
    for (const grandchild of child.namedChildren) {
      if (grandchild?.type === "string_fragment") return grandchild.text;
    }
  }
  return undefined;
}

function readImportBindings(importStatement: TsNode): RawImportBinding[] {
  const clause = importStatement.namedChildren.find((c) => c?.type === "import_clause");
  if (!clause) return [];

  const bindings: RawImportBinding[] = [];
  for (const child of clause.namedChildren) {
    if (!child) continue;
    if (child.type === "identifier") {
      // Default import: `import Foo from "..."` — the identifier is the local name.
      bindings.push({ local: child.text, imported: "default" });
    } else if (child.type === "namespace_import") {
      // `* as Foo` — the identifier is the last named child.
      const alias = child.namedChildren.find((c) => c?.type === "identifier");
      if (alias) bindings.push({ local: alias.text, imported: "*" });
    } else if (child.type === "named_imports") {
      for (const spec of child.namedChildren) {
        if (!spec || spec.type !== "import_specifier") continue;
        const nameNode = spec.childForFieldName("name");
        const aliasNode = spec.childForFieldName("alias");
        const imported = nameNode?.text;
        if (!imported) continue;
        const local = aliasNode?.text ?? imported;
        bindings.push({ local, imported });
      }
    }
  }
  return bindings;
}
