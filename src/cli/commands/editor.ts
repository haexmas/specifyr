import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import open from "open";

const HERE = dirname(fileURLToPath(import.meta.url));
// From dist/cli/commands/editor.js to frontend/.output/server/index.mjs
const FRONTEND_SERVER = resolve(
  HERE,
  "..",
  "..",
  "..",
  "frontend",
  ".output",
  "server",
  "index.mjs",
);

export interface EditorOptions {
  repoPath: string;
  port?: number;
  openBrowser?: boolean;
}

/**
 * Builds the environment variables for the editor child process, stripping
 * test-related variables and setting SPECIFYR_REPO_PATH, PORT, and NO_COLOR.
 *
 * @param parent - The parent process environment to inherit from.
 * @param options.repoPath - Path to the repository containing .specifyr/soll/.
 * @param options.port - Port number for the editor server.
 * @returns Clean environment with SPECIFYR_REPO_PATH, PORT, and NO_COLOR set.
 */
export function editorChildEnv(
  parent: NodeJS.ProcessEnv,
  { repoPath, port }: { repoPath: string; port: number },
): NodeJS.ProcessEnv {
  const {
    VITEST: _v,
    VITEST_POOL_ID: _vp,
    VITEST_WORKER_ID: _vw,
    NODE_ENV: _ne,
    TEST: _t,
    ...clean
  } = parent;
  void [_v, _vp, _vw, _ne, _t];
  return {
    ...clean,
    SPECIFYR_REPO_PATH: repoPath,
    PORT: String(port),
    NO_COLOR: parent.NO_COLOR ?? "1",
  };
}

/**
 * Polls the given URL until it responds with a successful 2xx status or the
 * timeout is reached. Request and response-body errors are retried until the
 * timeout.
 *
 * @param url - The URL to poll for readiness.
 * @param timeoutMs - Maximum milliseconds to wait before throwing.
 * @param intervalMs - Milliseconds to wait between retry attempts (default: 100).
 * @returns Resolves on a successful 2xx response, rejects when the timeout is reached.
 */
export async function waitForHttpReady({
  url,
  timeoutMs,
  intervalMs = 100,
}: {
  url: string;
  timeoutMs: number;
  intervalMs?: number;
}): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - started);
    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), remainingMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Editor readiness endpoint returned HTTP ${res.status}`);
      }
      await res.arrayBuffer();
      return;
    } catch {
      const delayMs = Math.min(intervalMs, timeoutMs - (Date.now() - started));
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } finally {
      clearTimeout(requestTimeout);
    }
  }
  throw new Error(`Timed out waiting for editor to be ready at ${url} after ${timeoutMs}ms`);
}

/**
 * Spawns the Nuxt frontend as a child process, waits for it to be ready, and
 * optionally opens it in the browser. The child ignores stdin and inherits
 * stdout and stderr so logs appear in the parent's console.
 *
 * @param options - Configuration for the editor server.
 * @returns The spawned child process, already listening and ready.
 */
export async function runEditor(options: EditorOptions): Promise<ChildProcess> {
  const { repoPath, openBrowser = true } = options;

  if (!existsSync(FRONTEND_SERVER)) {
    throw new Error(`Editor build not found at ${FRONTEND_SERVER}. Run \`pnpm build\` first.`);
  }

  // Automatic ports must come from the OS-assigned ephemeral range. A
  // preferred fixed range is race-prone when multiple CLI processes start at
  // the same time: each process can observe the same port as free before
  // either child binds it.
  const port = options.port ?? (await getPort());
  if (options.port !== undefined) {
    const availablePort = await getPort({ port: options.port });
    if (availablePort !== options.port) {
      throw new Error(`Port ${options.port} is already in use.`);
    }
  }
  const url = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [FRONTEND_SERVER], {
    env: editorChildEnv(process.env, { repoPath, port }),
    stdio: ["ignore", "inherit", "inherit"],
  });

  /** Gracefully terminates the child process if still running. */
  const shutdown = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolvePromise) => {
        child.once("exit", () => resolvePromise());
      });
    }
  };
  /** Handles SIGINT/SIGTERM by triggering graceful shutdown. */
  const handleSignal = (): void => {
    void shutdown();
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  child.once("exit", () => {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  });

  try {
    await waitForHttpReady({ url: `${url}/`, timeoutMs: 15000 });
  } catch (cause) {
    await shutdown();
    throw cause;
  }

  process.stdout.write(`Editor running at ${url} (SOLL: ${repoPath})\n`);

  if (openBrowser) {
    try {
      await open(url);
    } catch (cause) {
      await shutdown();
      throw cause;
    }
    process.stdout.write("Browser opened.\n");
  }

  return child;
}
