import { dirname, join, normalize } from "node:path/posix";

// Suffixes tried in order for a bare specifier. Matches Node ESM + TS module
// resolution as we use it in this codebase: source is authored as .ts / .tsx,
// but imports are written with .js (dist emit contract). Both forms resolve
// to the .ts / .tsx source file in the walked set.
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

/** Resolve a relative import specifier to a repo-relative file in the walked set. */
export function resolveImport(
  fromRelative: string,
  specifier: string,
  allFiles: ReadonlySet<string>,
): string | undefined {
  if (!isRelative(specifier)) return undefined;

  // A bare "." imports the containing directory's barrel index, which from
  // within a module of that package is a self-loop we don't want to emit.
  if (specifier === ".") return undefined;

  // Strip trailing .js (our imports write .js; the file set holds .ts / .tsx).
  const withoutJs = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;

  const fromDir = dirname(fromRelative);
  const base = normalize(join(fromDir, withoutJs));

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (candidate === fromRelative) continue; // ignore self-import
    if (allFiles.has(candidate)) return candidate;
  }

  return undefined;
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier === ".";
}
