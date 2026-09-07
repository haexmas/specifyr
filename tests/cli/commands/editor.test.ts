import { describe, expect, it } from "vitest";
import { editorChildEnv, waitForHttpReady } from "../../../src/cli/commands/editor.js";

describe("editorChildEnv", () => {
  it("sets SPECIFYR_REPO_PATH and PORT and preserves the rest", () => {
    const env = editorChildEnv({ FOO: "bar" }, { repoPath: "/tmp/repo", port: 3939 });
    expect(env.SPECIFYR_REPO_PATH).toBe("/tmp/repo");
    expect(env.PORT).toBe("3939");
    expect(env.FOO).toBe("bar");
  });

  it("strips vitest env vars so consola prints normally in the child", () => {
    const env = editorChildEnv(
      {
        VITEST: "true",
        VITEST_POOL_ID: "1",
        VITEST_WORKER_ID: "1",
        NODE_ENV: "test",
        TEST: "true",
      },
      { repoPath: "/tmp/repo", port: 3939 },
    );
    expect(env.VITEST).toBeUndefined();
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.TEST).toBeUndefined();
  });
});

describe("waitForHttpReady", () => {
  it("resolves as soon as the URL responds with any status", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await waitForHttpReady({ url: `http://127.0.0.1:${port}/`, timeoutMs: 2000 });
    } finally {
      server.close();
    }
  });

  it("rejects with a timeout when the URL never responds", async () => {
    await expect(waitForHttpReady({ url: "http://127.0.0.1:1/", timeoutMs: 200 })).rejects.toThrow(
      /ready|timeout/i,
    );
  });
});
