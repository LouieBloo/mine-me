import { describe, it, expect, beforeEach } from 'vitest';
import { MiningDynamiteEntity } from './MiningDynamiteEntity';
import { MiningTileType, MINING_CONFIG } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';

function createEmptyGrid(): ServerMiningGrid {
  const grid: ServerMiningGrid = [];
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      row.push({ type: MiningTileType.EMPTY, revealed: true });
    }
    grid.push(row);
  }
  return grid;
}

describe('MiningDynamiteEntity', () => {
  let grid: ServerMiningGrid;

  beforeEach(() => {
    grid = createEmptyGrid();
  });

  it('initializes with position, velocity, and a 4-second fuse', () => {
    const dynamite = new MiningDynamiteEntity('dyn-1', { x: 10, y: 5 }, { x: 5, y: -2 }, 4.0);
    expect(dynamite.id).toBe('dyn-1');
    expect(dynamite.position.x).toBe(10);
    expect(dynamite.position.y).toBe(5);
    expect(dynamite.velocity.x).toBe(5);
    expect(dynamite.velocity.y).toBe(-2);
    expect(dynamite.fuseRemainingSeconds).toBe(4.0);
    expect(dynamite.hasExploded).toBe(false);
  });

  it('counts down fuse and triggers hasExploded after 4 seconds', () => {
    const dynamite = new MiningDynamiteEntity('dyn-2', { x: 10, y: 5 }, { x: 0, y: 0 }, 4.0);

    // After 2 seconds
    dynamite.update(2.0, grid);
    expect(dynamite.fuseRemainingSeconds).toBeCloseTo(2.0);
    expect(dynamite.hasExploded).toBe(false);

    // After another 2 seconds (4s total)
    dynamite.update(2.0, grid);
    expect(dynamite.fuseRemainingSeconds).toBe(0);
    expect(dynamite.hasExploded).toBe(true);

    // Further updates do not run once exploded
    dynamite.update(1.0, grid);
    expect(dynamite.fuseRemainingSeconds).toBe(0);
  });

  it('applies gravity and updates position along trajectory', () => {
    const dynamite = new MiningDynamiteEntity('dyn-3', { x: 10, y: 2 }, { x: 4, y: 0 }, 4.0);
    dynamite.update(0.1, grid);

    expect(dynamite.position.x).toBeGreaterThan(10);
    expect(dynamite.position.y).toBeGreaterThan(2);
    expect(dynamite.velocity.y).toBeGreaterThan(0);
  });

  it('decelerates horizontal velocity with ground friction upon landing', () => {
    // Solid floor at y=4
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      grid[4][x] = { type: MiningTileType.DIRT, revealed: true };
    }

    const dynamite = new MiningDynamiteEntity('dyn-4', { x: 10, y: 3.5 }, { x: 6, y: 5 }, 4.0);
    dynamite.update(0.1, grid);

    expect(dynamite.isGrounded).toBe(true);
    expect(dynamite.velocity.x).toBeLessThan(6);
  });

  it('stops horizontal velocity and drops when colliding with a solid wall', () => {
    // Solid wall at x=12
    for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
      grid[y][12] = { type: MiningTileType.DIRT, revealed: true };
    }

    const dynamite = new MiningDynamiteEntity('dyn-5', { x: 11.6, y: 2 }, { x: 8, y: 0 }, 4.0);
    dynamite.update(0.1, grid);

    // Stopped horizontally against wall
    expect(dynamite.velocity.x).toBe(0);
    // Snapped flush before wall tile
    expect(dynamite.position.x).toBeLessThan(12);
  });

  it('preserves physicsConfig provided in options', () => {
    const customConfig = {
      hasPhysics: true,
      colliderType: 'RECTANGLE' as const,
      colliderWidth: 32,
      colliderHeight: 10,
      colliderRadius: 8,
      colliderOffsetX: 0,
      colliderOffsetY: 0,
    };
    const dynamite = new MiningDynamiteEntity(
      'dyn-6',
      { x: 5, y: 5 },
      { x: 1, y: 0 },
      4.0,
      undefined,
      { physicsConfig: customConfig }
    );

    expect(dynamite.physicsConfig).toBeDefined();
    expect(dynamite.physicsConfig?.colliderWidth).toBe(32);
    expect(dynamite.physicsConfig?.colliderHeight).toBe(10);
  });

  it('stores explosionRadius from options when configured', () => {
    const dynamite = new MiningDynamiteEntity('dyn-radius', { x: 10, y: 5 }, { x: 0, y: 0 }, 4.0, undefined, {
      explosionRadius: 5,
    });
    expect(dynamite.explosionRadius).toBe(5);
  });

  it('leaves explosionRadius undefined if no explosion effect is configured', () => {
    const dynamite = new MiningDynamiteEntity('dyn-no-radius', { x: 10, y: 5 }, { x: 0, y: 0 }, 4.0);
    expect(dynamite.explosionRadius).toBeUndefined();
  });
});
