import { describe, expect, it } from "vitest";
import {
  NODE_TYPE_CLASSES,
  nodeTypeClasses,
} from "../../frontend/composables/node-type-classes.js";

describe("NODE_TYPE_CLASSES", () => {
  it("has a mapping for every SOLL top-level type from Slice X", () => {
    expect(NODE_TYPE_CLASSES.component).toBeDefined();
    expect(NODE_TYPE_CLASSES.module).toBeDefined();
    expect(NODE_TYPE_CLASSES["external-service"]).toBeDefined();
    expect(NODE_TYPE_CLASSES["data-store"]).toBeDefined();
  });

  it("has a mapping for every IST TypeScript pack type from Slice A", () => {
    expect(NODE_TYPE_CLASSES.class).toBeDefined();
    expect(NODE_TYPE_CLASSES.interface).toBeDefined();
    expect(NODE_TYPE_CLASSES["type-alias"]).toBeDefined();
    expect(NODE_TYPE_CLASSES.enum).toBeDefined();
    expect(NODE_TYPE_CLASSES.function).toBeDefined();
  });
});

describe("nodeTypeClasses", () => {
  it("returns the SOLL mapping for a known SOLL type", () => {
    expect(nodeTypeClasses("component")).toContain("bg-blue-100");
    expect(nodeTypeClasses("component")).toContain("border-blue-500");
  });

  it("returns the IST mapping for a known IST type", () => {
    expect(nodeTypeClasses("class")).toContain("bg-purple-100");
    expect(nodeTypeClasses("class")).toContain("border-purple-500");
  });

  it("falls back to a neutral class string for an unknown type", () => {
    const fallback = nodeTypeClasses("mystery-type");
    expect(fallback).toContain("border-gray-400");
  });
});
