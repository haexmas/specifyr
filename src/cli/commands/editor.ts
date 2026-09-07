import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import getPort, { portNumbers } from "get-port";
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

export async function runEditor(options: EditorOptions): Promise<ChildProcess> {
  const { repoPath, openBrowser = true } = options;

  if (!existsSync(FRONTEND_SERVER)) {
    throw new Error(`Editor build not found at ${FRONTEND_SERVER}. Run \`pnpm build\` first.`);
  }

  const port = options.port ?? (await getPort({ port: portNumbers(3939, 3999) }));
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

  const shutdown = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolvePromise) => {
        child.once("exit", () => resolvePromise());
      });
    }
  };
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
