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
const AUTOMATIC_START_ATTEMPTS = 3;
const EDITOR_READY_TIMEOUT_MS = 15000;

export interface EditorOptions {
  /** Optional default repo path. When omitted, the browser picker opens on landing. */
  repoPath: string | undefined;
  port?: number;
  openBrowser?: boolean;
}

/**
 * Builds the environment variables for the editor child process, stripping
 * test-related variables and setting SPECIFYR_REPO_PATH (when provided),
 * PORT, and NO_COLOR.
 *
 * @param parent - The parent process environment to inherit from.
 * @param options.repoPath - Path to the repository, or undefined to leave the
 *   frontend picker in charge (SPECIFYR_REPO_PATH is not set in that case).
 * @param options.port - Port number for the editor server.
 * @returns Clean environment with PORT/NO_COLOR set and SPECIFYR_REPO_PATH
 *   set only when `repoPath` was provided.
 */
export function editorChildEnv(
  parent: NodeJS.ProcessEnv,
  { repoPath, port }: { repoPath: string | undefined; port: number },
): NodeJS.ProcessEnv {
  const {
    VITEST: _v,
    VITEST_POOL_ID: _vp,
    VITEST_WORKER_ID: _vw,
    NODE_ENV: _ne,
    TEST: _t,
    SPECIFYR_REPO_PATH: _sp,
    ...clean
  } = parent;
  void [_v, _vp, _vw, _ne, _t, _sp];
  return {
    ...clean,
    ...(repoPath !== undefined ? { SPECIFYR_REPO_PATH: repoPath } : {}),
    // Bind Nitro to loopback so the browse endpoint (which lists any directory
    // the process can read) is not reachable from other hosts on the LAN.
    HOST: "127.0.0.1",
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
 * @param signal - Optional signal that aborts readiness polling.
 * @returns Resolves on a successful 2xx response, rejects when the timeout is reached.
 */
export async function waitForHttpReady({
  url,
  timeoutMs,
  intervalMs = 100,
  signal,
}: {
  url: string;
  timeoutMs: number;
  intervalMs?: number;
  signal?: AbortSignal;
}): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) {
      throw new Error(`Editor readiness polling aborted for ${url}`);
    }
    const remainingMs = timeoutMs - (Date.now() - started);
    const controller = new AbortController();
    const abortRequest = (): void => controller.abort();
    signal?.addEventListener("abort", abortRequest, { once: true });
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
      signal?.removeEventListener("abort", abortRequest);
    }
  }
  throw new Error(`Timed out waiting for editor to be ready at ${url} after ${timeoutMs}ms`);
}

/** Wait for the editor to become ready, failing immediately if its process exits. */
export async function waitForEditorReady(
  child: ChildProcess,
  url: string,
  timeoutMs = EDITOR_READY_TIMEOUT_MS,
): Promise<void> {
  const abortController = new AbortController();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false;

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      child.off("exit", onExit);
      abortController.abort();
      callback();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(() => {
        rejectPromise(
          new Error(
            `Editor process exited before readiness (code ${code ?? "unknown"}, ` +
              `signal ${signal ?? "unknown"})`,
          ),
        );
      });
    };

    child.once("exit", onExit);
    void waitForHttpReady({ url, timeoutMs, signal: abortController.signal }).then(
      () => finish(resolvePromise),
      (cause) => finish(() => rejectPromise(cause)),
    );
  });
}

interface StartedEditor {
  child: ChildProcess;
  shutdown: () => Promise<void>;
}

/** Spawn the frontend and attach the signal/shutdown lifecycle handlers. */
function spawnEditor(repoPath: string | undefined, port: number): StartedEditor {
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

  return { child, shutdown };
}

/** Spawn an editor and wait for its readiness contract. */
async function startEditor(
  repoPath: string | undefined,
  port: number,
  waitForReady: (child: ChildProcess, url: string) => Promise<void>,
): Promise<StartedEditor> {
  const started = spawnEditor(repoPath, port);
  try {
    await waitForReady(started.child, `http://127.0.0.1:${port}/`);
    return started;
  } catch (cause) {
    await started.shutdown();
    throw cause;
  }
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

  if (options.port !== undefined) {
    const availablePort = await getPort({ port: options.port });
    if (availablePort !== options.port) {
      throw new Error(`Port ${options.port} is already in use.`);
    }
    const port = options.port;
    const started = await startEditor(repoPath, port, (child, url) =>
      waitForEditorReady(child, url),
    );
    const url = `http://127.0.0.1:${port}`;

    process.stdout.write(
      `Editor running at ${url}${repoPath !== undefined ? ` (SOLL: ${repoPath})` : ""}\n`,
    );

    if (openBrowser) {
      try {
        await open(url);
      } catch (cause) {
        await started.shutdown();
        throw cause;
      }
      process.stdout.write("Browser opened.\n");
    }

    return started.child;
  }

  let started: StartedEditor | undefined;
  let startedPort: number | undefined;
  let lastCause: unknown;
  for (let attempt = 0; attempt < AUTOMATIC_START_ATTEMPTS; attempt += 1) {
    const port = await getPort();
    try {
      started = await startEditor(repoPath, port, (child, url) => waitForEditorReady(child, url));
      startedPort = port;
      break;
    } catch (cause) {
      lastCause = cause;
    }
  }

  if (!started || startedPort === undefined) {
    throw lastCause instanceof Error
      ? lastCause
      : new Error("Editor failed to start after automatic port retries.");
  }

  const url = `http://127.0.0.1:${startedPort}`;

  process.stdout.write(`Editor running at ${url} (SOLL: ${repoPath})\n`);

  if (openBrowser) {
    try {
      await open(url);
    } catch (cause) {
      await started.shutdown();
      throw cause;
    }
    process.stdout.write("Browser opened.\n");
  }

  return started.child;
}
