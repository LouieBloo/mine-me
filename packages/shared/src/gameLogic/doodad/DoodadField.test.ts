import { describe, it, expect } from 'vitest';
import { DoodadField } from './DoodadField';
import { MiningTileType } from '../../types/mining';
import type { DoodadClientDefinition } from '../../types/doodad';

const def = (index: number, anchor: DoodadClientDefinition['anchor'], over: Partial<DoodadClientDefinition> = {}): DoodadClientDefinition => ({
  index, key: `d${index}`, name: `d${index}`, anchor, width: 1, height: 1, zOffset: 0, ...over,
});
const DEFS = [def(0, 'FLOOR'), def(1, 'CEILING'), def(2, 'WALL'), def(3, 'AIR'), def(4, 'FLOOR', { width: 3, height: 2, sizeVariants: [{ width: 1, height: 1, weight: 1 }, { width: 3, height: 2, weight: 1 }] })];

describe('DoodadField', () => {
  it('holds the placements it is given, with their sizes from the definition and variant', () => {
    const field = new DoodadField(DEFS, [[0, 5, 5, 0], [4, 10, 10, 1], [4, 20, 20, 0], [2, 7, 7, 0, 1]]);
    expect(field.size).toBe(4);
    expect(field.at(10, 10)).toMatchObject({ width: 3, height: 2, variant: 1, flip: false });
    expect(field.at(20, 20)).toMatchObject({ width: 1, height: 1 }); // the first size choice
    expect(field.at(7, 7)?.flip).toBe(true);
    expect(field.covering(12, 11)?.x).toBe(10);
    expect(field.covering(13, 11)).toBeUndefined();
  });

  it('ignores a kind it does not know and a doodad on top of another, and takes a repeat as the same', () => {
    const field = new DoodadField(DEFS, [[9, 1, 1, 0], [4, 10, 10, 1]]);
    expect(field.size).toBe(1);
    expect(field.apply([[0, 11, 10, 0]], []).added).toEqual([]); // inside the big one
    expect(field.apply([[4, 10, 10, 1]], []).added).toEqual([]);
    expect(field.size).toBe(1);
  });

  it('applies additions then removals, and says what changed', () => {
    const field = new DoodadField(DEFS);
    const first = field.apply([[0, 2, 2, 0], [3, 8, 8, 0]], []);
    expect(first.added.map((e) => [e.x, e.y])).toEqual([[2, 2], [8, 8]]);
    const second = field.apply([[0, 4, 4, 0]], [[2, 2], [99, 99]]);
    expect(second.added).toHaveLength(1);
    expect(second.removed.map((e) => [e.x, e.y])).toEqual([[2, 2]]);
    expect(field.size).toBe(2);
    // Added and removed in the same tick: gone
    const same = field.apply([[0, 30, 30, 0]], [[30, 30]]);
    expect(same.added).toHaveLength(1);
    expect(field.at(30, 30)).toBeUndefined();
  });

  it('finds the doodads touching a rectangle, once each, across bucket borders', () => {
    const field = new DoodadField(DEFS, [[4, 14, 14, 1], [0, 40, 40, 0], [0, 100, 100, 0]]);
    expect(field.inRect(15, 15, 15, 15).map((e) => e.x)).toEqual([14]);
    expect(field.inRect(0, 0, 20, 20)).toHaveLength(1);
    expect(field.inRect(0, 0, 50, 50)).toHaveLength(2);
    expect(field.inRect(0, 0, 200, 200)).toHaveLength(3);
    expect(field.inRect(60, 60, 90, 90)).toEqual([]);
  });

  describe('tile changes (the same rules as the server)', () => {
    const make = () =>
      new DoodadField(DEFS, [[0, 5, 5, 0], [1, 8, 5, 0], [2, 10, 5, 0], [2, 12, 5, 0, 1], [3, 15, 5, 0], [4, 20, 5, 1]]);

    it('removes a floor doodad when the block under it stops being solid, a ceiling doodad when the block over it does, a wall doodad when its wall does', () => {
      const field = make();
      expect(field.onTileChanged(5, 6, MiningTileType.EMPTY).map((e) => e.typeIndex)).toEqual([0]);
      expect(field.onTileChanged(8, 4, MiningTileType.EMPTY).map((e) => e.typeIndex)).toEqual([1]);
      expect(field.onTileChanged(9, 5, MiningTileType.EMPTY).map((e) => e.typeIndex)).toEqual([2]); // wall on the left
      expect(field.onTileChanged(13, 5, MiningTileType.EMPTY).map((e) => e.typeIndex)).toEqual([2]); // wall on the right (mirrored)
      expect(field.size).toBe(2);
    });

    it('removes a wide doodad when any one block under it goes, and leaves free-floating ones alone', () => {
      const field = make();
      expect(field.onTileChanged(22, 7, MiningTileType.EMPTY)).toHaveLength(1);
      expect(field.onTileChanged(14, 5, MiningTileType.EMPTY)).toEqual([]);
      expect(field.onTileChanged(15, 6, MiningTileType.EMPTY)).toEqual([]);
      expect(field.at(15, 5)).toBeDefined();
    });

    it('crushes a doodad when something solid lands in it, but not for a ladder, torch or bridge, nor for a block that stays solid', () => {
      const field = make();
      for (const t of [MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE]) expect(field.onTileChanged(15, 5, t)).toEqual([]);
      expect(field.onTileChanged(5, 6, MiningTileType.DIRT)).toEqual([]); // still solid: cracks, say
      expect(field.onTileChanged(15, 5, MiningTileType.ROCK).map((e) => e.typeIndex)).toEqual([3]);
    });

    it('does not remove anything for a change nowhere near, or twice for the same one', () => {
      const field = make();
      expect(field.onTileChanged(50, 50, MiningTileType.EMPTY)).toEqual([]);
      expect(field.onTileChanged(5, 6, MiningTileType.EMPTY)).toHaveLength(1);
      expect(field.onTileChanged(5, 6, MiningTileType.EMPTY)).toEqual([]);
    });
  });

  it('counts every addition and removal in its version, and nothing else', () => {
    const field = new DoodadField(DEFS, [[0, 5, 5, 0]]);
    const v0 = field.version;
    field.apply([], []);
    field.apply([[0, 5, 5, 0]], []); // a repeat changes nothing
    expect(field.version).toBe(v0);
    field.apply([[0, 9, 9, 0]], []);
    expect(field.version).toBe(v0 + 1);
    field.apply([], [[9, 9]]);
    expect(field.version).toBe(v0 + 2);
    field.onTileChanged(5, 6, MiningTileType.EMPTY);
    expect(field.version).toBe(v0 + 3);
    field.onTileChanged(5, 6, MiningTileType.EMPTY);
    expect(field.version).toBe(v0 + 3);
  });
});
