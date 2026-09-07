import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Language, Parser, type Tree } from "web-tree-sitter";

const require_ = createRequire(import.meta.url);
let cachedParser: Parser | undefined;

export async function parseTypeScript(source: string): Promise<Tree> {
  const parser = await getParser();
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error("tree-sitter failed to produce a parse tree");
  }
  return tree;
}

async function getParser(): Promise<Parser> {
  if (cachedParser) return cachedParser;

  await Parser.init({
    locateFile(scriptName: string): string {
      if (scriptName.endsWith(".wasm")) {
        return require_.resolve("web-tree-sitter/web-tree-sitter.wasm");
      }
      return scriptName;
    },
  });

  const wasmPath = require_.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm");
  const wasmBytes = await readFile(wasmPath);
  const language = await Language.load(wasmBytes);

  const parser = new Parser();
  parser.setLanguage(language);
  cachedParser = parser;
  return parser;
}
