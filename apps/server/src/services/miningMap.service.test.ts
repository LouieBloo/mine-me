import { describe, it, expect } from 'vitest';
import { generateMiningMap } from './miningMap.service';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';

describe('miningMap.service', () => {
  describe('generateMiningMap', () => {
    it('generates a grid where all blocks at the start position are filled in with DIRT and no starting ladder', () => {
      const grid = generateMiningMap({ seed: 12345 });

      expect(grid.length).toBe(MINING_CONFIG.GRID_HEIGHT);
      expect(grid[0].length).toBe(MINING_CONFIG.GRID_WIDTH);

      // Start position tile must be DIRT (no ladder)
      const startTile = grid[MINING_CONFIG.ENTRANCE_Y][MINING_CONFIG.ENTRANCE_X];
      expect(startTile.type).toBe(MiningTileType.DIRT);
    });

    it('ensures adjacent surface tiles around start position are filled in (not empty)', () => {
      const grid = generateMiningMap({ seed: 42 });

      const startX = MINING_CONFIG.ENTRANCE_X;
      const startY = MINING_CONFIG.ENTRANCE_Y;

      // Left and right surface tiles should be DIRT (not EMPTY)
      if (startX > 0) {
        expect(grid[startY][startX - 1].type).toBe(MiningTileType.DIRT);
      }
      if (startX + 1 < MINING_CONFIG.GRID_WIDTH) {
        expect(grid[startY][startX + 1].type).toBe(MiningTileType.DIRT);
      }
      expect(grid[startY][startX].type).toBe(MiningTileType.DIRT);
    });

    it('generates caves and caverns with open empty spaces within expected bounds', () => {
      const grid = generateMiningMap({ seed: 999 });
      let emptyCount = 0;
      const totalUnderground = (MINING_CONFIG.GRID_HEIGHT - 1) * MINING_CONFIG.GRID_WIDTH;

      for (let y = 1; y < MINING_CONFIG.GRID_HEIGHT; y++) {
        for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
          if (grid[y][x].type === MiningTileType.EMPTY) {
            emptyCount++;
          }
        }
      }

      const emptyPercentage = (emptyCount / totalUnderground) * 100;
      // Expect natural subterranean voids between 10% and 40% under default configuration
      expect(emptyPercentage).toBeGreaterThanOrEqual(10);
      expect(emptyPercentage).toBeLessThanOrEqual(40);
    });

    it('ensures no rocks spawn floating in mid-air above empty spaces', () => {
      const seeds = [1, 42, 999, 12345, 88888];
      for (const seed of seeds) {
        const grid = generateMiningMap({ seed });
        for (let y = 1; y < MINING_CONFIG.GRID_HEIGHT; y++) {
          for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
            if (grid[y][x].type === MiningTileType.ROCK) {
              const belowY = y + 1;
              if (belowY < MINING_CONFIG.GRID_HEIGHT) {
                // Rock must not be directly above an empty tile
                expect(grid[belowY][x].type).not.toBe(MiningTileType.EMPTY);
              }
            }
          }
        }
      }
    });

    it('places treasure chests in the lower half of the map', () => {
      const grid = generateMiningMap({ seed: 777 });
      let chestCount = 0;
      const midY = Math.floor(MINING_CONFIG.GRID_HEIGHT / 2);

      for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
        for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
          if (grid[y][x].type === MiningTileType.CHEST) {
            chestCount++;
            expect(y).toBeGreaterThanOrEqual(midY);
          }
        }
      }

      expect(chestCount).toBe(MINING_CONFIG.TREASURE_CHEST_COUNT);
    });

    it('honors custom config overrides to disable caverns and tunnels', () => {
      const grid = generateMiningMap({
        seed: 42,
        config: {
          cavernDensity: 0,
          tunnelCount: 0,
        },
      });

      let emptyCount = 0;
      for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
        for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
          if (grid[y][x].type === MiningTileType.EMPTY) {
            emptyCount++;
          }
        }
      }

      // With caverns and tunnels disabled, there should be 0 empty tiles
      expect(emptyCount).toBe(0);
    });

    it('produces 100% deterministic grids from identical seeds and configurations', () => {
      const gridA = generateMiningMap({ seed: 1337 });
      const gridB = generateMiningMap({ seed: 1337 });

      for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
        for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
          expect(gridA[y][x].type).toBe(gridB[y][x].type);
        }
      }
    });

    it('generates Copperium and Silverium blocks with Silverium strictly below silveriumMinDepth', () => {
      const minDepth = 12;
      const grid = generateMiningMap({
        seed: 55555,
        config: {
          copperiumPercentage: 5,
          silveriumPercentage: 3,
          silveriumMinDepth: minDepth,
        },
      });

      let copperiumCount = 0;
      let silveriumCount = 0;

      for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
        for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
          const tileType = grid[y][x].type;
          if (tileType === MiningTileType.COPPERIUM) {
            copperiumCount++;
          }
          if (tileType === MiningTileType.SILVERIUM) {
            silveriumCount++;
            // Silverium must NEVER spawn above silveriumMinDepth
            expect(y).toBeGreaterThanOrEqual(minDepth);
          }
        }
      }

      expect(copperiumCount).toBeGreaterThan(0);
      expect(silveriumCount).toBeGreaterThan(0);
    });

    it('spawns Copperium and Silverium in contiguous clusters when oreClusterChance is high', () => {
      const grid = generateMiningMap({
        seed: 77777,
        config: {
          copperiumPercentage: 6,
          silveriumPercentage: 4,
          silveriumMinDepth: 10,
          oreClusterChance: 100,
        },
      });

      // Find at least one cluster of Copperium with adjacent Copperium neighbors
      let foundCopperiumCluster = false;
      let foundSilveriumCluster = false;

      const directions = [
        [0, -1], [0, 1], [-1, 0], [1, 0],
      ];

      for (let y = 1; y < MINING_CONFIG.GRID_HEIGHT; y++) {
        for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
          const type = grid[y][x].type;
          if (type === MiningTileType.COPPERIUM && !foundCopperiumCluster) {
            const hasAdjacent = directions.some(([dx, dy]) => {
              const nx = x + dx;
              const ny = y + dy;
              return nx >= 0 && nx < MINING_CONFIG.GRID_WIDTH && ny >= 0 && ny < MINING_CONFIG.GRID_HEIGHT &&
                grid[ny][nx].type === MiningTileType.COPPERIUM;
            });
            if (hasAdjacent) foundCopperiumCluster = true;
          }

          if (type === MiningTileType.SILVERIUM && !foundSilveriumCluster) {
            const hasAdjacent = directions.some(([dx, dy]) => {
              const nx = x + dx;
              const ny = y + dy;
              return nx >= 0 && nx < MINING_CONFIG.GRID_WIDTH && ny >= 0 && ny < MINING_CONFIG.GRID_HEIGHT &&
                grid[ny][nx].type === MiningTileType.SILVERIUM;
            });
            if (hasAdjacent) foundSilveriumCluster = true;
          }
        }
      }

      expect(foundCopperiumCluster).toBe(true);
      expect(foundSilveriumCluster).toBe(true);
    });

    it('respects zero-percentage settings to disable Copperium and Silverium generation', () => {
      const grid = generateMiningMap({
        seed: 88888,
        config: {
          copperiumPercentage: 0,
          silveriumPercentage: 0,
        },
      });

      let copperiumCount = 0;
      let silveriumCount = 0;

      for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
        for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
          if (grid[y][x].type === MiningTileType.COPPERIUM) copperiumCount++;
          if (grid[y][x].type === MiningTileType.SILVERIUM) silveriumCount++;
        }
      }

      expect(copperiumCount).toBe(0);
      expect(silveriumCount).toBe(0);
    });
  });
});
