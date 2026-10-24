import { describe, it, expect } from 'vitest';
import { decodeDoodadPlacement, doodadPlacedSize, doodadRect, doodadRectCells, doodadSupportCells, encodeDoodadPlacement } from './doodadPlacement';

const sized = { width: 3, height: 3, sizeVariants: [{ width: 3, height: 3, weight: 1 }, { width: 6, height: 9, weight: 1 }] };

describe('doodad placements', () => {
  it('encode as four numbers, plus a flip marker only when mirrored, and decode back', () => {
    expect(encodeDoodadPlacement({ typeIndex: 2, x: 10, y: 20, variant: 1, flip: false })).toEqual([2, 10, 20, 1]);
    expect(encodeDoodadPlacement({ typeIndex: 2, x: 10, y: 20, variant: 0, flip: true })).toEqual([2, 10, 20, 0, 1]);
    for (const p of [{ typeIndex: 0, x: 1, y: 2, variant: 0, flip: false }, { typeIndex: 5, x: 9, y: 8, variant: 3, flip: true }]) {
      expect(decodeDoodadPlacement(encodeDoodadPlacement(p))).toEqual(p);
    }
  });

  it('takes its size from the variant, and falls back to the first for one out of range', () => {
    expect(doodadPlacedSize(sized, 1)).toEqual({ width: 6, height: 9 });
    expect(doodadPlacedSize(sized, 7)).toEqual({ width: 3, height: 3 });
    expect(doodadPlacedSize({ width: 2, height: 4 }, 0)).toEqual({ width: 2, height: 4 });
    expect(doodadRect(sized, { x: 4, y: 5, variant: 1 })).toEqual({ x: 4, y: 5, width: 6, height: 9 });
  });

  it('lists every cell of the footprint', () => {
    expect(doodadRectCells({ x: 1, y: 2, width: 2, height: 2 })).toEqual([{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 3 }]);
  });

  it('finds the support cells of each anchor', () => {
    const rect = { x: 10, y: 10, width: 2, height: 3 };
    expect(doodadSupportCells('FLOOR', rect, false)).toEqual([{ x: 10, y: 13 }, { x: 11, y: 13 }]);
    expect(doodadSupportCells('CEILING', rect, false)).toEqual([{ x: 10, y: 9 }, { x: 11, y: 9 }]);
    expect(doodadSupportCells('WALL', rect, false)).toEqual([{ x: 9, y: 10 }, { x: 9, y: 11 }, { x: 9, y: 12 }]);
    expect(doodadSupportCells('WALL', rect, true)).toEqual([{ x: 12, y: 10 }, { x: 12, y: 11 }, { x: 12, y: 12 }]);
    expect(doodadSupportCells('AIR', rect, false)).toEqual([]);
  });
});
