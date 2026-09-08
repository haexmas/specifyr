import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadIstForRequest } from "../../frontend/server/utils/ist.js";

describe("loadIstForRequest", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-ist-req-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("returns an ist model for a repo with a class", async () => {
    mkdirSync(join(repoPath, "src"), { recursive: true });
    writeFileSync(join(repoPath, "src", "x.ts"), "export class Foo {}\n");
    const model = await loadIstForRequest(repoPath);
    expect(model.meta.source).toBe("ist");
    expect(model.nodes.map((n) => n.name)).toContain("Foo");
  });
});
