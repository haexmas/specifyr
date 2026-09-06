import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ClassSchema, EdgeSchema, ModelSchema, NodeSchema } from "../../src/core/schemas.ts";

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
    expect(() => NodeSchema.parse({ id: "../escape", type: "component", name: "x" })).toThrow();
  });

  it("rejects an id starting with a hyphen", () => {
    expect(() => NodeSchema.parse({ id: "-bad", type: "component", name: "x" })).toThrow();
  });

  it("rejects a 65-character id", () => {
    const id = "a".repeat(65);
    expect(() => NodeSchema.parse({ id, type: "component", name: "x" })).toThrow();
  });

  it("rejects an id that starts with an underscore", () => {
    expect(() => NodeSchema.parse({ id: "_bad", type: "component", name: "x" })).toThrow();
  });
});

describe("EdgeSchema", () => {
  it("accepts a well-formed edge", () => {
    const parsed = EdgeSchema.parse({
      id: "edge-1",
      from: "auth",
      to: "users",
      type: "depends-on",
    });
    expect(parsed.from).toBe("auth");
  });

  it("rejects an edge missing from/to", () => {
    expect(() => EdgeSchema.parse({ id: "edge-1", type: "depends-on" })).toThrow();
  });

  it("rejects an edge whose `from` violates the id pattern", () => {
    expect(() =>
      EdgeSchema.parse({ id: "edge-1", from: "../nope", to: "users", type: "calls" }),
    ).toThrow();
  });

  it("rejects an edge whose `to` violates the id pattern", () => {
    expect(() =>
      EdgeSchema.parse({ id: "edge-1", from: "auth", to: "../nope", type: "calls" }),
    ).toThrow();
  });
});

describe("ModelSchema", () => {
  it("accepts a well-formed SOLL model", () => {
    const parsed = ModelSchema.parse({
      nodes: [
        { id: "auth", type: "component", name: "Auth" },
        { id: "users", type: "component", name: "Users" },
      ],
      edges: [{ id: "e1", from: "auth", to: "users", type: "depends-on" }],
      meta: { source: "soll" },
    });
    expect(parsed.meta.source).toBe("soll");
  });

  it("rejects duplicate node ids", () => {
    expect(() =>
      ModelSchema.parse({
        nodes: [
          { id: "auth", type: "component", name: "Auth" },
          { id: "auth", type: "component", name: "Auth 2" },
        ],
        edges: [],
        meta: { source: "soll" },
      }),
    ).toThrow(/duplicate node id/);
  });

  it("rejects an edge whose from does not reference a known node", () => {
    expect(() =>
      ModelSchema.parse({
        nodes: [{ id: "auth", type: "component", name: "Auth" }],
        edges: [{ id: "e1", from: "ghost", to: "auth", type: "depends-on" }],
        meta: { source: "soll" },
      }),
    ).toThrow(/edge.*ghost/);
  });

  it("rejects an unknown meta.source", () => {
    expect(() =>
      ModelSchema.parse({ nodes: [], edges: [], meta: { source: "unknown" } }),
    ).toThrow();
  });

  it("accepts meta.source of plan and ist", () => {
    const plan = ModelSchema.parse({ nodes: [], edges: [], meta: { source: "plan" } });
    const ist = ModelSchema.parse({ nodes: [], edges: [], meta: { source: "ist" } });
    expect(plan.meta.source).toBe("plan");
    expect(ist.meta.source).toBe("ist");
  });

  it("defaults empty nodes and edges when omitted", () => {
    const parsed = ModelSchema.parse({ meta: { source: "soll" } });
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });

  it("reports every duplicate node id when three collide", () => {
    try {
      ModelSchema.parse({
        nodes: [
          { id: "auth", type: "component", name: "Auth 1" },
          { id: "auth", type: "component", name: "Auth 2" },
          { id: "auth", type: "component", name: "Auth 3" },
        ],
        edges: [],
        meta: { source: "soll" },
      });
      throw new Error("expected ModelSchema.parse to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(z.ZodError);
      const zodErr = err as z.ZodError;
      const duplicatePaths = zodErr.issues
        .filter((issue) => issue.message.startsWith("duplicate node id"))
        .map((issue) => issue.path);
      expect(duplicatePaths).toEqual([
        ["nodes", 1, "id"],
        ["nodes", 2, "id"],
      ]);
    }
  });
});
