import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Model } from "../../src/core/schemas.ts";
import { loadSoll, saveSoll } from "../../src/storage/soll.ts";

describe("SOLL storage round-trip", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-rt-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("save-then-load returns an equivalent model", async () => {
    const source: Model = {
      meta: { source: "soll", generatedAt: "2026-09-06T12:00:00Z" },
      nodes: [
        { id: "auth", type: "component", name: "Auth", classes: [] },
        { id: "core", type: "module", name: "Core Module", classes: [] },
        { id: "postgres", type: "data-store", name: "Postgres", classes: [] },
        { id: "stripe", type: "external-service", name: "Stripe", classes: [] },
      ],
      edges: [
        { id: "e1", from: "auth", to: "postgres", type: "reads-from" },
        { id: "e2", from: "core", to: "stripe", type: "depends-on" },
      ],
    };

    await saveSoll(repoRoot, source);
    const loaded = await loadSoll(repoRoot);

    expect(loaded.meta).toEqual(source.meta);
    expect(loaded.nodes.map((n) => n.id).sort()).toEqual(source.nodes.map((n) => n.id).sort());
    expect(loaded.edges).toEqual(source.edges);
  });

  it("round-trips a model that only has a meta (no nodes, no edges)", async () => {
    await saveSoll(repoRoot, { meta: { source: "soll" }, nodes: [], edges: [] });
    const loaded = await loadSoll(repoRoot);
    expect(loaded.meta).toEqual({ source: "soll" });
    expect(loaded.nodes).toEqual([]);
    expect(loaded.edges).toEqual([]);
  });
});
