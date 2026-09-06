import { describe, expect, it } from "vitest";
import { bucketForNode, SUPPORTED_NODE_TYPES } from "../../src/storage/bucket.ts";

describe("bucketForNode", () => {
  it("maps component to components/ folder layout", () => {
    expect(bucketForNode({ id: "auth", type: "component", name: "Auth" })).toEqual({
      bucket: "components",
      layout: "folder",
    });
  });

  it("maps module to components/ folder layout", () => {
    expect(bucketForNode({ id: "core", type: "module", name: "Core" })).toEqual({
      bucket: "components",
      layout: "folder",
    });
  });

  it("maps external-service to external/ file layout", () => {
    expect(bucketForNode({ id: "stripe", type: "external-service", name: "Stripe" })).toEqual({
      bucket: "external",
      layout: "file",
    });
  });

  it("maps data-store to external/ file layout", () => {
    expect(bucketForNode({ id: "postgres", type: "data-store", name: "Postgres" })).toEqual({
      bucket: "external",
      layout: "file",
    });
  });

  it("throws for an unknown node type and lists supported types in the message", () => {
    expect(() =>
      bucketForNode({ id: "auth", type: "person", name: "Auth" }),
    ).toThrow(/person.*supported.*component/i);
  });

  it("exposes the supported set for callers that need to whitelist upfront", () => {
    expect(SUPPORTED_NODE_TYPES).toEqual(["component", "module", "external-service", "data-store"]);
  });
});
