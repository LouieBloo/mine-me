import { describe, it, expect } from 'vitest';
import { getGridDimensions } from './gridDimensions';
import { raycastSolidTiles } from './gridRaycast';
import { MiningPlayerBody } from './MiningPlayerBody';
import { MiningPathfinder } from '../gameLogic/pathfinding/MiningPathfinder';
import { MINING_CONFIG, MiningTileType } from '../types/mining';

const makeGrid = (w: number, h: number, floorRow = h - 1) =>
  Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, () => ({ type: y >= floorRow ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true })),
  );

describe('getGridDimensions', () => {
  it('reads the size from the grid', () => {
    expect(getGridDimensions(makeGrid(30, 20))).toEqual({ width: 30, height: 20 });
  });
  it('falls back to the default mine size for an empty or non-array grid', () => {
    const fallback = { width: MINING_CONFIG.GRID_WIDTH, height: MINING_CONFIG.GRID_HEIGHT };
    expect(getGridDimensions([])).toEqual(fallback);
    expect(getGridDimensions(undefined)).toEqual(fallback);
    expect(getGridDimensions({})).toEqual(fallback);
  });
});

describe('a smaller world', () => {
  it('walls a body in at the grid edge, not the default mine edge', () => {
    const grid = makeGrid(10, 10, 8);
    const body = new MiningPlayerBody({ x: 5, y: 7 });
    body.velocity = { x: 50, y: 0 };
    for (let i = 0; i < 30; i++) body.update(1 / 30, grid);
    expect(body.position.x).toBeLessThanOrEqual(10);
    expect(body.position.x).toBeGreaterThan(8);
  });

  it('treats the side wall of a small grid as solid for rays', () => {
    const grid = makeGrid(10, 10, 9);
    const hit = raycastSolidTiles(grid, { x: 5, y: 3 }, { x: 14, y: 3 });
    expect(hit).not.toBeNull();
    expect(hit!.tile).toBeNull();
    expect(hit!.point.x).toBeCloseTo(10, 5);
  });

  it('plans paths inside a small grid', () => {
    const grid = makeGrid(10, 10, 8);
    const path = MiningPathfinder.findPath({ x: 1, y: 7 }, { x: 7, y: 7 }, grid, { canMine: false });
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((p) => p.x >= 0 && p.x < 10 && p.y < 10)).toBe(true);
  });
});
