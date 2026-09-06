import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSoll } from "../../src/storage/soll.ts";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("loadSoll (happy path)", () => {
  let repoRoot: string;
  let sollRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-load-"));
    sollRoot = join(repoRoot, ".specifyr", "soll");
    mkdirSync(join(sollRoot, "components"), { recursive: true });
    mkdirSync(join(sollRoot, "external"), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns an empty model when only _meta.json and _index.json exist", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), { edges: [] });

    const model = await loadSoll(repoRoot);
    expect(model.meta.source).toBe("soll");
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it("assembles nodes from components/<id>/component.json and external/<id>.json", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), {
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });

    const authDir = join(sollRoot, "components", "auth");
    mkdirSync(authDir);
    writeJson(join(authDir, "component.json"), {
      id: "auth",
      type: "component",
      name: "Auth",
    });

    writeJson(join(sollRoot, "external", "postgres.json"), {
      id: "postgres",
      type: "data-store",
      name: "Postgres",
    });

    const model = await loadSoll(repoRoot);
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["auth", "postgres"]);
    expect(model.edges).toEqual([{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }]);
  });

  it("returns nodes and edges in a deterministic order", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), { edges: [] });

    for (const id of ["zeta", "alpha", "middle"]) {
      const dir = join(sollRoot, "components", id);
      mkdirSync(dir);
      writeJson(join(dir, "component.json"), { id, type: "component", name: id });
    }

    const model = await loadSoll(repoRoot);
    expect(model.nodes.map((n) => n.id)).toEqual(["alpha", "middle", "zeta"]);
  });
});
