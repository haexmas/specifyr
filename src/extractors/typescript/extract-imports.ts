import type { Tree, Node as TsNode } from "web-tree-sitter";
import { parseTypeScript } from "./parser.js";

export interface RawImport {
  fromRelative: string;
  specifier: string;
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
    results.push({ fromRelative, specifier });
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
