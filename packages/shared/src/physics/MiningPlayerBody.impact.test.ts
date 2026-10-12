import { describe, it, expect } from 'vitest';
import { MiningPlayerBody } from './MiningPlayerBody';
import type { MiningCollisionGrid } from './MiningPhysicsBody';
import { MiningTileType, MINING_CONFIG } from '../types/mining';

function floorGrid(floorY: number): MiningCollisionGrid {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    grid[y] = {};
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      grid[y][x] = { type: y === floorY ? MiningTileType.DIRT : MiningTileType.EMPTY };
    }
  }
  return grid;
}

const TICK = 1 / 30;

describe('MiningPlayerBody.lastImpactSpeed', () => {
  it('records the downward speed the body hit the floor at', () => {
    const grid = floorGrid(30);
    const body = new MiningPlayerBody({ x: 10, y: 20 });
    let impact = 0;
    for (let i = 0; i < 200 && !body.isGrounded; i++) {
      body.update(TICK, grid);
      impact = Math.max(impact, body.lastImpactSpeed);
    }
    expect(body.isGrounded).toBe(true);
    // ~9 tiles of free fall is far above a normal jump landing
    expect(impact).toBeGreaterThan(15);
    expect(impact).toBeLessThanOrEqual(MINING_CONFIG.TERMINAL_FALL_SPEED + 1e-6);
  });

  it('is cleared on the next update once the body is standing', () => {
    const grid = floorGrid(30);
    const body = new MiningPlayerBody({ x: 10, y: 28 });
    for (let i = 0; i < 100 && !body.isGrounded; i++) body.update(TICK, grid);
    body.update(TICK, grid);
    expect(body.lastImpactSpeed).toBe(0);
  });

  it('a normal jump lands below the default fall-damage minimum', () => {
    const grid = floorGrid(30);
    const body = new MiningPlayerBody({ x: 10, y: 30 - 0.5 });
    body.isGrounded = true;
    body.processInputs({ jump: true } as any, grid);
    let impact = 0;
    for (let i = 0; i < 100; i++) {
      body.update(TICK, grid);
      impact = Math.max(impact, body.lastImpactSpeed);
    }
    expect(impact).toBeGreaterThan(0);
    expect(impact).toBeLessThan(11);
  });

  it('does not record an impact for a ceiling hit', () => {
    const grid = floorGrid(30);
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) grid[18][x] = { type: MiningTileType.DIRT };
    const body = new MiningPlayerBody({ x: 10, y: 19.6 });
    body.velocity.y = -10;
    body.update(TICK, grid);
    expect(body.lastImpactSpeed).toBe(0);
  });
});
