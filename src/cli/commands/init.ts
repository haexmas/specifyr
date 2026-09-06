import { loadSoll, saveSoll } from "../../storage/soll.js";
import type { InitReport } from "../report.js";

export interface InitOptions {
  repoPath: string;
}

export async function runInit(options: InitOptions): Promise<InitReport> {
  const { repoPath } = options;

  try {
    const existing = await loadSoll(repoPath);
    if (existing.nodes.length > 0 || existing.edges.length > 0) {
      throw new Error(
        `SOLL already initialized and not empty at ${repoPath}. ` +
          `Refusing to overwrite; ${existing.nodes.length} node(s) and ${existing.edges.length} edge(s) present.`,
      );
    }
    return { repoPath, createdEmpty: true };
  } catch (cause) {
    if (!isMissingSollError(cause)) throw cause;
  }

  await saveSoll(repoPath, {
    meta: { source: "soll" },
    nodes: [],
    edges: [],
  });
  return { repoPath, createdEmpty: true };
}

function isMissingSollError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  return /required file missing|ENOENT/.test(cause.message);
}
