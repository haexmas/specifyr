import { describe, expect, it } from "vitest";
import { editorChildEnv, runEditor, waitForHttpReady } from "../../../src/cli/commands/editor.js";

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
  it("resolves when the URL responds successfully", async () => {
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

  it("keeps retrying when the URL responds with an error status", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.statusCode = 503;
      res.end("not ready");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await expect(
        waitForHttpReady({ url: `http://127.0.0.1:${port}/`, timeoutMs: 200 }),
      ).rejects.toThrow(/ready|timeout/i);
    } finally {
      server.close();
    }
  });

  it("aborts a response body that never completes", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("partial");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await expect(
        waitForHttpReady({ url: `http://127.0.0.1:${port}/`, timeoutMs: 150 }),
      ).rejects.toThrow(/ready|timeout/i);
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

describe("runEditor", () => {
  it("rejects an explicitly requested port that is already in use", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => res.end("another service"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await expect(runEditor({ repoPath: "/tmp/repo", port, openBrowser: false })).rejects.toThrow(
        /already in use/i,
      );
    } finally {
      server.close();
    }
  });
});
