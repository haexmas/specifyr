import { browseDirectory } from "../utils/browse.js";

/**
 * GET /api/browse?path=<optional absolute path>
 * Returns the entries of a directory (subdirectories only, sorted).
 * 400 on validation errors (ENOENT, not-a-directory); 500 on anything else.
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const rawPath = query.path;
    const path = typeof rawPath === "string" ? rawPath : undefined;
    return await browseDirectory(path);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const code = (cause as NodeJS.ErrnoException | undefined)?.code;
    const isValidation = code === "ENOENT" || /not a directory/i.test(message);
    setResponseStatus(event, isValidation ? 400 : 500);
    return { error: message };
  }
});
