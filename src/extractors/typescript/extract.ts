import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Tree, Node as TsNode } from "web-tree-sitter";
import type { Edge, Model, Node } from "../../core/schemas.js";
import { ModelSchema } from "../../core/schemas.js";
import { istEdgeId } from "./edge-id.js";
import type { RawInheritance } from "./extract-inheritance.js";
import { extractInheritanceFromTree } from "./extract-inheritance.js";
import type { RawImport } from "./extract-imports.js";
import { extractImportsFromTree } from "./extract-imports.js";
import { extractSourceFromTree } from "./extract-source.js";
import { istNodeId } from "./node-id.js";
import { parseTypeScript } from "./parser.js";
import { resolveImport } from "./resolve-import.js";
import type {
  FileImportIndex,
  SymbolIndex,
} from "./resolve-symbol.js";
import { resolveSymbol } from "./resolve-symbol.js";
import { walkTsFiles } from "./walk.js";

interface ReExport {
  sourceFile: string;
  sourceExportedName: string;
}

interface FileSymbolAnalysis {
  /** name → node ids for all class/interface declarations in the file (exported + private). */
  locals: Map<string, string[]>;
  /** name → node ids for exported class/interface declarations only. */
  exports: Map<string, string[]>;
  /** localExportName → source of `export { name as localExportName } from "./source"`. */
  reExports: Map<string, ReExport>;
}

const CLASS_INTERFACE_KINDS = new Set([
  "class_declaration",
  "abstract_class_declaration",
  "interface_declaration",
]);

const ALL_TOP_LEVEL_KINDS = new Set([
  "class_declaration",
  "abstract_class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "function_declaration",
  "function_signature",
]);

/** Build an IST model from all supported TypeScript files below a repository root. */
export async function extractIst(repoRoot: string): Promise<Model> {
  const files = await walkTsFiles(repoRoot);
  const fileSet: ReadonlySet<string> = new Set(files);
  const allNodes: Node[] = [];
  const rawImports: RawImport[] = [];
  const rawInheritance: RawInheritance[] = [];
  const analysisByFile = new Map<string, FileSymbolAnalysis>();

  // Pass 1: walk + parse each file ONCE. Collect nodes, raw imports, raw inheritance
  // records, and per-file symbol analysis (locals, exports, re-exports).
  for (const relativePath of files) {
    const source = await readFile(join(repoRoot, relativePath), "utf8");
    let tree: Tree;
    try {
      tree = await parseTypeScript(source);
    } catch (cause) {
      throw new Error(`parseTypeScript failed for ${relativePath}`, { cause });
    }
    allNodes.push(...extractSourceFromTree(tree, relativePath));
    rawImports.push(...extractImportsFromTree(tree, relativePath));
    rawInheritance.push(...extractInheritanceFromTree(tree, relativePath));
    analysisByFile.set(relativePath, analyzeFileSymbols(tree, relativePath, fileSet));
  }

  // Pass 2: resolve each raw import to a target file, look up module node ids
  // at both ends, dedupe by (from, to, type), and emit imports Edge objects.
  const moduleIdByPath = new Map<string, string>();
  for (const relativePath of files) {
    moduleIdByPath.set(relativePath, istNodeId(relativePath, ""));
  }

  const edges: Edge[] = [];
  const seenImports = new Set<string>();
  for (const raw of rawImports) {
    const targetPath = resolveImport(raw.fromRelative, raw.specifier, fileSet);
    if (targetPath === undefined) continue;
    const fromId = moduleIdByPath.get(raw.fromRelative);
    const toId = moduleIdByPath.get(targetPath);
    if (!fromId || !toId) continue;
    const key = `${fromId}::${toId}::imports`;
    if (seenImports.has(key)) continue;
    seenImports.add(key);
    edges.push({
      id: istEdgeId(fromId, toId, "imports"),
      from: fromId,
      to: toId,
      type: "imports",
    });
  }

  // Pass 3: resolve inheritance targets and emit extends / implements edges.
  const symbolIndex = buildSymbolIndex(analysisByFile);
  const importIndexByFile = new Map<string, FileImportIndex>();
  for (const relativePath of files) {
    importIndexByFile.set(
      relativePath,
      buildFileImportIndex(relativePath, rawImports, fileSet),
    );
  }

  const seenInheritance = new Set<string>();
  const emptyLocals: ReadonlyMap<string, readonly string[]> = new Map();
  for (const rec of rawInheritance) {
    const fileImports = importIndexByFile.get(rec.relativePath);
    if (!fileImports) continue;
    const locals = analysisByFile.get(rec.relativePath)?.locals ?? emptyLocals;
    const toId = resolveSymbol(rec.relativePath, rec.targetName, fileImports, symbolIndex, locals);
    if (!toId) continue;
    const fromId = rec.fromNodeId;
    if (toId === fromId) continue;
    const key = `${fromId}::${toId}::${rec.edgeType}`;
    if (seenInheritance.has(key)) continue;
    seenInheritance.add(key);
    edges.push({
      id: istEdgeId(fromId, toId, rec.edgeType),
      from: fromId,
      to: toId,
      type: rec.edgeType,
    });
  }

  return ModelSchema.parse({
    meta: { source: "ist", generatedAt: new Date().toISOString() },
    nodes: allNodes,
    edges,
  });
}

