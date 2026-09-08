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
  try {
    return await loadSoll(repoPath);
  } catch (cause) {
    // A repo the user opens before running `specifyr init` has no .specifyr/
    // tree — treat as an empty model so the editor lands on the empty-state UI
    // instead of a hard error. Non-ENOENT failures (corrupt storage, permission
    // denied) still bubble up.
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return { meta: { source: "soll" }, nodes: [], edges: [] };
    }
    throw cause;
  }
}
