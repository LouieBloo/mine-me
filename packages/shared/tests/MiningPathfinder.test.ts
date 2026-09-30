import { describe, it, expect, beforeEach } from 'vitest';
import { MiningPathfinder } from '../src/gameLogic/pathfinding/MiningPathfinder';
import { MiningTileType } from '../src/types/mining';
import type { MiningCollisionGrid } from '../src/physics/MiningPhysicsBody';

describe('MiningPathfinder', () => {
  let grid: MiningCollisionGrid;

  beforeEach(() => {
    // 20x20 grid with dirt floor at y=10, rest air
    grid = {};
    for (let y = 0; y < 20; y++) {
      grid[y] = {};
      for (let x = 0; x < 20; x++) {
        grid[y][x] = { type: y >= 10 ? MiningTileType.DIRT : MiningTileType.EMPTY };
      }
    }
  });

  it('returns empty path when start and goal are the same tile', () => {
    const path = MiningPathfinder.findPath({ x: 5, y: 9 }, { x: 5, y: 9 }, grid);
    expect(path).toEqual([]);
  });

  it('finds straightforward horizontal walking path on flat floor', () => {
    const path = MiningPathfinder.findPath({ x: 2, y: 9 }, { x: 5, y: 9 }, grid);
    expect(path.length).toBe(3);
    expect(path.every((wp) => wp.action === 'WALK')).toBe(true);
    expect(path[path.length - 1]).toEqual({ x: 5, y: 9, action: 'WALK' });
  });

  it('navigates an elevated 1-tile ledge using jump', () => {
    // Add 1-tile elevated ledge at x=4, y=9 (floor becomes y=9 at x=4)
    grid[9][4] = { type: MiningTileType.DIRT };

    // Target is on top of the ledge (x=4, y=8)
    const path = MiningPathfinder.findPath({ x: 2, y: 9 }, { x: 4, y: 8 }, grid);
    expect(path.length).toBeGreaterThan(0);
    // Should include a JUMP action onto the elevated ledge
    const hasJump = path.some((wp) => wp.action === 'JUMP');
    expect(hasJump).toBe(true);
  });

  it('navigates vertical climbing using ladders', () => {
    // Create a vertical ladder shaft from y=9 up to y=5 at x=5
    for (let y = 5; y <= 9; y++) {
      grid[y][5] = { type: MiningTileType.LADDER };
    }

    const path = MiningPathfinder.findPath({ x: 5, y: 9 }, { x: 5, y: 5 }, grid, { canClimbLadders: true });
    expect(path.length).toBe(4);
    expect(path.every((wp) => wp.action === 'CLIMB')).toBe(true);
  });

  it('excavates through blocking mineable dirt wall when canMine is enabled', () => {
    // Wall of dirt at x=5 from y=0 to y=9
    for (let y = 0; y <= 9; y++) {
      grid[y][5] = { type: MiningTileType.DIRT };
    }

    const path = MiningPathfinder.findPath({ x: 4, y: 9 }, { x: 6, y: 9 }, grid, { canMine: true });
    expect(path.length).toBeGreaterThan(0);
    // Path should mine through x=5, y=9
    const mineStep = path.find((wp) => wp.action === 'MINE');
    expect(mineStep).toBeDefined();
    expect(mineStep?.x).toBe(5);
  });

  it('does not mine through unmineable rock boundaries', () => {
    // Unmineable rock wall covering entire column at x=5
    for (let y = 0; y < 20; y++) {
      grid[y][5] = { type: MiningTileType.ROCK };
    }

    const path = MiningPathfinder.findPath({ x: 4, y: 9 }, { x: 6, y: 9 }, grid, { canMine: true });
    // Rock is completely unmineable
    const hitRock = path.some((wp) => wp.x === 5 && wp.action === 'MINE');
    expect(hitRock).toBe(false);
  });

  it('prefers walking through an open detour instead of mining high-cost blocks', () => {
    // Wall at x=5 with a 1-tile opening at y=8 and hard silverium at y=9
    for (let y = 9; y >= 7; y--) {
      grid[y][5] = { type: y === 8 ? MiningTileType.EMPTY : MiningTileType.SILVERIUM };
    }

    const path = MiningPathfinder.findPath({ x: 4, y: 9 }, { x: 6, y: 9 }, grid, { canMine: true });
    // It should jump up and walk through opening at y=8 rather than breaking silverium at y=9
    const passedThroughHole = path.some((wp) => wp.x === 5 && wp.y === 8 && wp.action !== 'MINE');
    expect(passedThroughHole).toBe(true);
  });
});
