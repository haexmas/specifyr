import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PackNameSchema } from "../core/vocabulary.js";
import type { PackName } from "../core/vocabulary.js";
import { VocabularyPackSchema } from "./pack.js";
import type { VocabularyPack } from "./pack.js";

// Resolve packs relative to this module. From source (vitest, tsx) → src/packs/.
// From dist/vocabulary/loader.js after tsc emit + copy step → dist/packs/.
const PACKS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "packs");

/**
 * Load and validate a vocabulary pack by name from the bundled pack directory.
 *
 * Reads the pack JSON file, parses it, and validates it against the
 * VocabularyPackSchema. Throws if the pack name is invalid or if the pack
 * file cannot be read or validated.
 */
export async function loadPack(name: PackName): Promise<VocabularyPack> {
  const validName = PackNameSchema.parse(name);
  const path = join(PACKS_DIR, `${validName}.json`);
  const raw = await readFile(path, "utf8");
  return VocabularyPackSchema.parse(JSON.parse(raw));
}
