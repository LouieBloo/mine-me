import { describe, it, expect } from 'vitest';
import { MiningPhysicsBody, type MiningCollisionGrid } from './MiningPhysicsBody';
import { MiningTileType, MINING_CONFIG } from '../types/mining';

class TestBody extends MiningPhysicsBody {}

function wallGrid(wallX: number): MiningCollisionGrid {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    grid[y] = {};
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      grid[y][x] = { type: x === wallX ? MiningTileType.ROCK : MiningTileType.EMPTY };
    }
  }
  return grid;
}

describe('MiningPhysicsBody sweep', () => {
  it('does not tunnel through a one-tile wall at the maximum speed', () => {
    const grid = wallGrid(20);
    const body = new TestBody({ position: { x: 10, y: 10 }, width: 0.6, height: 1.0, hasGravity: false });
    body.velocity = { x: MINING_CONFIG.MAX_ENTITY_SPEED, y: 0 };

    // One slow client frame: 60 tiles/s * 0.25s = 15 tiles in a single update.
    body.update(0.25, grid);

    expect(body.position.x).toBeLessThanOrEqual(20 - body.halfWidth + 1e-6);
    expect(body.velocity.x).toBe(0);
  });

  it('does not tunnel through a floor when launched downward at the maximum speed', () => {
    const grid = wallGrid(-1);
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) grid[30][x] = { type: MiningTileType.ROCK };
    const body = new TestBody({ position: { x: 10, y: 10 }, width: 0.6, height: 1.0, hasGravity: false });
    body.velocity = { x: 0, y: MINING_CONFIG.MAX_ENTITY_SPEED };

    body.update(0.5, grid);

    expect(body.position.y + body.halfHeight).toBeLessThanOrEqual(30 + 1e-6);
    expect(body.isGrounded).toBe(true);
  });

  it('caps speeds above the maximum', () => {
    const grid = wallGrid(-1);
    const body = new TestBody({ position: { x: 10, y: 10 }, width: 0.6, height: 1.0, hasGravity: false });
    body.velocity = { x: 1000, y: 0 };
    body.update(0.1, grid);
    expect(body.position.x).toBeCloseTo(10 + MINING_CONFIG.MAX_ENTITY_SPEED * 0.1, 3);
  });

  it('leaves slow movement unchanged (single step)', () => {
    const grid = wallGrid(-1);
    const body = new TestBody({ position: { x: 10, y: 10 }, width: 0.6, height: 1.0, hasGravity: false });
    body.velocity = { x: 4, y: 0 };
    body.update(0.05, grid);
    expect(body.position.x).toBeCloseTo(10.2, 6);
  });
});
