import { describe, expect, it } from "vitest";

describe("toolchain sanity", () => {
  it("runs a passing assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
