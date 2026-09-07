import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const CLI_ENTRY = resolve(process.cwd(), "dist", "cli", "index.js");
const FRONTEND_BUILD = resolve(process.cwd(), "frontend", ".output", "server", "index.mjs");

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

describe("specifyr editor /api/ist (end-to-end)", () => {
  let child: ChildProcessWithoutNullStreams | undefined;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) {
      throw new Error(`CLI not built: ${CLI_ENTRY} — run 'pnpm build'`);
    }
    if (!existsSync(FRONTEND_BUILD)) {
      throw new Error(`Frontend not built: ${FRONTEND_BUILD}`);
    }
  });

  afterEach(() => {
    if (child && !child.killed) child.kill("SIGTERM");
    child = undefined;
  });

  it("extracts IST nodes from the specifyr repo itself", async () => {
    const repoRoot = process.cwd(); // The specifyr repo — has plenty of TS.
    child = spawn(process.execPath, [CLI_ENTRY, "editor", repoRoot, "--no-open"], {
      env: stripVitestEnv(process.env),
    }) as ChildProcessWithoutNullStreams;

    const runningLine = await waitForOutput(
      child,
      /Editor running at (http:\/\/127\.0\.0\.1:\d+)/,
      20000,
    );
    const url = runningLine.replace(/^Editor running at /, "");

    const res = await fetch(`${url}/api/ist`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meta: { source: string };
      nodes: Array<{ type: string; name: string }>;
      edges: Array<{ id: string; from: string; to: string; type: string }>;
    };
    expect(body.meta.source).toBe("ist");
    expect(body.nodes.length).toBeGreaterThan(10);
    const names = body.nodes.map((n) => n.name);
    expect(names).toContain("src/core/schemas.ts");
    expect(body.edges.length).toBeGreaterThan(0);
    for (const edge of body.edges) {
      expect(edge.type).toBe("imports");
      expect(edge.id).toMatch(/^tse-[0-9a-f]{12}$/);
    }

    // Sanity check: the page bundle references ELK, so the layout composable
    // is wired in. A regression that dropped useElkLayout would silently ship
    // a build with the grid math again — this catches that.
    const { readFileSync, readdirSync } = await import("node:fs");
    const publicNuxt = resolve(process.cwd(), "frontend", ".output", "public", "_nuxt");
    const bundles = readdirSync(publicNuxt).filter((n) => n.endsWith(".js"));
    const anyMentionsElk = bundles.some((name) => {
      const content = readFileSync(resolve(publicNuxt, name), "utf8");
      return (
        content.includes("elkjs") || content.includes("elk.algorithm") || content.includes("ELK")
      );
    });
    expect(anyMentionsElk).toBe(true);
  }, 30000);
});
