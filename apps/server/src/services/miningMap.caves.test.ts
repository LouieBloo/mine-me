import { describe, it, expect } from 'vitest';
import { BLOCK_SCALE, isTileSolid } from '@mine-me/shared';
import { generateMiningMap } from './miningMap.service';

/** How many cells have a room of `size` x `size` open cells with that cell at its bottom-left corner. */
const roomCells = (grid: ReturnType<typeof generateMiningMap>, size: number): number => {
  let count = 0;
  for (let y = size; y < grid.length - 1; y++) {
    for (let x = 0; x + size <= grid[0].length; x++) {
      let open = true;
      for (let r = y - size + 1; r <= y && open; r++) for (let c = x; c < x + size; c++) if (isTileSolid(grid[r][c].type)) { open = false; break; }
      if (open) count++;
    }
  }
  return count;
};

describe('cave generation at small block sizes', () => {
  it('makes caves as big as the original ones, not scattered cell-sized pockets', () => {
    // A room as big as the character several times over: two original blocks across
    const size = 2 * BLOCK_SCALE;
    for (const seed of [1, 5, 9]) {
      const grid = generateMiningMap({ seed });
      expect(roomCells(grid, size)).toBeGreaterThan(200 * (BLOCK_SCALE > 1 ? 1 : 0.05));
    }
  });

  it('is repeatable: the same seed makes the same caves', () => {
    const a = generateMiningMap({ seed: 11 });
    const b = generateMiningMap({ seed: 11 });
    expect(a.map((row) => row.map((t) => t.type).join(''))).toEqual(b.map((row) => row.map((t) => t.type).join('')));
  });

  it('leaves the surface and the rows above the cavern depth solid', () => {
    const grid = generateMiningMap({ seed: 5 });
    for (let y = 0; y < 4 * BLOCK_SCALE; y++) {
      // (tunnels start deeper than the caves; ore and rock only replace dirt)
      expect(grid[y].every((t) => isTileSolid(t.type))).toBe(true);
    }
  });
});
