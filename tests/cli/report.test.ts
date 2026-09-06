import { describe, expect, it } from "vitest";
import { formatInitReport, formatStatusReport } from "../../src/cli/report.js";

describe("formatInitReport", () => {
  it("mentions the repo path where SOLL was created", () => {
    const output = formatInitReport({ repoPath: "/tmp/repo", createdEmpty: true });
    expect(output).toMatch(/\/tmp\/repo/);
    expect(output).toMatch(/created/i);
  });
});

describe("formatStatusReport", () => {
  it("shows meta, node counts grouped by type, and edge count", () => {
    const output = formatStatusReport({
      repoPath: "/tmp/repo",
      meta: { source: "soll", generatedAt: "2026-09-06T12:00:00Z" },
      nodesByType: [
        { type: "component", count: 2 },
        { type: "data-store", count: 1 },
      ],
      totalNodes: 3,
      totalEdges: 1,
    });
    expect(output).toMatch(/\/tmp\/repo/);
    expect(output).toMatch(/source:\s+soll/);
    expect(output).toMatch(/2026-09-06T12:00:00Z/);
    expect(output).toMatch(/component:\s+2/);
    expect(output).toMatch(/data-store:\s+1/);
    expect(output).toMatch(/nodes:\s+3/);
    expect(output).toMatch(/edges:\s+1/);
  });

  it("omits the generated-at line when absent", () => {
    const output = formatStatusReport({
      repoPath: "/tmp/repo",
      meta: { source: "soll" },
      nodesByType: [],
      totalNodes: 0,
      totalEdges: 0,
    });
    expect(output).not.toMatch(/generated at/);
    expect(output).toMatch(/nodes:\s+0/);
    expect(output).toMatch(/edges:\s+0/);
  });
});
