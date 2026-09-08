import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSollForRequest } from "../../frontend/server/utils/soll.js";
import { saveSoll } from "../../src/storage/soll.js";

describe("loadSollForRequest", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-frontend-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("returns an empty model when SOLL is empty", async () => {
    await saveSoll(repoPath, { meta: { source: "soll" }, nodes: [], edges: [] });

    const model = await loadSollForRequest(repoPath);
    expect(model.meta.source).toBe("soll");
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it("returns an empty model when SOLL was never initialized", async () => {
    // repoPath exists (mkdtemp) but has no .specifyr/ subtree — a fresh
    // repo the user opens with `specifyr editor` before running `init`.
    const model = await loadSollForRequest(repoPath);
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

    const model = await loadSollForRequest(repoPath);
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["auth", "postgres"]);
    expect(model.edges).toHaveLength(1);
  });
});
