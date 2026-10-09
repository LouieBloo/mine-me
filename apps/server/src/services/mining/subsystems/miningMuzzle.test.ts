import { describe, it, expect } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { resolveMuzzlePosition } from './miningMuzzle';
import { isSegmentBlocked } from './miningGeometry';

const emptyGrid = () =>
  Array.from({ length: MINING_CONFIG.GRID_HEIGHT }, () =>
    Array.from({ length: MINING_CONFIG.GRID_WIDTH }, () => ({ type: MiningTileType.EMPTY, revealed: true }))
  ) as any;

const player = { x: 20.5, y: 20.5 };
const shoulderY = player.y - MINING_CONFIG.MELEE_SHOULDER_OFFSET_Y;

describe('isSegmentBlocked', () => {
  it('is false across empty space and true through a solid tile', () => {
    const grid = emptyGrid();
    expect(isSegmentBlocked(grid, player, { x: 25, y: 20.5 })).toBe(false);
    grid[20][22] = { type: MiningTileType.DIRT, revealed: true };
    expect(isSegmentBlocked(grid, player, { x: 25, y: 20.5 })).toBe(true);
  });

  it('treats the sky above the map as open and the side walls as solid', () => {
    const grid = emptyGrid();
    expect(isSegmentBlocked(grid, { x: 5, y: 1 }, { x: 5, y: -10 })).toBe(false);
    expect(isSegmentBlocked(grid, { x: 1, y: 5 }, { x: -3, y: 5 })).toBe(true);
  });
});

describe('resolveMuzzlePosition', () => {
  it('uses the server estimate (shoulder + reach along the aim) when no client muzzle is given', () => {
    const m = resolveMuzzlePosition(player, { x: 30.5, y: shoulderY }, emptyGrid());
    expect(m.x).toBeCloseTo(player.x + MINING_CONFIG.GUN_MUZZLE_REACH, 5);
    expect(m.y).toBeCloseTo(shoulderY, 5);
  });

  it('accepts a plausible client muzzle', () => {
    const client = { x: player.x + 0.8, y: shoulderY + 0.2 };
    expect(resolveMuzzlePosition(player, { x: 30.5, y: shoulderY }, emptyGrid(), client)).toEqual(client);
  });

  it('rejects a client muzzle too far from the estimate', () => {
    const m = resolveMuzzlePosition(player, { x: 30.5, y: shoulderY }, emptyGrid(), { x: player.x + 2.4, y: shoulderY });
    expect(m.x).toBeCloseTo(player.x + MINING_CONFIG.GUN_MUZZLE_REACH, 5);
  });

  it('rejects a client muzzle that is behind a wall even if close to the estimate', () => {
    const grid = emptyGrid();
    // Wall one tile to the right of the player; muzzle placed just beyond it
    grid[20][21] = { type: MiningTileType.DIRT, revealed: true };
    grid[20][22] = { type: MiningTileType.DIRT, revealed: true };
    const m = resolveMuzzlePosition(player, { x: 30.5, y: shoulderY }, grid, { x: player.x + 1.5, y: shoulderY });
    // Falls back to the shoulder because the estimate itself is inside the wall
    expect(m).toEqual({ x: player.x, y: shoulderY });
  });

  it('handles a target at the shoulder without NaN', () => {
    const m = resolveMuzzlePosition(player, { x: player.x, y: shoulderY }, emptyGrid());
    expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
  });
});
