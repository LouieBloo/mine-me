import { describe, it, expect } from 'vitest';
import { raycastSolidTiles } from './gridRaycast';
import { MiningTileType, MINING_CONFIG } from '../types/mining';
import type { MiningCollisionGrid } from './MiningPhysicsBody';

function emptyGrid(): MiningCollisionGrid {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    grid[y] = {};
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) grid[y][x] = { type: MiningTileType.EMPTY };
  }
  return grid;
}

describe('raycastSolidTiles', () => {
  it('returns null across open space', () => {
    expect(raycastSolidTiles(emptyGrid(), { x: 5, y: 5 }, { x: 15, y: 5 })).toBeNull();
  });

  it('hits a thin wall however far the segment goes past it, with the exact entry point', () => {
    const grid = emptyGrid();
    grid[5][8] = { type: MiningTileType.DIRT };
    const hit = raycastSolidTiles(grid, { x: 5.5, y: 5.5 }, { x: 40.5, y: 5.5 })!;
    expect(hit.tile).toEqual({ x: 8, y: 5 });
    expect(hit.point.x).toBeCloseTo(8, 6);
    expect(hit.point.y).toBeCloseTo(5.5, 6);
  });

  it('works for diagonal and leftward rays', () => {
    const grid = emptyGrid();
    grid[8][8] = { type: MiningTileType.ROCK };
    expect(raycastSolidTiles(grid, { x: 5.5, y: 5.5 }, { x: 10.5, y: 10.5 })!.tile).toEqual({ x: 8, y: 8 });
    expect(raycastSolidTiles(grid, { x: 12.5, y: 8.5 }, { x: 3.5, y: 8.5 })!.tile).toEqual({ x: 8, y: 8 });
  });

  it('does not test the start cell, and ignores segments that stop short of the wall', () => {
    const grid = emptyGrid();
    grid[5][5] = { type: MiningTileType.ROCK };
    grid[5][9] = { type: MiningTileType.ROCK };
    expect(raycastSolidTiles(grid, { x: 5.5, y: 5.5 }, { x: 8.9, y: 5.5 })).toBeNull();
  });

  it('treats the open sky above the grid as empty, and the walls/floor as solid', () => {
    const grid = emptyGrid();
    expect(raycastSolidTiles(grid, { x: 5, y: -3 }, { x: 60, y: -3 })).toBeNull();
    const wall = raycastSolidTiles(grid, { x: 5, y: 5 }, { x: -10, y: 5 })!;
    expect(wall.tile).toBeNull();
    expect(wall.point.x).toBeCloseTo(0, 6);
    const floor = raycastSolidTiles(grid, { x: 5, y: MINING_CONFIG.GRID_HEIGHT - 2 }, { x: 5, y: MINING_CONFIG.GRID_HEIGHT + 5 })!;
    expect(floor.tile).toBeNull();
  });

  it('can skip hits via the ignore predicate', () => {
    const grid = emptyGrid();
    grid[5][6] = { type: MiningTileType.ROCK };
    grid[5][9] = { type: MiningTileType.ROCK };
    const hit = raycastSolidTiles(grid, { x: 5.5, y: 5.5 }, { x: 15, y: 5.5 }, { ignore: (h) => h.point.x < 7 })!;
    expect(hit.tile).toEqual({ x: 9, y: 5 });
  });

  it('returns null for a zero-length or non-finite segment', () => {
    expect(raycastSolidTiles(emptyGrid(), { x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
    expect(raycastSolidTiles(emptyGrid(), { x: 5, y: 5 }, { x: NaN, y: 5 })).toBeNull();
  });
});
