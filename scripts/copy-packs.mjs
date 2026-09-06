#!/usr/bin/env node
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "src", "packs");
const dest = resolve(here, "..", "dist", "packs");

await mkdir(dest, { recursive: true });
const entries = await readdir(src);
let copied = 0;
for (const entry of entries) {
  if (!entry.endsWith(".json")) continue;
  await copyFile(join(src, entry), join(dest, entry));
  copied++;
}
process.stdout.write(`copied ${copied} pack(s) to ${dest}\n`);
