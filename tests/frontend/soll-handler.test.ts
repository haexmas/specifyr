import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSollForRequest } from "../../frontend/server/utils/soll.js";
import { saveSoll } from "../../src/storage/soll.js";

describe("loadSollForRequest", () => {
  let repoPath: string;
  const originalEnv = process.env.SPECIFYR_REPO_PATH;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-frontend-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
    // biome-ignore lint/performance/noDelete: must remove key; assigning undefined coerces to string
    if (originalEnv === undefined) delete process.env.SPECIFYR_REPO_PATH;
    else process.env.SPECIFYR_REPO_PATH = originalEnv;
  });

  it("throws when SPECIFYR_REPO_PATH is not set", async () => {
    // biome-ignore lint/performance/noDelete: must remove key; assigning undefined coerces to string
    delete process.env.SPECIFYR_REPO_PATH;
    await expect(loadSollForRequest()).rejects.toThrow(/SPECIFYR_REPO_PATH/);
  });

  it("returns an empty model when SOLL is empty", async () => {
    await saveSoll(repoPath, { meta: { source: "soll" }, nodes: [], edges: [] });
    process.env.SPECIFYR_REPO_PATH = repoPath;

    const model = await loadSollForRequest();
    expect(model.meta.source).toBe("soll");
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it("returns a populated model with nodes and edges", async () => {
    await saveSoll(repoPath, {
      meta: { source: "soll" },
      nodes: [
        { id: "auth", type: "component", name: "Auth", classes: [] },
        { id: "postgres", type: "data-store", name: "Postgres", classes: [] },
      ],
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });
    process.env.SPECIFYR_REPO_PATH = repoPath;

    const model = await loadSollForRequest();
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["auth", "postgres"]);
    expect(model.edges).toHaveLength(1);
  });
});
