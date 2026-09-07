import { loadSollForRequest } from "../utils/soll.js";

/**
 * Nuxt API handler that returns the current SOLL model as JSON.
 * Returns HTTP 500 with an error message if loading fails.
 */
export default defineEventHandler(async (event) => {
  try {
    return await loadSollForRequest();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setResponseStatus(event, 500);
    return { error: message };
  }
});
