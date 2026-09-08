import type { Model } from "specifyr";
import { extractIst } from "specifyr/extractors/typescript";

/** Load the live IST model for the given repository path. */
export async function loadIstForRequest(repoPath: string): Promise<Model> {
  return await extractIst(repoPath);
}
