import type { Tree, Node as TsNode } from "web-tree-sitter";
import { istNodeId } from "./node-id.js";
import { parseTypeScript } from "./parser.js";

export interface RawInheritance {
  /** Repo-relative file path of the file declaring the deriving symbol. */
  relativePath: string;
  /** Stable node id of the exact class or interface that has the clause. */
  fromNodeId: string;
  /** The declared name, retained for diagnostics and fixture readability. */
  fromSymbolName: string;
  /** Identifier being extended or implemented, with generic wrappers stripped. */
  targetName: string;
  /** Which relationship this record represents. */
  edgeType: "extends" | "implements";
}

interface Input {
  relativePath: string;
  source: string;
}

const CLASS_LIKE = new Set(["class_declaration", "abstract_class_declaration"]);

/** Convenience wrapper — parses `source` and walks its heritage clauses. */
export async function extractInheritance(input: Input): Promise<RawInheritance[]> {
  const tree = await parseTypeScript(input.source);
  return extractInheritanceFromTree(tree, input.relativePath);
}

/** Walk an already-parsed tree and emit one `RawInheritance` per declared clause. */
export function extractInheritanceFromTree(tree: Tree, relativePath: string): RawInheritance[] {
  const records: RawInheritance[] = [];
  const nameOccurrences = new Map<string, number>();

  for (const child of tree.rootNode.namedChildren) {
    const declaration = unwrapExport(child);
    if (!declaration) continue;
    const kind = declaration.type;
    const isClass = CLASS_LIKE.has(kind);
    const isInterface = kind === "interface_declaration";
    if (!isClass && !isInterface) continue;

    const nameNode = declaration.childForFieldName("name");
    const symbolName = nameNode?.text;
    if (!symbolName) continue;

    const occurrence = nameOccurrences.get(symbolName) ?? 0;
    nameOccurrences.set(symbolName, occurrence + 1);
    const qualifiedName = occurrence === 0 ? symbolName : `${symbolName}#${occurrence + 1}`;
    const fromNodeId = istNodeId(relativePath, qualifiedName);

    if (isClass) {
      collectClassHeritage(declaration, {
        relativePath,
        fromNodeId,
        fromSymbolName: symbolName,
        records,
      });
    } else {
      collectInterfaceHeritage(declaration, {
        relativePath,
        fromNodeId,
        fromSymbolName: symbolName,
        records,
      });
    }
  }

  return records;
}

interface CollectContext {
  relativePath: string;
  fromNodeId: string;
  fromSymbolName: string;
  records: RawInheritance[];
}

function collectClassHeritage(declaration: TsNode, ctx: CollectContext): void {
  const heritage = declaration.namedChildren.find((c) => c?.type === "class_heritage");
  if (!heritage) return;
  for (const clause of heritage.namedChildren) {
    if (!clause) continue;
    if (clause.type === "extends_clause") {
      appendTargets(clause, "extends", ctx);
    } else if (clause.type === "implements_clause") {
      appendTargets(clause, "implements", ctx);
    }
  }
}

function collectInterfaceHeritage(declaration: TsNode, ctx: CollectContext): void {
  for (const child of declaration.namedChildren) {
    if (!child) continue;
    if (child.type === "extends_type_clause" || child.type === "extends_clause") {
      appendTargets(child, "extends", ctx);
    }
  }
}

function appendTargets(
  clause: TsNode,
  edgeType: "extends" | "implements",
  ctx: CollectContext,
): void {
  for (const typeNode of clause.namedChildren) {
    if (!typeNode) continue;
    const name = typeIdentifierOf(typeNode);
    if (!name) continue;
    ctx.records.push({
      relativePath: ctx.relativePath,
      fromNodeId: ctx.fromNodeId,
      fromSymbolName: ctx.fromSymbolName,
      targetName: name,
      edgeType,
    });
  }
}

function typeIdentifierOf(node: TsNode): string | undefined {
  if (node.type === "type_identifier" || node.type === "identifier") return node.text;
  if (node.type === "generic_type") {
    const base = node.namedChildren[0];
    return base ? typeIdentifierOf(base) : undefined;
  }
  // member_expression (`Foo.Bar`), nested_type_identifier, etc. are dropped.
  return undefined;
}

function unwrapExport(node: TsNode | null): TsNode | undefined {
  let current: TsNode | null = node;
  while (
    current &&
    (current.type === "export_statement" || current.type === "ambient_declaration")
  ) {
    current = current.namedChildren[0] ?? null;
  }
  return current ?? undefined;
}
