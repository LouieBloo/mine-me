import { describe, it, expect, beforeEach } from 'vitest';
import { MiningPlayerBody } from './MiningPlayerBody';
import { MiningRockEntity } from './MiningRockEntity';
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

describe('MiningPhysicsBody & Subclasses (Gravity & Collision)', () => {
  let grid: ServerMiningGrid;

  beforeEach(() => {
    grid = createEmptyGrid();
  });

  describe('MiningPlayerBody', () => {
    it('applies downward gravity acceleration and falls when unsupported', () => {
      const player = new MiningPlayerBody({ x: 5, y: 2 });
      expect(player.velocity.y).toBe(0);

      // Simulate 0.1 seconds of free-fall
      player.update(0.1, grid);

      expect(player.velocity.y).toBeGreaterThan(0);
      expect(player.position.y).toBeGreaterThan(2);
      expect(player.isGrounded).toBe(false);
    });

    it('stops falling and sets isGrounded when colliding with solid floor', () => {
      const player = new MiningPlayerBody({ x: 5, y: 2 });
      // Place solid dirt tile at (5, 3)
      grid[3][5] = { type: MiningTileType.DIRT, revealed: true };

      // Simulate multiple ticks until grounded
      for (let i = 0; i < 20; i++) {
        player.update(0.033, grid);
      }

      expect(player.isGrounded).toBe(true);
      expect(player.velocity.y).toBe(0);
      // Player center should be resting above the top of tile y=3 (which starts at y=3.0)
      expect(player.position.y).toBeLessThan(3.0);
    });

    it('handles horizontal walking while gravity is active', () => {
      const player = new MiningPlayerBody({ x: 5, y: 2 });
      // Ground the player on a floor
      grid[3][5] = { type: MiningTileType.DIRT, revealed: true };
      grid[3][6] = { type: MiningTileType.DIRT, revealed: true };

      player.processInputs({
        left: false,
        right: true,
        up: false,
        down: false,
        miningKey: false,
        sequence: 1,
      });

      player.update(0.1, grid);

      expect(player.velocity.x).toBeGreaterThan(0);
      expect(player.position.x).toBeGreaterThan(5);
      expect(player.facing.x).toBe(1);
      expect(player.facing.y).toBe(0);
    });

    it('allows facing up/down for mining orientation without vertical flying', () => {
      const player = new MiningPlayerBody({ x: 5, y: 2 });

      player.processInputs({
        left: false,
        right: false,
        up: true,
        down: false,
        miningKey: false,
        sequence: 1,
      });

      expect(player.facing.x).toBe(0);
      expect(player.facing.y).toBe(-1); // Facing up towards block above

      player.update(0.1, grid);
      // Up key does not propel upward against gravity
      expect(player.velocity.y).toBeGreaterThan(0);
    });
  });

  describe('MiningRockEntity', () => {
    it('falls under gravity and settles upon ground impact', () => {
      const rock = new MiningRockEntity('rock-1', 10, 1);
      // Place solid dirt floor at y=4
      grid[4][10] = { type: MiningTileType.DIRT, revealed: true };

      expect(rock.hasSettled).toBe(false);
      // Rock starts centered at (10.5, 1.5)
      expect(rock.position.y).toBeCloseTo(1.5);

      for (let i = 0; i < 25; i++) {
        rock.update(0.033, grid);
      }

      expect(rock.hasSettled).toBe(true);
      expect(rock.settledTile).not.toBeNull();
      expect(rock.settledTile?.x).toBe(10);
      // Should settle at tile 3 (directly above floor at tile 4)
      expect(rock.settledTile?.y).toBe(3);
      expect(rock.totalFallenDistance).toBeGreaterThan(1.0);
      // Position should be snapped to center of settled tile
      expect(rock.position.y).toBeCloseTo(3.5);
    });
  });
});
