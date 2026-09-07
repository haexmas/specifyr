import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveSoll } from "../../src/storage/soll.js";

const CLI_ENTRY = resolve(process.cwd(), "dist", "cli", "index.js");
const FRONTEND_BUILD = resolve(process.cwd(), "frontend", ".output", "server", "index.mjs");

/**
 * Removes Vitest-specific environment variables that can interfere with child
 * process console output.
 *
 * @param env - The environment to clean.
 * @returns A clean environment without test-related variables.
 */
function stripVitestEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const {
    VITEST: _v,
    VITEST_POOL_ID: _vp,
    VITEST_WORKER_ID: _vw,
    NODE_ENV: _ne,
    TEST: _t,
    ...clean
  } = env;
  void [_v, _vp, _vw, _ne, _t];
  return { ...clean, NO_COLOR: "1" };
}

/**
 * Waits for a child process to emit output matching the given pattern on
 * stdout or stderr.
 *
 * @param child - The child process to monitor.
 * @param needle - Regular expression to match in the output.
 * @param timeoutMs - Maximum milliseconds to wait.
 * @returns The matched string from the output.
 */
async function waitForOutput(
  child: ChildProcessWithoutNullStreams,
  needle: RegExp,
  timeoutMs: number,
): Promise<string> {
  return await new Promise((resolvePromise, rejectPromise) => {
    let buffer = "";
    const timer = setTimeout(() => {
      rejectPromise(new Error(`Timed out waiting for ${needle} in\n${buffer}`));
    }, timeoutMs);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const match = buffer.match(needle);
      if (match) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.stderr.off("data", onData);
        resolvePromise(match[0]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });
}

describe("specifyr editor (end-to-end)", () => {
  let repoPath: string;
  let child: ChildProcessWithoutNullStreams | undefined;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) {
      throw new Error(`CLI not built: ${CLI_ENTRY} — run 'pnpm build'`);
    }
    if (!existsSync(FRONTEND_BUILD)) {
      throw new Error(`Frontend not built: ${FRONTEND_BUILD}`);
    }
  });

  beforeEach(async () => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-editor-e2e-"));
    await saveSoll(repoPath, {
      meta: { source: "soll", generatedAt: "2026-09-07T12:00:00Z" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });
  });

  afterEach(() => {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
    child = undefined;
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("boots the editor, serves /api/soll, and returns the current model", async () => {
    child = spawn(process.execPath, [CLI_ENTRY, "editor", repoPath, "--no-open"], {
      env: stripVitestEnv(process.env),
    }) as ChildProcessWithoutNullStreams;

    const runningLine = await waitForOutput(
      child,
      /Editor running at (http:\/\/127\.0\.0\.1:\d+)/,
      20000,
    );
    const url = runningLine.replace(/^Editor running at /, "");

    const res = await fetch(`${url}/api/soll`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meta: { source: string; generatedAt: string };
      nodes: Array<{ id: string }>;
    };
    expect(body.meta).toEqual({ source: "soll", generatedAt: "2026-09-07T12:00:00Z" });
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0]?.id).toBe("auth");
  }, 30000);
});
