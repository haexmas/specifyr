import { describe, expect, it } from "vitest";
import { formatNodeDetails } from "../../frontend/composables/format-node-details.js";

describe("formatNodeDetails", () => {
  it("returns id, type, and name for a minimal node", () => {
    const rows = formatNodeDetails({
      id: "ts-abc123def456",
      type: "class",
      name: "AuthService",
      classes: [],
    });
    expect(rows).toEqual([
      { label: "id", value: "ts-abc123def456" },
      { label: "type", value: "class" },
      { label: "name", value: "AuthService" },
    ]);
  });

  it("appends description when present", () => {
    const rows = formatNodeDetails({
      id: "auth",
      type: "component",
      name: "Auth",
      description: "handles sessions",
      classes: [],
    });
    expect(rows).toContainEqual({ label: "description", value: "handles sessions" });
  });

  it("appends path when present", () => {
    const rows = formatNodeDetails({
      id: "auth",
      type: "component",
      name: "Auth",
      path: "src/auth/",
      classes: [],
    });
    expect(rows).toContainEqual({ label: "path", value: "src/auth/" });
  });

  it("omits description and path rows when absent (does not render empty rows)", () => {
    const rows = formatNodeDetails({
      id: "auth",
      type: "component",
      name: "Auth",
      classes: [],
    });
    const labels = rows.map((r) => r.label);
    expect(labels).not.toContain("description");
    expect(labels).not.toContain("path");
  });

  it("preserves row order: id, type, name, description, path", () => {
    const rows = formatNodeDetails({
      id: "auth",
      type: "component",
      name: "Auth",
      description: "d",
      path: "p",
      classes: [],
    });
    expect(rows.map((r) => r.label)).toEqual(["id", "type", "name", "description", "path"]);
  });
});
