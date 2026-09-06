import { stat } from "node:fs/promises";

import { sollRoot } from "../../storage/paths.js";
import { loadSoll, saveSoll } from "../../storage/soll.js";
import type { InitReport } from "../report.js";

export interface InitOptions {
  repoPath: string;
}

export async function runInit(options: InitOptions): Promise<InitReport> {
  const { repoPath } = options;

  const sollExists = await sollDirectoryExists(repoPath);

  if (sollExists) {
    const existing = await loadSoll(repoPath);
    if (existing.nodes.length > 0 || existing.edges.length > 0) {
      throw new Error(
        `SOLL already initialized and not empty at ${repoPath}. ` +
          `Refusing to overwrite; ${existing.nodes.length} node(s) and ${existing.edges.length} edge(s) present.`,
      );
    }
    return { repoPath };
  }

  await saveSoll(repoPath, {
    meta: { source: "soll" },
    nodes: [],
    edges: [],
  });
  return { repoPath };
}

async function sollDirectoryExists(repoPath: string): Promise<boolean> {
  try {
    const info = await stat(sollRoot(repoPath));
    return info.isDirectory();
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw cause;
  }
}
