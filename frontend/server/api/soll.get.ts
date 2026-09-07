import { loadSollForRequest } from "../utils/soll.js";

export default defineEventHandler(async (event) => {
  try {
    return await loadSollForRequest();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setResponseStatus(event, 500);
    return { error: message };
  }
});
