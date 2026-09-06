import { loadSoll } from "../../storage/soll.js";
import type { NodeTypeCount, StatusReport } from "../report.js";

export interface StatusOptions {
  repoPath: string;
}

export async function runStatus(options: StatusOptions): Promise<StatusReport> {
  const { repoPath } = options;
  const model = await loadSoll(repoPath);

  const countsByType = new Map<string, number>();
  for (const node of model.nodes) {
    countsByType.set(node.type, (countsByType.get(node.type) ?? 0) + 1);
  }

  const nodesByType: NodeTypeCount[] = Array.from(countsByType.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));

  return {
    repoPath,
    meta: model.meta,
    nodesByType,
    totalNodes: model.nodes.length,
    totalEdges: model.edges.length,
  };
}
