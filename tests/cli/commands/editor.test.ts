import { spawn } from "node:child_process";
import open from "open";
import { describe, expect, it, vi } from "vitest";
import {
  editorChildEnv,
  runEditor,
  waitForEditorReady,
  waitForHttpReady,
} from "../../../src/cli/commands/editor.js";

vi.mock("open", () => ({ default: vi.fn() }));

describe("editorChildEnv", () => {
  it("sets SPECIFYR_REPO_PATH and PORT and preserves the rest", () => {
    const env = editorChildEnv({ FOO: "bar" }, { repoPath: "/tmp/repo", port: 3939 });
    expect(env.SPECIFYR_REPO_PATH).toBe("/tmp/repo");
    expect(env.PORT).toBe("3939");
    expect(env.FOO).toBe("bar");
  });

  it("omits SPECIFYR_REPO_PATH when repoPath is undefined", () => {
    const env = editorChildEnv(
      { FOO: "bar", SPECIFYR_REPO_PATH: "/leftover" },
      { repoPath: undefined, port: 3939 },
    );
    expect("SPECIFYR_REPO_PATH" in env).toBe(false);
    expect(env.PORT).toBe("3939");
    expect(env.FOO).toBe("bar");
  });

  it("options.repoPath wins over an inherited SPECIFYR_REPO_PATH in the parent env", () => {
    const env = editorChildEnv(
      { SPECIFYR_REPO_PATH: "/inherited" },
      { repoPath: "/chosen", port: 3939 },
    );
    expect(env.SPECIFYR_REPO_PATH).toBe("/chosen");
  });

  it("pins the server to loopback via HOST", () => {
    const env = editorChildEnv({}, { repoPath: "/tmp/repo", port: 3939 });
    expect(env.HOST).toBe("127.0.0.1");
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

  it("fails immediately when the editor exits before becoming ready", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(23)"]);
    await expect(waitForEditorReady(child, "http://127.0.0.1:1/", 2000)).rejects.toThrow(
      /exited before readiness/,
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

  it("shuts down the frontend when opening the browser fails", async () => {
    const { createServer } = await import("node:http");
    const portProbe = createServer();
    await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
    const port = (portProbe.address() as { port: number }).port;
    await new Promise<void>((resolve) => portProbe.close(() => resolve()));

    vi.mocked(open).mockRejectedValueOnce(new Error("browser unavailable"));
    await expect(runEditor({ repoPath: "/tmp/repo", port })).rejects.toThrow("browser unavailable");

    const server = createServer((_req, res) => res.end("port is free"));
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve());
      });
    } finally {
      server.close();
    }
  });
});
