import type { Node as TsNode } from "web-tree-sitter";
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

// `export class Foo {}` parses as export_statement > class_declaration, and
// `declare class Foo {}` parses as ambient_declaration > class_declaration.
// Peel one level of either wrapper to reach the actual declaration.
function unwrapExport(node: TsNode): TsNode {
  if (node.type === "export_statement" || node.type === "ambient_declaration") {
    const first = node.namedChildren[0];
    if (first) return first;
  }
  return node;
}
