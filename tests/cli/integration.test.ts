import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const CLI_ENTRY = resolve(process.cwd(), "dist", "cli", "index.js");

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[]): Promise<CliResult> {
  // Strip vitest markers so consola (used by citty for --help) does not switch
  // to its silent test reporter in the child process.
  const {
    VITEST: _v,
    VITEST_POOL_ID: _vp,
    VITEST_WORKER_ID: _vw,
    NODE_ENV: _ne,
    TEST: _t,
    ...rest
  } = process.env;
  const env: NodeJS.ProcessEnv = { ...rest, NO_COLOR: "1" };
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

describe("specifyr CLI (end-to-end)", () => {
  let repoPath: string;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) {
      throw new Error(`CLI entry not built: ${CLI_ENTRY}. Run 'pnpm build' before this test.`);
    }
  });

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-e2e-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("init followed by status walks the full flow", async () => {
    const init = await runCli(["init", repoPath]);
    expect(init.exitCode).toBe(0);
    expect(init.stdout).toContain("Created .specifyr/soll/ under");
    expect(init.stdout).toContain(repoPath);

    expect(existsSync(join(repoPath, ".specifyr", "soll", "_meta.json"))).toBe(true);

    const status = await runCli(["status", repoPath]);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toMatch(/SOLL summary for/);
    expect(status.stdout).toMatch(/nodes:\s+0/);
    expect(status.stdout).toMatch(/edges:\s+0/);
  });

  it("status on an uninitialized directory exits 1 with a helpful stderr", async () => {
    const result = await runCli(["status", repoPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/_meta\.json/);
  });

  it("--help lists the two commands", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/init/);
    expect(output).toMatch(/status/);
  });
});
