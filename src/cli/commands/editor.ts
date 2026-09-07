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
    try {
      const res = await fetch(url);
      await res.arrayBuffer();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
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
  const url = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [FRONTEND_SERVER], {
    env: editorChildEnv(process.env, { repoPath, port }),
    stdio: ["ignore", "inherit", "inherit"],
  });

  const shutdown = (): void => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  child.once("exit", () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  });

  await waitForHttpReady({ url: `${url}/`, timeoutMs: 15000 });

  process.stdout.write(`Editor running at ${url} (SOLL: ${repoPath})\n`);

  if (openBrowser) {
    await open(url);
    process.stdout.write("Browser opened.\n");
  }

  return child;
}
