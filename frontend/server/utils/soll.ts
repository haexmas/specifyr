import type { Model } from "specifyr";
import { loadSoll } from "specifyr/storage";

/**
 * Loads the SOLL model for the current request using the repository path from
 * the SPECIFYR_REPO_PATH environment variable.
 *
 * @returns The SOLL model from the configured repository.
 */
export async function loadSollForRequest(): Promise<Model> {
  // Assumes nitro.preset "node-server" — process.env is stable across requests.
  // If moving to an edge preset later, read from event context instead.
  const repoPath = process.env.SPECIFYR_REPO_PATH;
  if (!repoPath) {
    throw new Error(
      "SPECIFYR_REPO_PATH is not set. The specifyr editor sets this automatically; " +
        "if you are running the frontend directly, export SPECIFYR_REPO_PATH=<path>.",
    );
  }
  return await loadSoll(repoPath);
}
