import type { ModelMeta } from "../core/schemas.js";

export interface InitReport {
  repoPath: string;
}

export interface NodeTypeCount {
  type: string;
  count: number;
}

export interface StatusReport {
  repoPath: string;
  meta: ModelMeta;
  nodesByType: NodeTypeCount[];
  totalNodes: number;
  totalEdges: number;
}

export function formatInitReport(report: InitReport): string {
  return `Created .specifyr/soll/ under ${report.repoPath}.\n`;
}

export function formatStatusReport(report: StatusReport): string {
  const lines: string[] = [];
  lines.push(`SOLL summary for ${report.repoPath}`);
  lines.push(`  source:       ${report.meta.source}`);
  if (report.meta.generatedAt) {
    lines.push(`  generated at: ${report.meta.generatedAt}`);
  }
  lines.push(`  nodes:        ${report.totalNodes}`);
  for (const { type, count } of report.nodesByType) {
    lines.push(`    ${type.padEnd(18)}${count}`);
  }
  lines.push(`  edges:        ${report.totalEdges}`);
  return `${lines.join("\n")}\n`;
}
