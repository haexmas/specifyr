import type { Tree, Node as TsNode } from "web-tree-sitter";
import type { Node } from "../../core/schemas.js";
import { istNodeId } from "./node-id.js";
import { parseTypeScript } from "./parser.js";

interface Source {
  relativePath: string;
  source: string;
}

// Map tree-sitter node type -> our vocabulary node type.
// Namespaces / internal_module are intentionally NOT emitted in Slice A.
// They contain other declarations and require a "namespace" vocabulary type
// (deferred). Declarations INSIDE a namespace are also skipped for the same
// reason; a later slice will surface both.
const TOP_LEVEL_KINDS: Record<string, string> = {
  abstract_class_declaration: "class",
  class_declaration: "class",
  interface_declaration: "interface",
  type_alias_declaration: "type-alias",
  enum_declaration: "enum",
  function_declaration: "function",
  function_signature: "function",
};

/** Extract supported top-level TypeScript declarations from one source file. */
export async function extractSource({ relativePath, source }: Source): Promise<Node[]> {
  const tree = await parseTypeScript(source);
  return extractSourceFromTree(tree, relativePath);
}

/** Same as extractSource, but takes an already-parsed tree (no parse cost). */
export function extractSourceFromTree(tree: Tree, relativePath: string): Node[] {
  const nodes: Node[] = [];
  const nameOccurrences = new Map<string, number>();

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
    const nameNode =
      declaration.childForFieldName("name") ??
      (declaration.type === "function_signature" ? declaration.namedChildren[0] : undefined);
    const name = nameNode?.text;
    if (!name) continue;
    const occurrence = nameOccurrences.get(name) ?? 0;
    nameOccurrences.set(name, occurrence + 1);
    // Keep the first declaration's historical ID and suffix later occurrences
    // in source order. This makes declaration merges and overloads unique while
    // remaining deterministic for the same file contents.
    const qualifiedName = occurrence === 0 ? name : `${name}#${occurrence + 1}`;
    nodes.push({
      id: istNodeId(relativePath, qualifiedName),
      type: emittedType,
      name,
      classes: [],
    });
  }

  return nodes;
}

// `export declare class Foo {}` parses as
// export_statement > ambient_declaration > class_declaration. Peel all
// consecutive export/ambient wrappers to reach the actual declaration.
/** Remove syntax-only export and ambient wrappers from a declaration node. */
function unwrapExport(node: TsNode): TsNode {
  let current = node;
  while (current.type === "export_statement" || current.type === "ambient_declaration") {
    const first = current.namedChildren[0];
    if (!first) break;
    current = first;
  }
  return current;
}
