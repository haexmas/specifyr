import type { Node } from "specifyr";

export interface DetailRow {
  label: string;
  value: string;
}

/** Format a model node as ordered rows for the details sidebar. */
export function formatNodeDetails(node: Node): DetailRow[] {
  const rows: DetailRow[] = [
    { label: "id", value: node.id },
    { label: "type", value: node.type },
    { label: "name", value: node.name },
  ];
  if (node.description) {
    rows.push({ label: "description", value: node.description });
  }
  if (node.path) {
    rows.push({ label: "path", value: node.path });
  }
  return rows;
}
