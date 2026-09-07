import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadIstForRequest } from "../../frontend/server/utils/ist.js";

describe("loadIstForRequest", () => {
  let repoPath: string;
  const originalEnv = process.env.SPECIFYR_REPO_PATH;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-ist-req-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
    if (originalEnv === undefined) {
      // biome-ignore lint/performance/noDelete: env "" would leak the literal string "undefined"
      delete process.env.SPECIFYR_REPO_PATH;
    } else {
      process.env.SPECIFYR_REPO_PATH = originalEnv;
    }
  });

  it("throws when SPECIFYR_REPO_PATH is not set", async () => {
    // biome-ignore lint/performance/noDelete: same rationale as above
    delete process.env.SPECIFYR_REPO_PATH;
    await expect(loadIstForRequest()).rejects.toThrow(/SPECIFYR_REPO_PATH/);
  });

  it("returns an ist model for a repo with a class", async () => {
    mkdirSync(join(repoPath, "src"), { recursive: true });
    writeFileSync(join(repoPath, "src", "x.ts"), "export class Foo {}\n");
    process.env.SPECIFYR_REPO_PATH = repoPath;
    const model = await loadIstForRequest();
    expect(model.meta.source).toBe("ist");
    expect(model.nodes.map((n) => n.name)).toContain("Foo");
  });
});
