import { describe, expect, it } from "vitest";
import { ClassSchema, NodeSchema } from "../../src/core/schemas.ts";

describe("ClassSchema", () => {
  it("accepts a class with methods and attributes", () => {
    const parsed = ClassSchema.parse({
      name: "AuthService",
      methods: [{ name: "login" }, { name: "logout" }],
      attributes: [{ name: "sessionTimeoutMs", type: "number" }],
    });
    expect(parsed.name).toBe("AuthService");
    expect(parsed.methods).toHaveLength(2);
    expect(parsed.attributes[0]?.type).toBe("number");
  });

  it("rejects a class with a non-string name", () => {
    expect(() => ClassSchema.parse({ name: 42, methods: [], attributes: [] })).toThrow();
  });

  it("defaults methods and attributes to empty arrays when omitted", () => {
    const parsed = ClassSchema.parse({ name: "Empty" });
    expect(parsed.methods).toEqual([]);
    expect(parsed.attributes).toEqual([]);
  });
});

describe("NodeSchema", () => {
  it("accepts a minimal node", () => {
    const parsed = NodeSchema.parse({
      id: "auth",
      type: "component",
      name: "Auth",
    });
    expect(parsed.id).toBe("auth");
    expect(parsed.classes).toEqual([]);
  });

  it("carries through optional description, path, and classes", () => {
    const parsed = NodeSchema.parse({
      id: "auth",
      type: "component",
      name: "Auth",
      description: "handles session lifecycle",
      path: "src/auth/",
      classes: [{ name: "AuthService" }],
    });
    expect(parsed.description).toBe("handles session lifecycle");
    expect(parsed.classes[0]?.name).toBe("AuthService");
  });

  it("preserves extra vocabulary-driven attributes", () => {
    const parsed = NodeSchema.parse({
      id: "gateway",
      type: "gateway",
      name: "API Gateway",
      protocol: "http",
    });
    expect((parsed as Record<string, unknown>).protocol).toBe("http");
  });

  it("rejects a node id that violates the safe-path-segment rule", () => {
    expect(() =>
      NodeSchema.parse({ id: "../escape", type: "component", name: "x" }),
    ).toThrow();
  });

  it("rejects an id starting with a hyphen", () => {
    expect(() => NodeSchema.parse({ id: "-bad", type: "component", name: "x" })).toThrow();
  });
});
