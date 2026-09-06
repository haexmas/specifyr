import { describe, expect, it } from "vitest";
import { SUPPORTED_NODE_TYPES, bucketForNode } from "../../src/storage/bucket.ts";

describe("bucketForNode", () => {
  it("maps component to components/ folder layout", () => {
    expect(bucketForNode({ type: "component" })).toEqual({
      bucket: "components",
      layout: "folder",
    });
  });

  it("maps module to components/ folder layout", () => {
    expect(bucketForNode({ type: "module" })).toEqual({
      bucket: "components",
      layout: "folder",
    });
  });

  it("maps external-service to external/ file layout", () => {
    expect(bucketForNode({ type: "external-service" })).toEqual({
      bucket: "external",
      layout: "file",
    });
  });

  it("maps data-store to external/ file layout", () => {
    expect(bucketForNode({ type: "data-store" })).toEqual({
      bucket: "external",
      layout: "file",
    });
  });

  it("throws for an unknown node type and lists supported types in the message", () => {
    expect(() => bucketForNode({ type: "person" })).toThrow(/person.*supported.*component/i);
  });

  it("exposes the supported set for callers that need to whitelist upfront", () => {
    expect(SUPPORTED_NODE_TYPES).toEqual(["component", "module", "external-service", "data-store"]);
  });
});
