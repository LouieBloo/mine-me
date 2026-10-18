import { describe, it, expect } from 'vitest';
import { BLOCK_SCALE, MiningTileType, type MiningClientTile } from '@mine-me/shared';
import { applyPlacedPiece } from './optimisticPlacement';

const emptyGrid = (): MiningClientTile[][] =>
  Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => ({ type: MiningTileType.EMPTY, revealed: true })));

describe('applyPlacedPiece', () => {
  it('fills the whole footprint with the placed type and each cell\'s offset', () => {
    const grid = emptyGrid();
    const changed = applyPlacedPiece(grid, MiningTileType.LADDER, { x: 4, y: 5 });
    expect(changed).toHaveLength(BLOCK_SCALE * BLOCK_SCALE);
    for (const c of changed) {
      expect(grid[c.y][c.x]).toMatchObject({ type: MiningTileType.LADDER, piece: c.piece, damageStage: 0 });
      expect([c.x - 4, c.y - 5]).toEqual(c.piece);
    }
    expect(grid[5][3].type).toBe(MiningTileType.EMPTY);
    expect(grid[4][4].type).toBe(MiningTileType.EMPTY);
  });

  it('skips cells that are off the grid instead of throwing', () => {
    const grid = emptyGrid();
    expect(() => applyPlacedPiece(grid, MiningTileType.BRIDGE, { x: 11, y: 11 })).not.toThrow();
  });
});
