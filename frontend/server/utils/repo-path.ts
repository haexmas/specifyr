/**
 * Resolve the repository path for a request: query wins over env.
 * Whitespace-only query values fall through to the env fallback.
 * Throws when both are missing so the handler can surface a 500.
 */
export function resolveRepoPath(query: { repoPath?: string | string[] } | undefined): string {
  const raw = query?.repoPath;
  const fromQuery = Array.isArray(raw) ? raw[0] : raw;
  const chosen = fromQuery?.trim() || process.env.SPECIFYR_REPO_PATH;
  if (!chosen) {
    throw new Error("No repository path selected. Pass ?repoPath=<abs> or set SPECIFYR_REPO_PATH.");
  }
  return chosen;
}
