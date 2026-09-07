import { loadIstForRequest } from "../utils/ist.js";

export default defineEventHandler(async (event) => {
  try {
    return await loadIstForRequest();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setResponseStatus(event, 500);
    return { error: message };
  }
});
