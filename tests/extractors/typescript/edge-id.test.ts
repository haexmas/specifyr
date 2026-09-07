import { describe, expect, it } from "vitest";
import { istEdgeId } from "../../../src/extractors/typescript/edge-id.js";

describe("istEdgeId", () => {
  it("returns a stable id for the same (from, to, type)", () => {
    const a = istEdgeId("ts-abc123abc123", "ts-def456def456", "imports");
    const b = istEdgeId("ts-abc123abc123", "ts-def456def456", "imports");
    expect(a).toBe(b);
  });

  it("differs when the source node changes", () => {
    const a = istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports");
    const b = istEdgeId("ts-cccccccccccc", "ts-bbbbbbbbbbbb", "imports");
    expect(a).not.toBe(b);
  });

  it("differs when the target node changes", () => {
    const a = istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports");
    const b = istEdgeId("ts-aaaaaaaaaaaa", "ts-cccccccccccc", "imports");
    expect(a).not.toBe(b);
  });

  it("differs when the edge type changes", () => {
    const a = istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports");
    const b = istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "extends");
    expect(a).not.toBe(b);
  });

  it("starts with the tse- prefix", () => {
    expect(istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports")).toMatch(/^tse-/);
  });

  it("total length is 16 chars", () => {
    expect(istEdgeId("ts-aaaaaaaaaaaa", "ts-bbbbbbbbbbbb", "imports")).toHaveLength(16);
  });
});
