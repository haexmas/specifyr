#!/usr/bin/env node
import { resolve } from "node:path";

import { defineCommand, runMain } from "citty";

import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { formatInitReport, formatStatusReport } from "./report.js";

const initCommand = defineCommand({
  meta: {
    name: "init",
    description:
      "Create an empty .specifyr/soll/ under the given path (default: current directory).",
  },
  args: {
    path: {
      type: "positional",
      required: false,
      description: "Repository root (default: cwd).",
    },
  },
  async run({ args }) {
    const repoPath = resolve(args.path ?? process.cwd());
    const report = await runInit({ repoPath });
    process.stdout.write(formatInitReport(report));
  },
});

const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Load .specifyr/soll/ under the given path and print a summary.",
  },
  args: {
    path: {
      type: "positional",
      required: false,
      description: "Repository root (default: cwd).",
    },
  },
  async run({ args }) {
    const repoPath = resolve(args.path ?? process.cwd());
    const report = await runStatus({ repoPath });
    process.stdout.write(formatStatusReport(report));
  },
});

const main = defineCommand({
  meta: {
    name: "specifyr",
    version: "0.1.0",
    description: "Visual architecture editor with SOLL/PLAN/IST drift-check.",
  },
  subCommands: {
    init: initCommand,
    status: statusCommand,
  },
});

runMain(main).catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
