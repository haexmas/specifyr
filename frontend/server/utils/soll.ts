import type { Model } from "specifyr";
import { loadSoll } from "specifyr/storage";

export async function loadSollForRequest(): Promise<Model> {
  const repoPath = process.env.SPECIFYR_REPO_PATH;
  if (!repoPath) {
    throw new Error(
      "SPECIFYR_REPO_PATH is not set. The specifyr editor sets this automatically; " +
        "if you are running the frontend directly, export SPECIFYR_REPO_PATH=<path>.",
    );
  }
  return await loadSoll(repoPath);
}