function analyzeFileSymbols(
  tree: Tree,
  relativePath: string,
  fileSet: ReadonlySet<string>,
): FileSymbolAnalysis {
  const locals = new Map<string, string[]>();
  const exports = new Map<string, string[]>();
  const reExports = new Map<string, ReExport>();
  const nameOccurrences = new Map<string, number>();

  for (const child of tree.rootNode.namedChildren) {
    if (!child) continue;

    if (child.type === "export_statement") {
      collectReExports(child, relativePath, fileSet, reExports);
    }

    const declaration = unwrapExport(child);
    if (!declaration || !ALL_TOP_LEVEL_KINDS.has(declaration.type)) continue;
    const nameNode = declaration.childForFieldName("name");
    const name = nameNode?.text;
    if (!name) continue;

    const occurrence = nameOccurrences.get(name) ?? 0;
    nameOccurrences.set(name, occurrence + 1);
    const qualifiedName = occurrence === 0 ? name : `${name}#${occurrence + 1}`;
    const nodeId = istNodeId(relativePath, qualifiedName);

    if (!CLASS_INTERFACE_KINDS.has(declaration.type)) continue;

    pushIntoMap(locals, name, nodeId);
    if (child.type === "export_statement") {
      pushIntoMap(exports, name, nodeId);
    }
  }

  return { locals, exports, reExports };
}

function collectReExports(
  exportStatement: TsNode,
  relativePath: string,
  fileSet: ReadonlySet<string>,
  out: Map<string, ReExport>,
): void {
  const exportClause = exportStatement.namedChildren.find((c) => c?.type === "export_clause");
  if (!exportClause) return;
  const sourceString = exportStatement.namedChildren.find((c) => c?.type === "string");
  if (!sourceString) return;
  const specifier = extractStringFragment(sourceString);
  if (specifier === undefined) return;
  const targetFile = resolveImport(relativePath, specifier, fileSet);
  if (!targetFile) return;

  for (const spec of exportClause.namedChildren) {
    if (!spec || spec.type !== "export_specifier") continue;
    const nameNode = spec.childForFieldName("name");
    const aliasNode = spec.childForFieldName("alias");
    const sourceExportedName = nameNode?.text;
    if (!sourceExportedName) continue;
    const localExportName = aliasNode?.text ?? sourceExportedName;
    out.set(localExportName, { sourceFile: targetFile, sourceExportedName });
  }
}

function buildSymbolIndex(analysisByFile: ReadonlyMap<string, FileSymbolAnalysis>): SymbolIndex {
  return {
    get(filePath, exportedName) {
      const seen = new Set<string>();
      return resolveExported(filePath, exportedName, analysisByFile, seen);
    },
  };
}

function resolveExported(
  filePath: string,
  exportedName: string,
  analysisByFile: ReadonlyMap<string, FileSymbolAnalysis>,
  seen: Set<string>,
): readonly string[] {
  const key = `${filePath}\0${exportedName}`;
  if (seen.has(key)) return [];
  seen.add(key);

  const analysis = analysisByFile.get(filePath);
  if (!analysis) return [];

  const direct = analysis.exports.get(exportedName);
  if (direct && direct.length > 0) return direct;

  const reExport = analysis.reExports.get(exportedName);
  if (!reExport) return [];
  return resolveExported(reExport.sourceFile, reExport.sourceExportedName, analysisByFile, seen);
}

function buildFileImportIndex(
  filePath: string,
  rawImports: readonly RawImport[],
  fileSet: ReadonlySet<string>,
): FileImportIndex {
  const map = new Map<string, { targetFile: string; exportedName: string }>();
  for (const imp of rawImports) {
    if (imp.fromRelative !== filePath) continue;
    const targetFile = resolveImport(filePath, imp.specifier, fileSet);
    if (!targetFile) continue;
    for (const binding of imp.bindings) {
      map.set(binding.local, { targetFile, exportedName: binding.imported });
    }
  }
  return {
    get(localName) {
      return map.get(localName);
    },
  };
}

function pushIntoMap(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function extractStringFragment(node: TsNode): string | undefined {
  for (const child of node.namedChildren) {
    if (child?.type === "string_fragment") return child.text;
  }
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
