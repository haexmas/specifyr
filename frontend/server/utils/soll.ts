import type { Model } from "specifyr";
import { loadSoll } from "specifyr/storage";

/**
 * Loads the SOLL model for the given repository path.
 *
 * A repo the user opens before running `specifyr init` has no .specifyr/
 * tree — treat ENOENT as an empty model so the editor lands on the empty-state
 * UI instead of a hard error. Non-ENOENT failures (corrupt storage, permission
 * denied) still bubble up.
 */
export async function loadSollForRequest(repoPath: string): Promise<Model> {
  try {
    return await loadSoll(repoPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return { meta: { source: "soll" }, nodes: [], edges: [] };
    }
    throw cause;
  }
}
