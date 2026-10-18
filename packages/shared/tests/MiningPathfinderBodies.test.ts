import { describe, it, expect } from 'vitest';
import { MiningPathfinder, MiningTileType, footprintOf, type MiningCollisionGrid, type MiningPathWaypoint } from '../src';

const set = (grid: MiningCollisionGrid, x: number, y: number, solid: boolean) => {
  grid[y] ??= {};
  grid[y][x] = { type: solid ? MiningTileType.DIRT : MiningTileType.EMPTY };
};

/**
 * A cave 16 wide and 6 tall: a solid ceiling on rows 0..1, open rows 2..4 and a floor on row 5, split by a wall on
 * column `wallX` whose only openings are the rows in `doorRows` (and `wallWidth` columns thick).
 */
const caveWithWall = (doorRows: number[], wallX = 7, wallWidth = 1): MiningCollisionGrid => {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 16; x++) {
      const inWall = x >= wallX && x < wallX + wallWidth;
      const solid = y <= 1 || y === 5 || (inWall && !doorRows.includes(y));
      set(grid, x, y, solid);
    }
  }
  return grid;
};

/** Ground whose height (in cells) is given for each column, open sky above it, 14 rows tall. */
const terrain = (heights: number[], rows = 14): MiningCollisionGrid => {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < rows; y++) for (let x = 0; x < heights.length; x++) set(grid, x, y, y >= rows - heights[x]);
  return grid;
};

/** A node is the footprint's left column and bottom row; findPath takes the cell it should start from. */
const at = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });
const last = (path: MiningPathWaypoint[]) => path[path.length - 1];
const reaches = (path: MiningPathWaypoint[], x: number, y: number) => path.length > 0 && last(path).x === x && last(path).y === y;

describe('footprintOf', () => {
  it('rounds a body up to whole cells, but not for a sliver over a whole number', () => {
    expect(footprintOf(1.9, 2.67)).toEqual({ width: 2, height: 3 });
    expect(footprintOf(1, 1)).toEqual({ width: 1, height: 1 });
    expect(footprintOf(1.01, 1.99)).toEqual({ width: 1, height: 2 });
    expect(footprintOf(0.2, 0.2)).toEqual({ width: 1, height: 1 });
  });
});

describe('pathing for a body bigger than one cell', () => {
  const big = { bodyWidth: 2, bodyHeight: 3, canMine: false };

  it('walks a tunnel its own size', () => {
    const path = MiningPathfinder.findPath(at(2, 4), at(12, 4), caveWithWall([2, 3, 4]), big);
    expect(reaches(path, 12, 4)).toBe(true);
    expect(path.every((p) => p.action === 'WALK')).toBe(true);
  });

  it('cannot pass a door that is shorter than it is, and gets as near as the wall', () => {
    for (const door of [[4], [3, 4]]) {
      const path = MiningPathfinder.findPath(at(2, 4), at(12, 4), caveWithWall(door), big);
      expect(reaches(path, 12, 4)).toBe(false);
      expect(path.length === 0 || last(path).x + 2 <= 7).toBe(true); // it stays on its side of the wall (columns 7+)
    }
  });

  it('passes a door exactly as tall as it is', () => {
    const path = MiningPathfinder.findPath(at(2, 4), at(12, 4), caveWithWall([2, 3, 4]), big);
    expect(reaches(path, 12, 4)).toBe(true);
  });

  it('the same door that stops a tall body lets a short one through', () => {
    const door = caveWithWall([3, 4]);
    expect(reaches(MiningPathfinder.findPath(at(2, 4), at(12, 4), door, { bodyWidth: 2, bodyHeight: 2, canMine: false }), 12, 4)).toBe(true);
    expect(reaches(MiningPathfinder.findPath(at(2, 4), at(12, 4), door, { bodyWidth: 2, bodyHeight: 3, canMine: false }), 12, 4)).toBe(false);
    // and a one-cell body goes through a one-cell door
    expect(reaches(MiningPathfinder.findPath(at(2, 4), at(12, 4), caveWithWall([4]), { canMine: false }), 12, 4)).toBe(true);
  });

  it('walks up a staircase of one-cell steps without jumping', () => {
    // steps two columns wide, each one cell higher than the one before
    const grid = terrain([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    const path = MiningPathfinder.findPath(at(0, 14 - 2 - 1), at(8, 14 - 6 - 1), grid, big);
    expect(reaches(path, 8, 14 - 6 - 1)).toBe(true);
    expect(path.some((p) => p.action === 'JUMP')).toBe(false);
  });

  it('jumps up a ledge two cells high only when its jump reaches', () => {
    const grid = terrain([2, 2, 2, 4, 4, 4, 4]);
    const from = at(0, 14 - 2 - 1);
    const to = at(4, 14 - 4 - 1);
    const jumps = MiningPathfinder.findPath(from, to, grid, { ...big, maxJumpTiles: 3 });
    expect(reaches(jumps, 4, 14 - 4 - 1)).toBe(true);
    expect(jumps.some((p) => p.action === 'JUMP')).toBe(true);
    const cannot = MiningPathfinder.findPath(from, to, grid, { ...big, maxJumpTiles: 1 });
    expect(reaches(cannot, 4, 14 - 4 - 1)).toBe(false);
  });

  it('digs a gap its own size through a wall: every cell of its footprint is a block to dig', () => {
    const grid = caveWithWall([], 7, 2); // a solid wall two columns thick, nothing open in it
    const path = MiningPathfinder.findPath(at(2, 4), at(12, 4), grid, { ...big, canMine: true });
    expect(reaches(path, 12, 4)).toBe(true);
    const digs = path.filter((p) => p.action === 'MINE');
    expect(digs.length).toBeGreaterThan(0);
    for (const dig of digs) {
      // the cell to dig is a solid cell inside that waypoint's footprint
      expect(dig.mineTarget).toBeDefined();
      const t = dig.mineTarget!;
      expect(t.x >= dig.x && t.x < dig.x + 2 && t.y <= dig.y && t.y > dig.y - 3).toBe(true);
      expect(grid[t.y][t.x].type).toBe(MiningTileType.DIRT);
    }
  });

  it('a one-cell body paths as it always did (the default)', () => {
    const grid: MiningCollisionGrid = {};
    for (let y = 0; y < 3; y++) for (let x = 0; x < 9; x++) set(grid, x, y, y !== 1 || x === 0 || x === 8);
    const path = MiningPathfinder.findPath(at(1, 1), at(7, 1), grid, { canMine: false });
    expect(path).toHaveLength(6);
    expect(path.every((p) => p.action === 'WALK')).toBe(true);
  });
});
