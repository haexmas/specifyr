import { loadIstForRequest } from "../utils/ist.js";
import { resolveRepoPath } from "../utils/repo-path.js";

export default defineEventHandler(async (event) => {
  try {
    const repoPath = resolveRepoPath(getQuery(event));
    return await loadIstForRequest(repoPath);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setResponseStatus(event, 500);
    return { error: message };
  }
});
