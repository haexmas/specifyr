import { describe, expect, it } from "vitest";
import { NODE_ID_PATTERN } from "../../../src/core/schemas.js";
import { istNodeId } from "../../../src/extractors/typescript/node-id.js";

describe("istNodeId", () => {
  it("returns an id that matches NODE_ID_PATTERN", () => {
    const id = istNodeId("src/auth/service.ts", "AuthService");
    expect(NODE_ID_PATTERN.test(id)).toBe(true);
  });

  it("is deterministic across runs", () => {
    const a = istNodeId("src/auth/service.ts", "AuthService");
    const b = istNodeId("src/auth/service.ts", "AuthService");
    expect(a).toBe(b);
  });

  it("differs by file even when the name is the same", () => {
    const a = istNodeId("src/auth/service.ts", "AuthService");
    const b = istNodeId("src/users/service.ts", "AuthService");
    expect(a).not.toBe(b);
  });

  it("differs by name even when the file is the same", () => {
    const a = istNodeId("src/auth/service.ts", "AuthService");
    const b = istNodeId("src/auth/service.ts", "OtherService");
    expect(a).not.toBe(b);
  });

  it("accepts the empty name for a module-level id", () => {
    const id = istNodeId("src/auth/service.ts", "");
    expect(NODE_ID_PATTERN.test(id)).toBe(true);
  });

  it("starts with the ts- prefix", () => {
    expect(istNodeId("src/x.ts", "Y")).toMatch(/^ts-/);
  });
});
