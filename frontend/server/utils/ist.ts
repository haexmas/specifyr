import type { Model } from "specifyr";
import { extractIst } from "specifyr/extractors/typescript";

export async function loadIstForRequest(): Promise<Model> {
  // Assumes nitro.preset "node-server" — process.env is stable across requests.
  // If moving to an edge preset later, read from event context instead.
  const repoPath = process.env.SPECIFYR_REPO_PATH;
  if (!repoPath) {
    throw new Error(
      "SPECIFYR_REPO_PATH is not set. The specifyr editor sets this automatically; " +
        "if you are running the frontend directly, export SPECIFYR_REPO_PATH=<path>.",
    );
  }
  return await extractIst(repoPath);
}
