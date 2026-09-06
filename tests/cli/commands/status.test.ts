import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runStatus } from "../../../src/cli/commands/status.js";
import { saveSoll } from "../../../src/storage/soll.js";

describe("runStatus", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-status-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("summarises an empty SOLL", async () => {
    await saveSoll(repoPath, { meta: { source: "soll" }, nodes: [], edges: [] });
    const report = await runStatus({ repoPath });

    expect(report).toEqual({
      repoPath,
      meta: { source: "soll" },
      nodesByType: [],
      totalNodes: 0,
      totalEdges: 0,
    });
  });

  it("groups node counts by type in alphabetical order", async () => {
    await saveSoll(repoPath, {
      meta: { source: "soll", generatedAt: "2026-09-06T12:00:00Z" },
      nodes: [
        { id: "auth", type: "component", name: "Auth", classes: [] },
        { id: "users", type: "component", name: "Users", classes: [] },
        { id: "stripe", type: "external-service", name: "Stripe", classes: [] },
        { id: "postgres", type: "data-store", name: "Postgres", classes: [] },
      ],
      edges: [
        { id: "e1", from: "auth", to: "postgres", type: "reads-from" },
        { id: "e2", from: "users", to: "stripe", type: "depends-on" },
      ],
    });

    const report = await runStatus({ repoPath });
    expect(report.totalNodes).toBe(4);
    expect(report.totalEdges).toBe(2);
    expect(report.nodesByType).toEqual([
      { type: "component", count: 2 },
      { type: "data-store", count: 1 },
      { type: "external-service", count: 1 },
    ]);
    expect(report.meta.generatedAt).toBe("2026-09-06T12:00:00Z");
  });

  it("propagates loadSoll errors", async () => {
    await expect(runStatus({ repoPath })).rejects.toThrow(/_meta\.json/);
  });
});
