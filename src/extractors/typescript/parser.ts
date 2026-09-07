import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Language, Parser, type Tree } from "web-tree-sitter";

// createRequire: package-shipped WASM must be resolved from disk at runtime.
// import.meta.resolve isn't stable in Node's ESM loader for arbitrary asset
// paths, so use the CJS-style resolver.
const require_ = createRequire(import.meta.url);

// Cache the promise (not the resolved parser) so concurrent first calls
// don't race Parser.init.
let cachedParser: Promise<Parser> | undefined;

/** Parse TypeScript or TSX source using the lazily initialized tree-sitter parser. */
export async function parseTypeScript(source: string): Promise<Tree> {
  cachedParser ??= initParser();
  const parser = await cachedParser;
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error("tree-sitter failed to produce a parse tree");
  }
  return tree;
}

/** Load the TSX grammar and create the shared tree-sitter parser instance. */
async function initParser(): Promise<Parser> {
  await Parser.init({
    locateFile(scriptName: string): string {
      if (scriptName.endsWith(".wasm")) {
        return require_.resolve("web-tree-sitter/web-tree-sitter.wasm");
      }
      return scriptName;
    },
  });

  // Use the TSX grammar (superset of TS) for both .ts and .tsx files so
  // .tsx files with JSX outside function bodies still parse cleanly.
  const wasmPath = require_.resolve("tree-sitter-typescript/tree-sitter-tsx.wasm");
  const wasmBytes = await readFile(wasmPath);
  const language = await Language.load(wasmBytes);

  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
