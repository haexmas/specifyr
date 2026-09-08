import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRepoPath } from "../../frontend/server/utils/repo-path.js";

describe("resolveRepoPath", () => {
  const originalEnv = process.env.SPECIFYR_REPO_PATH;

  beforeEach(() => {
    // biome-ignore lint/performance/noDelete: env "" would leak the literal "undefined"
    delete process.env.SPECIFYR_REPO_PATH;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      // biome-ignore lint/performance/noDelete: env "" would leak the literal "undefined"
      delete process.env.SPECIFYR_REPO_PATH;
    } else {
      process.env.SPECIFYR_REPO_PATH = originalEnv;
    }
  });

  it("returns the query value when present", () => {
    expect(resolveRepoPath({ repoPath: "/from/query" })).toBe("/from/query");
  });

  it("prefers query over the env fallback", () => {
    process.env.SPECIFYR_REPO_PATH = "/from/env";
    expect(resolveRepoPath({ repoPath: "/from/query" })).toBe("/from/query");
  });

  it("falls through to env when query is whitespace-only", () => {
    process.env.SPECIFYR_REPO_PATH = "/from/env";
    expect(resolveRepoPath({ repoPath: "   " })).toBe("/from/env");
  });

  it("falls through to env when query is missing", () => {
    process.env.SPECIFYR_REPO_PATH = "/from/env";
    expect(resolveRepoPath({})).toBe("/from/env");
    expect(resolveRepoPath(undefined)).toBe("/from/env");
  });

  it("picks the first entry when query.repoPath is an array", () => {
    expect(resolveRepoPath({ repoPath: ["/first", "/second"] })).toBe("/first");
  });

  it("throws when both query and env are missing", () => {
    expect(() => resolveRepoPath({})).toThrow(/No repository path selected/);
    expect(() => resolveRepoPath(undefined)).toThrow(/No repository path selected/);
  });

  it("throws when query is empty and env is unset", () => {
    expect(() => resolveRepoPath({ repoPath: "" })).toThrow(/No repository path selected/);
    expect(() => resolveRepoPath({ repoPath: "   " })).toThrow(/No repository path selected/);
  });
});
