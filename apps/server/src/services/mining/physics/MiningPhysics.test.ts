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

    it('supports diagonal facing directions (NW, NE, SW, SE)', () => {
      const player = new MiningPlayerBody({ x: 5, y: 2 });

      // North-West (Up + Left)
      player.processInputs({ left: true, right: false, up: true, down: false, miningKey: false, sequence: 1 });
      expect(player.facing).toEqual({ x: -1, y: -1 });

      // North-East (Up + Right)
      player.processInputs({ left: false, right: true, up: true, down: false, miningKey: false, sequence: 2 });
      expect(player.facing).toEqual({ x: 1, y: -1 });

      // South-West (Down + Left)
      player.processInputs({ left: true, right: false, up: false, down: true, miningKey: false, sequence: 3 });
      expect(player.facing).toEqual({ x: -1, y: 1 });

      // South-East (Down + Right)
      player.processInputs({ left: false, right: true, up: false, down: true, miningKey: false, sequence: 4 });
      expect(player.facing).toEqual({ x: 1, y: 1 });
    });

    it('jumps upward with configurable JUMP_FORCE when grounded', () => {
      const player = new MiningPlayerBody({ x: 5, y: 2 });
      // Ground the player on solid dirt floor at y=3
      grid[3][5] = { type: MiningTileType.DIRT, revealed: true };
      player.isGrounded = true;

      player.processInputs({
        left: false,
        right: false,
        up: false,
        down: false,
        jump: true,
        miningKey: false,
        sequence: 1,
      });

      // Upward velocity is negative in screen coordinates
      expect(player.velocity.y).toBeCloseTo(-MINING_CONFIG.JUMP_FORCE);
      expect(player.isGrounded).toBe(false);

      // Subsequent input while airborne should not jump again
      player.velocity.y = 2.0; // falling
      player.processInputs({
        left: false,
        right: false,
        up: false,
        down: false,
        jump: true,
        miningKey: false,
        sequence: 2,
      });
      // Velocity unchanged because not grounded
      expect(player.velocity.y).toBe(2.0);
    });

    it('allows player at surface to jump into the open sky (y < 0) without ceiling clamp', () => {
      const expectedRestingY = 1.0 - MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE);
      // Surface level: player standing at entrance y=0 on dirt below (tile y=1)
      const player = new MiningPlayerBody({ x: 15, y: expectedRestingY });
      grid[1][15] = { type: MiningTileType.DIRT, revealed: true };
      player.isGrounded = true;

      player.processInputs({
        left: false,
        right: false,
        up: false,
        down: false,
        jump: true,
        miningKey: false,
        sequence: 1,
      });

      // Update physics for several frames to ascend into the open sky
      for (let i = 0; i < 10; i++) {
        player.update(0.033, grid);
      }

      // Player should have ascended smoothly into the sky (y < 0)
      expect(player.position.y).toBeLessThan(0);
      expect(player.isGrounded).toBe(false);

      // Continue simulating until gravity pulls player back down to surface
      for (let i = 0; i < 30; i++) {
        player.update(0.033, grid);
      }

      // Player lands safely back on the surface
      expect(player.isGrounded).toBe(true);
      expect(player.position.y).toBeCloseTo(expectedRestingY, 1);
    });

    it('climbs up and down on ladder tiles', () => {
      // Create vertical ladder shaft at x=5, from y=2 to y=6
      for (let y = 2; y <= 6; y++) {
        grid[y][5] = { type: MiningTileType.LADDER, revealed: true };
      }

      // Player centered on ladder at (5.5, 4.5)
      const player = new MiningPlayerBody({ x: 5.5, y: 4.5 });
      expect(player.checkIsOnLadder(grid)).toBe(true);

      // 1. Climb Up
      player.processInputs(
        { left: false, right: false, up: true, down: false, jump: false, miningKey: false, sequence: 1 },
        grid
      );
      expect(player.isOnLadder).toBe(true);
      expect(player.velocity.y).toBeCloseTo(-MINING_CONFIG.CLIMB_SPEED);
      expect(player.hasGravity).toBe(false);

      player.update(0.1, grid);
      expect(player.position.y).toBeLessThan(4.5);

      // 2. Climb Down
      player.processInputs(
        { left: false, right: false, up: false, down: true, jump: false, miningKey: false, sequence: 2 },
        grid
      );
      expect(player.velocity.y).toBeCloseTo(MINING_CONFIG.CLIMB_SPEED);
      expect(player.hasGravity).toBe(false);

      player.update(0.2, grid);
      expect(player.position.y).toBeGreaterThan(4.5 - 0.35);

      // 3. Stationary Hold on Ladder (no vertical input)
      player.processInputs(
        { left: false, right: false, up: false, down: false, jump: false, miningKey: false, sequence: 3 },
        grid
      );
      expect(player.velocity.y).toBe(0);
      expect(player.hasGravity).toBe(false);

      const holdY = player.position.y;
      player.update(0.1, grid);
      expect(player.position.y).toBeCloseTo(holdY, 4);
    });

    it('allows jumping off a ladder in mid-air', () => {
      // Ladder at (5, 4)
      grid[4][5] = { type: MiningTileType.LADDER, revealed: true };
      const player = new MiningPlayerBody({ x: 5.5, y: 4.5 });

      player.processInputs(
        { left: false, right: false, up: false, down: false, jump: true, miningKey: false, sequence: 1 },
        grid
      );

      // Jumping off ladder should give immediate upward jump force
      expect(player.velocity.y).toBeCloseTo(-MINING_CONFIG.JUMP_FORCE);
      expect(player.hasGravity).toBe(true);
      expect(player.isGrounded).toBe(false);
    });

    it('falls when walking off a ladder into empty space', () => {
      // Ladder at (5, 4)
      grid[4][5] = { type: MiningTileType.LADDER, revealed: true };
      const player = new MiningPlayerBody({ x: 5.5, y: 4.5 });

      // Hold on ladder first
      player.processInputs(
        { left: false, right: false, up: false, down: false, jump: false, miningKey: false, sequence: 1 },
        grid
      );
      expect(player.isOnLadder).toBe(true);
      expect(player.hasGravity).toBe(false);

      // Walk far to the right away from ladder (x > 5.5 + LADDER_GRAB_WIDTH)
      player.position.x = 7.0; // 2 tiles away from ladder
      player.processInputs(
        { left: false, right: true, up: false, down: false, jump: false, miningKey: false, sequence: 2 },
        grid
      );

      expect(player.isOnLadder).toBe(false);
      expect(player.hasGravity).toBe(true);

      // Simulate tick - player should fall downward under gravity
      player.update(0.1, grid);
      expect(player.velocity.y).toBeGreaterThan(0);
      expect(player.position.y).toBeGreaterThan(4.5);
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
