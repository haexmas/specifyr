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

// A leading null byte can never appear in a real repo-relative path, so it's a
// safe sentinel for "this node has no path" without risking a collision.
const NO_PATH = "\0no-path";
const NO_FOLDER_ID = `folder:${NO_PATH}`;

/** Return the final segment of a repo-relative file path. */
function basename(filePath: string): string {
  const segments = filePath.split("/");
  return segments[segments.length - 1] ?? filePath;
}

/** Compare hierarchy entries by label without case sensitivity. */
function compareLabel(a: HierarchyNode, b: HierarchyNode): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}

/** Sort one hierarchy level and recursively sort its child folders. */
function sortLevel(entries: HierarchyNode[]): void {
  entries.sort((a, b) => {
    const aNoFolder = a.id === NO_FOLDER_ID;
    const bNoFolder = b.id === NO_FOLDER_ID;
    if (aNoFolder !== bNoFolder) return aNoFolder ? 1 : -1;
    return compareLabel(a, b);
  });
  for (const entry of entries) {
    if (entry.kind === "folder") sortLevel(entry.children);
  }
}

/** Group flat specification nodes into a sorted folder, file, and symbol hierarchy. */
export function buildHierarchy(nodes: readonly Node[]): HierarchyNode[] {
  if (nodes.length === 0) return [];

  const moduleByPath = new Map<string, Node>();
  const pathOf = new Map<Node, string>();
  for (const node of nodes) {
    if (node.type === "module") {
      pathOf.set(node, node.name);
      moduleByPath.set(node.name, node);
    } else if (node.path) {
      pathOf.set(node, node.path);
    } else {
      pathOf.set(node, NO_PATH);
    }
  }

  const fileOrder: string[] = [];
  const symbolsByFile = new Map<string, Node[]>();
  for (const node of nodes) {
    const filePath = pathOf.get(node) as string;
    if (!symbolsByFile.has(filePath)) {
      symbolsByFile.set(filePath, []);
      fileOrder.push(filePath);
    }
    if (node.type !== "module") {
      symbolsByFile.get(filePath)?.push(node);
    }
  }

  const fileEntries = new Map<string, HierarchyNode>();
  for (const filePath of fileOrder) {
    const moduleNode = moduleByPath.get(filePath);
    const children: HierarchyNode[] = (symbolsByFile.get(filePath) ?? []).map((symbol) => ({
      kind: "symbol",
      id: symbol.id,
      label: symbol.name,
      selectable: true,
      node: symbol,
      children: [],
    }));

    if (moduleNode) {
      fileEntries.set(filePath, {
        kind: "file",
        id: moduleNode.id,
        label: basename(filePath),
        selectable: true,
        node: moduleNode,
        children,
      });
    } else {
      fileEntries.set(filePath, {
        kind: "file",
        id: `file:${filePath}`,
        label: filePath === NO_PATH ? "(no file)" : basename(filePath),
        selectable: false,
        node: undefined,
        children,
      });
    }
  }

  const top: HierarchyNode[] = [];
  const folderByPath = new Map<string, HierarchyNode>();

  for (const filePath of fileOrder) {
    const fileEntry = fileEntries.get(filePath);
    if (!fileEntry) continue;

    if (filePath === NO_PATH) {
      let noFolder = folderByPath.get(NO_PATH);
      if (!noFolder) {
        noFolder = {
          kind: "folder",
          id: NO_FOLDER_ID,
          label: "(no folder)",
          selectable: false,
          node: undefined,
          children: [],
        };
        folderByPath.set(NO_PATH, noFolder);
        top.push(noFolder);
      }
      noFolder.children.push(fileEntry);
      continue;
    }

    const dirSegments = filePath.split("/").slice(0, -1);
    if (dirSegments.length === 0) {
      top.push(fileEntry);
      continue;
    }

    let siblings = top;
    let folderPath = "";
    for (const segment of dirSegments) {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      let folder = folderByPath.get(folderPath);
      if (!folder) {
        folder = {
          kind: "folder",
          id: `folder:${folderPath}`,
          label: segment,
          selectable: false,
          node: undefined,
          children: [],
        };
        folderByPath.set(folderPath, folder);
        siblings.push(folder);
      }
      siblings = folder.children;
    }
    siblings.push(fileEntry);
  }

  sortLevel(top);
  return top;
}
