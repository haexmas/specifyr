export interface SymbolIndex {
  /** All node ids matching an exported class/interface name in `filePath`. */
  get(filePath: string, exportedName: string): readonly string[];
}

export interface FileImportIndex {
  /** Import binding for `localName` in this file, or undefined if not imported. */
  get(
    localName: string,
  ): { targetFile: string; exportedName: string } | undefined;
}

/**
 * Resolve an inheritance target identifier to a node id.
 *
 * Priority: same-file locals shadow imports (matches TS scoping).
 * Ambiguous names (more than one candidate on either side) resolve to undefined.
 */
export function resolveSymbol(
  _fromRelative: string,
  targetName: string,
  fileImports: FileImportIndex,
  symbolIndex: SymbolIndex,
  sameFileSymbols: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  const local = sameFileSymbols.get(targetName);
  if (local && local.length === 1) return local[0];
  if (local && local.length > 1) return undefined;

  const binding = fileImports.get(targetName);
  if (!binding) return undefined;

  const candidates = symbolIndex.get(binding.targetFile, binding.exportedName);
  if (candidates.length === 1) return candidates[0];
  return undefined;
}
