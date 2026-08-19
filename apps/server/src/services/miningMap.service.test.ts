import { describe, it, expect } from 'vitest';
import { generateMiningMap } from './miningMap.service';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';

describe('miningMap.service', () => {
  describe('generateMiningMap', () => {
    it('generates a grid with a ladder at the start position (ENTRANCE_X, ENTRANCE_Y)', () => {
      const grid = generateMiningMap({ seed: 12345 });

      expect(grid.length).toBe(MINING_CONFIG.GRID_HEIGHT);
      expect(grid[0].length).toBe(MINING_CONFIG.GRID_WIDTH);

      // Start position tile must be a LADDER and revealed
      const startTile = grid[MINING_CONFIG.ENTRANCE_Y][MINING_CONFIG.ENTRANCE_X];
      expect(startTile.type).toBe(MiningTileType.LADDER);
      expect(startTile.revealed).toBe(true);
    });

    it('clears adjacent surface tiles around start position and reveals the tile below', () => {
      const grid = generateMiningMap({ seed: 42 });

      const startX = MINING_CONFIG.ENTRANCE_X;
      const startY = MINING_CONFIG.ENTRANCE_Y;

      // Left and right surface tiles should be EMPTY and revealed
      if (startX > 0) {
        expect(grid[startY][startX - 1].type).toBe(MiningTileType.EMPTY);
        expect(grid[startY][startX - 1].revealed).toBe(true);
      }
      if (startX + 1 < MINING_CONFIG.GRID_WIDTH) {
        expect(grid[startY][startX + 1].type).toBe(MiningTileType.EMPTY);
        expect(grid[startY][startX + 1].revealed).toBe(true);
      }

      // Tile directly below should be revealed
      expect(grid[startY + 1][startX].revealed).toBe(true);
    });
  });
});
