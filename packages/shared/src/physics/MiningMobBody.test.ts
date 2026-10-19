import { describe, it, expect } from 'vitest';
import { MiningMobBody } from './MiningMobBody';
import { MiningTileType } from '../types/mining';
import type { MiningCollisionGrid } from './MiningPhysicsBody';

/** An open cave `rows` high with a solid floor (if `floor`) on the last row. */
const cave = (width: number, rows: number, floor: boolean): MiningCollisionGrid =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: width }, () => ({ type: floor && y === rows - 1 ? MiningTileType.DIRT : MiningTileType.EMPTY }))
  ) as unknown as MiningCollisionGrid;

describe('MiningMobBody on the bottom edge of the map', () => {
  it('lands on the edge of the map and can then jump (it is not left falling forever)', () => {
    const grid = cave(20, 30, false); // no floor tiles: the map edge is bedrock
    const body = new MiningMobBody({ position: { x: 10, y: 20 }, width: 1.9, height: 2.67, moveSpeed: 9, jumpForce: 25 });
    for (let i = 0; i < 120; i++) body.update(1 / 30, grid);
    expect(body.isGrounded).toBe(true);
    expect(body.velocity.y).toBe(0);
    expect(body.position.y).toBeCloseTo(30 - body.halfHeight);
    body.processMovement(0, true, false, false, grid);
    expect(body.velocity.y).toBeLessThan(0);
  });
});

describe('MiningMobBody walking speed', () => {
  it('moves at full speed for a full push and slower for a partial one', () => {
    const grid = cave(40, 12, true);
    const body = new MiningMobBody({ position: { x: 10, y: 9 }, width: 1.9, height: 2.67, moveSpeed: 9 });
    body.processMovement(1, false, false, false, grid);
    expect(body.velocity.x).toBeCloseTo(9);
    body.processMovement(-1, false, false, false, grid);
    expect(body.velocity.x).toBeCloseTo(-9);
    body.processMovement(0.25, false, false, false, grid);
    expect(body.velocity.x).toBeCloseTo(2.25);
    body.processMovement(0, false, false, false, grid);
    expect(body.velocity.x).toBe(0);
  });

  it('never goes faster than its speed, whatever the push', () => {
    const grid = cave(40, 12, true);
    const body = new MiningMobBody({ position: { x: 10, y: 9 }, width: 1.9, height: 2.67, moveSpeed: 9 });
    body.processMovement(5, false, false, false, grid);
    expect(body.velocity.x).toBeCloseTo(9);
  });
});
