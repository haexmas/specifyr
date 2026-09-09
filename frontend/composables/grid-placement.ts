export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridPlacementOptions {
  /** Columns to lay out top-level wrappers across. */
  columns: number;
  /** Uniform cell width/height reserved per wrapper. */
  cellWidth: number;
  cellHeight: number;
  /** Horizontal + vertical gap between adjacent cells and to the canvas edges. */
  gap: number;
}

/**
 * Deterministically place top-level wrapper ids into a uniform grid.
 *
 * Ordering: ids arrive in the caller's chosen order (the page passes them
 * in the order `buildHierarchy` returned, which is already sorted
 * alphabetically with the `(no folder)` bucket last). This function
 * preserves that order — no re-sorting inside.
 *
 * The returned rectangles are absolute canvas coordinates; the first cell
 * sits at `(gap, gap)`, not the origin, so wrappers never touch the canvas
 * edge.
 */
export function computeGridPlacement(
  ids: readonly string[],
  options: GridPlacementOptions,
): Map<string, GridCell> {
  const { columns, cellWidth, cellHeight, gap } = options;
  const result = new Map<string, GridCell>();
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i] as string;
    const col = i % columns;
    const row = Math.floor(i / columns);
    result.set(id, {
      x: gap + col * (cellWidth + gap),
      y: gap + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
    });
  }
  return result;
}
