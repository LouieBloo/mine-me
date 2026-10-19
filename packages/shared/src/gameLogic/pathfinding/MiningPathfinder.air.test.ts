import { describe, it, expect } from 'vitest';
import { MiningPathfinder } from './MiningPathfinder';
import { MiningTileType } from '../../types/mining';
import type { MiningCollisionGrid } from '../../physics/MiningPhysicsBody';

const W = 60;
const H = 50;
const grid = (solid: (x: number, y: number) => MiningTileType | null): MiningCollisionGrid =>
  Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => ({ type: solid(x, y) ?? MiningTileType.EMPTY }))) as unknown as MiningCollisionGrid;

describe('a body in the air does not drift sideways at the same height', () => {
  // Two ledges at row 20 with a deep chasm between them (floor far below at row 45)
  const chasm = grid((x, y) => (y >= 45 ? MiningTileType.DIRT : y >= 20 && (x < 10 || x > 25) ? MiningTileType.DIRT : null));

  it('never plans two sideways falls in a row at one height', () => {
    const path = MiningPathfinder.findPath({ x: 5, y: 19 }, { x: 30, y: 19 }, chasm, { maxJumpTiles: 3 });
    for (let i = 1; i < path.length; i++) {
      if (path[i].action === 'FALL' && path[i - 1].action === 'FALL') expect(path[i].y).toBeGreaterThan(path[i - 1].y);
    }
  });

  it('still steps off a ledge, and drops diagonally while falling', () => {
    // From the ledge to the chasm floor, sideways and down: a fall that moves away from the wall as it drops
    const path = MiningPathfinder.findPath({ x: 9, y: 19 }, { x: 14, y: 44 }, chasm, { maxJumpTiles: 3 });
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toMatchObject({ x: 14, y: 44 });
    expect(path.filter((w) => w.action === 'FALL').length).toBeGreaterThan(5);
  });
});

describe('a jump over a pit is only planned when the body can cover the gap', () => {
  // A one-cell pit at x = 10 in a floor at row 20; the pit goes down to row 45
  const pit = grid((x, y) => (y >= 45 ? MiningTileType.DIRT : y >= 20 && x !== 10 ? MiningTileType.DIRT : null));

  it('jumps across when the jump carries far enough', () => {
    const path = MiningPathfinder.findPath({ x: 8, y: 19 }, { x: 12, y: 19 }, pit, { maxJumpTiles: 3, maxJumpReach: 6 });
    expect(path.some((w) => w.action === 'JUMP')).toBe(true);
    expect(path[path.length - 1]).toMatchObject({ x: 12, y: 19 });
  });

  it('does not plan the jump for a slow mob whose jump carries it less far than the gap', () => {
    const path = MiningPathfinder.findPath({ x: 8, y: 19 }, { x: 12, y: 19 }, pit, { maxJumpTiles: 3, maxJumpReach: 1 });
    expect(path.some((w) => w.action === 'JUMP' && w.y === 19)).toBe(false);
  });
});

describe('digging only through blocks the body can break', () => {

  it('digs a dirt wall by default', () => {
    const path = MiningPathfinder.findPath({ x: 5, y: 19 }, { x: 15, y: 19 }, grid((x, y) => (y >= 20 ? MiningTileType.ROCK : x === 10 && y > 5 ? MiningTileType.DIRT : null)), { canMine: true });
    expect(path.some((w) => w.action === 'MINE')).toBe(true);
  });

  it('plans no dig through a block type it cannot break', () => {
    const tall = grid((x, y) => (y >= 20 ? MiningTileType.ROCK : x === 10 && y > 0 ? MiningTileType.DIRT : null));
    const path = MiningPathfinder.findPath({ x: 5, y: 19 }, { x: 15, y: 19 }, tall, { canMine: true, canBreakTile: () => false, maxJumpTiles: 3 });
    expect(path.some((w) => w.action === 'MINE')).toBe(false);
  });
});
