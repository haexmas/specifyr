import { describe, expect, it } from "vitest";
import {
  computeGridPlacement,
  type GridPlacementOptions,
} from "../../frontend/composables/grid-placement.js";

const OPTS: GridPlacementOptions = {
  columns: 2,
  cellWidth: 300,
  cellHeight: 200,
  gap: 40,
};

describe("computeGridPlacement", () => {
  it("returns an empty map for empty input", () => {
    const result = computeGridPlacement([], OPTS);
    expect(result.size).toBe(0);
  });

  it("places a single id at (gap, gap) with the configured cell size", () => {
    const result = computeGridPlacement(["a"], OPTS);
    expect(result.size).toBe(1);
    expect(result.get("a")).toEqual({
      x: OPTS.gap,
      y: OPTS.gap,
      width: OPTS.cellWidth,
      height: OPTS.cellHeight,
    });
  });

  it("places two ids on the same row when columns is 2, second one offset by cellWidth + gap", () => {
    const result = computeGridPlacement(["a", "b"], OPTS);
    const a = result.get("a");
    const b = result.get("b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a?.y).toBe(OPTS.gap);
    expect(b?.y).toBe(OPTS.gap);
    expect(a?.x).toBe(OPTS.gap);
    expect(b?.x).toBe(OPTS.gap + OPTS.cellWidth + OPTS.gap);
  });

  it("wraps to the next row when a row is full", () => {
    const result = computeGridPlacement(["a", "b", "c"], OPTS);
    const a = result.get("a");
    const b = result.get("b");
    const c = result.get("c");
    expect(a?.y).toBe(OPTS.gap);
    expect(b?.y).toBe(OPTS.gap);
    expect(c?.x).toBe(OPTS.gap);
    expect(c?.y).toBe(OPTS.gap + OPTS.cellHeight + OPTS.gap);
  });

  it("preserves caller-supplied order — no re-sorting inside", () => {
    const ids = ["zebra", "apple", "mango", "banana"];
    const result = computeGridPlacement(ids, OPTS);
    // With columns:2 the first row is zebra, apple and the second row is mango, banana.
    expect(result.get("zebra")).toMatchObject({ x: OPTS.gap, y: OPTS.gap });
    expect(result.get("apple")).toMatchObject({
      x: OPTS.gap + OPTS.cellWidth + OPTS.gap,
      y: OPTS.gap,
    });
    expect(result.get("mango")).toMatchObject({
      x: OPTS.gap,
      y: OPTS.gap + OPTS.cellHeight + OPTS.gap,
    });
    expect(result.get("banana")).toMatchObject({
      x: OPTS.gap + OPTS.cellWidth + OPTS.gap,
      y: OPTS.gap + OPTS.cellHeight + OPTS.gap,
    });
  });

  it("never overlaps adjacent cells within a row or across a row boundary", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const opts: GridPlacementOptions = { columns: 3, cellWidth: 120, cellHeight: 80, gap: 20 };
    const result = computeGridPlacement(ids, opts);
    for (let i = 0; i < ids.length - 1; i += 1) {
      const current = result.get(ids[i] as string);
      const next = result.get(ids[i + 1] as string);
      expect(current).toBeDefined();
      expect(next).toBeDefined();
      if (!current || !next) continue;
      if (current.y === next.y) {
        // Same row: next cell starts after current's right edge plus gap.
        expect(current.x + current.width + opts.gap).toBeLessThanOrEqual(next.x);
      } else {
        // Row transition: next row's top is below current row's bottom plus gap.
        expect(current.y + current.height + opts.gap).toBeLessThanOrEqual(next.y);
      }
    }
  });

  it("keeps every cell inside the padded canvas (x >= gap and y >= gap)", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const result = computeGridPlacement(ids, OPTS);
    for (const cell of result.values()) {
      expect(cell.x).toBeGreaterThanOrEqual(OPTS.gap);
      expect(cell.y).toBeGreaterThanOrEqual(OPTS.gap);
    }
  });

  it("is deterministic — two calls with the same inputs return equal maps", () => {
    const ids = ["one", "two", "three", "four", "five"];
    const a = computeGridPlacement(ids, OPTS);
    const b = computeGridPlacement(ids, OPTS);
    expect(a.size).toBe(b.size);
    for (const [id, cell] of a) {
      expect(b.get(id)).toEqual(cell);
    }
  });
});
