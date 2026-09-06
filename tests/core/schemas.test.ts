import { describe, expect, it } from "vitest";
import { ClassSchema } from "../../src/core/schemas.ts";

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
