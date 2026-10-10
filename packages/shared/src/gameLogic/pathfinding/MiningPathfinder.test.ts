import { describe, it, expect } from 'vitest';
import { MiningPathfinder } from './MiningPathfinder';
import { MiningTileType, MINING_CONFIG } from '../../types/mining';
import type { MiningCollisionGrid } from '../../physics/MiningPhysicsBody';

/** Open air with a solid floor on row `floorY`. */
function floorGrid(floorY = 20): MiningCollisionGrid {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    grid[y] = {};
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      grid[y][x] = { type: y >= floorY ? MiningTileType.ROCK : MiningTileType.EMPTY };
    }
  }
  return grid;
}

describe('MiningPathfinder', () => {
  it('walks straight along a flat floor to the goal', () => {
    const path = MiningPathfinder.findPath({ x: 5, y: 19 }, { x: 12, y: 19 }, floorGrid());
    expect(path).toHaveLength(7);
    expect(path.every((w) => w.action === 'WALK')).toBe(true);
    expect(path[path.length - 1]).toMatchObject({ x: 12, y: 19 });
  });

  it('returns an empty path when already at the goal', () => {
    expect(MiningPathfinder.findPath({ x: 5.5, y: 19.5 }, { x: 5, y: 19 }, floorGrid())).toEqual([]);
  });

  it('jumps up onto a one-tile ledge', () => {
    const grid = floorGrid();
    grid[19][8] = { type: MiningTileType.ROCK }; // step
    const path = MiningPathfinder.findPath({ x: 5, y: 19 }, { x: 8, y: 18 }, grid);
    expect(path.some((w) => w.action === 'JUMP')).toBe(true);
    expect(path[path.length - 1]).toMatchObject({ x: 8, y: 18 });
  });

  it('digs through a wall when mining is allowed, and goes as close as it can when it is not', () => {
    const grid = floorGrid();
    for (let y = 0; y < 20; y++) grid[y][10] = { type: MiningTileType.DIRT }; // full-height wall
    const dig = MiningPathfinder.findPath({ x: 5, y: 19 }, { x: 14, y: 19 }, grid, { canMine: true });
    expect(dig.some((w) => w.action === 'MINE')).toBe(true);
    expect(dig[dig.length - 1]).toMatchObject({ x: 14, y: 19 });

    const blocked = MiningPathfinder.findPath({ x: 5, y: 19 }, { x: 14, y: 19 }, grid, { canMine: false });
    expect(blocked.some((w) => w.action === 'MINE')).toBe(false);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[blocked.length - 1].x).toBeLessThan(10); // best effort: stops at the wall
  });

  it('climbs a ladder', () => {
    const grid = floorGrid();
    for (let y = 8; y <= 19; y++) grid[y][9] = { type: MiningTileType.LADDER };
    const path = MiningPathfinder.findPath({ x: 9, y: 19 }, { x: 9, y: 8 }, grid);
    expect(path.filter((w) => w.action === 'CLIMB').length).toBeGreaterThan(5);
  });

  it('respects maxSearchDepth', () => {
    const grid = floorGrid();
    const path = MiningPathfinder.findPath({ x: 2, y: 19 }, { x: 40, y: 19 }, grid, { maxSearchDepth: 5 });
    expect(path.length).toBeLessThanOrEqual(5);
  });

  it('finishes many long searches quickly (heap, not a sort per step)', () => {
    const grid = floorGrid();
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      MiningPathfinder.findPath({ x: 2, y: 19 }, { x: 60 - (i % 10), y: 19 }, grid, { maxSearchDepth: 2000 });
    }
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
