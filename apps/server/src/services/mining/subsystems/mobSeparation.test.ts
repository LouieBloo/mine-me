import { describe, it, expect } from 'vitest';
import { MiningMobBody, MiningTileType, MINING_CONFIG, type MiningCollisionGrid } from '@mine-me/shared';
import { separateBodies, overlapOf, type SeparationParticipant } from './mobSeparation';

function openGrid(): MiningCollisionGrid {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    grid[y] = {};
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) grid[y][x] = { type: MiningTileType.EMPTY };
  }
  return grid;
}
const body = (x: number, y = 10) =>
  new MiningMobBody({ position: { x, y }, width: 1, height: 1, hasGravity: false });
const part = (id: string, b: MiningMobBody, movable = true): SeparationParticipant => ({ id, body: b, movable });

describe('separateBodies', () => {
  it('pushes two overlapping movable bodies apart, evenly, never faster than the separation speed', () => {
    const grid = openGrid();
    const a = body(10);
    const b = body(10.4);
    separateBodies([part('a', a), part('b', b)], 0.1, grid);
    const maxPush = MINING_CONFIG.MOB_SEPARATION_SPEED * 0.1;
    expect(a.position.x).toBeCloseTo(10 - maxPush / 2, 6);
    expect(b.position.x).toBeCloseTo(10.4 + maxPush / 2, 6);
  });

  it('eventually resolves the overlap and then stops', () => {
    const grid = openGrid();
    const a = body(10);
    const b = body(10.1);
    for (let i = 0; i < 60; i++) separateBodies([part('a', a), part('b', b)], 1 / 30, grid);
    const o = overlapOf(a, b);
    expect(o.x).toBeLessThanOrEqual(1e-6);
    const before = a.position.x;
    separateBodies([part('a', a), part('b', b)], 1 / 30, grid);
    expect(a.position.x).toBe(before);
  });

  it('separates bodies stacked on the exact same spot, in a stable direction', () => {
    const grid = openGrid();
    const a = body(10);
    const b = body(10);
    separateBodies([part('a', a), part('b', b)], 0.1, grid);
    expect(a.position.x).toBeLessThan(b.position.x);
  });

  it('never moves an immovable body; the movable one takes the whole push', () => {
    const grid = openGrid();
    const fixed = body(10);
    const mover = body(10.3);
    separateBodies([part('fixed', fixed, false), part('mover', mover)], 0.1, grid);
    expect(fixed.position.x).toBe(10);
    expect(mover.position.x).toBeCloseTo(10.3 + MINING_CONFIG.MOB_SEPARATION_SPEED * 0.1, 6);
  });

  it('ignores bodies that do not overlap, including ones at different heights', () => {
    const grid = openGrid();
    const a = body(10);
    const far = body(12);
    const above = body(10, 5);
    separateBodies([part('a', a), part('far', far), part('above', above)], 0.1, grid);
    expect([a.position.x, far.position.x, above.position.x]).toEqual([10, 12, 10]);
  });

  it('will not push a body into a wall; the other one moves instead', () => {
    const grid = openGrid();
    grid[10][8] = { type: MiningTileType.ROCK }; // wall just left of a
    const a = body(9.5);
    const b = body(9.9);
    separateBodies([part('a', a), part('b', b)], 0.1, grid);
    expect(a.position.x).toBe(9.5);
    expect(b.position.x).toBeGreaterThan(9.9);
  });
});
