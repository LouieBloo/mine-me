import { describe, it, expect, beforeEach } from 'vitest';
import { MiningMobBody } from '../src/physics/MiningMobBody';
import { MiningTileType, MINING_CONFIG } from '../src/types/mining';
import type { MiningCollisionGrid } from '../src/physics/MiningPhysicsBody';

describe('MiningMobBody', () => {
  let grid: MiningCollisionGrid;

  beforeEach(() => {
    // Create an empty 20x20 grid with solid dirt floor at y=10
    grid = {};
    for (let y = 0; y < 20; y++) {
      grid[y] = {};
      for (let x = 0; x < 20; x++) {
        grid[y][x] = { type: y === 10 ? MiningTileType.DIRT : MiningTileType.EMPTY };
      }
    }
  });

  it('initializes with default and custom options', () => {
    const mob = new MiningMobBody({
      position: { x: 5, y: 5 },
      moveSpeed: 4.5,
      jumpForce: 8.0,
      climbSpeed: 2.5,
    });

    expect(mob.position).toEqual({ x: 5, y: 5 });
    expect(mob.moveSpeed).toBe(4.5);
    expect(mob.jumpForce).toBe(8.0);
    expect(mob.climbSpeed).toBe(2.5);
    expect(mob.isFacingLeft).toBe(false);
    expect(mob.isMining).toBe(false);
  });

  it('updates horizontal movement and facing direction', () => {
    const mob = new MiningMobBody({
      position: { x: 5, y: 5 },
      moveSpeed: 3.0,
    });

    // Move left
    mob.processMovement(-1, false, false, false, grid);
    expect(mob.velocity.x).toBe(-3.0);
    expect(mob.isFacingLeft).toBe(true);

    // Move right
    mob.processMovement(1, false, false, false, grid);
    expect(mob.velocity.x).toBe(3.0);
    expect(mob.isFacingLeft).toBe(false);

    // Stop
    mob.processMovement(0, false, false, false, grid);
    expect(mob.velocity.x).toBe(0);
    expect(mob.isFacingLeft).toBe(false); // Retains last facing
  });

  it('jumps only when grounded', () => {
    const halfHeight = MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE);
    const mob = new MiningMobBody({
      position: { x: 5.5, y: 10.0 - halfHeight }, // Resting on top of dirt floor at y=10
      jumpForce: 6.5,
    });
    mob.isGrounded = true;

    // First update keeps ground
    mob.update(0.016, grid);
    expect(mob.isGrounded).toBe(true);

    // Jump
    mob.processMovement(0, true, false, false, grid);
    expect(mob.velocity.y).toBe(-6.5);
    expect(mob.isGrounded).toBe(false);

    // Airborne - pressing jump again should not re-apply jump force
    mob.velocity.y = -2.0;
    mob.processMovement(0, true, false, false, grid);
    expect(mob.velocity.y).toBe(-2.0);
  });

  it('detects ladders and enables climbing up, down, or holding grip', () => {
    // Place ladder at (5, 5)
    grid[5][5] = { type: MiningTileType.LADDER };

    const mob = new MiningMobBody({
      position: { x: 5.5, y: 5.5 },
      climbSpeed: 3.0,
    });

    expect(mob.checkIsOnLadder(grid)).toBe(true);

    // Climb up
    mob.processMovement(0, false, true, false, grid);
    expect(mob.isOnLadder).toBe(true);
    expect(mob.velocity.y).toBe(-3.0);
    expect(mob.hasGravity).toBe(false);

    // Climb down
    mob.processMovement(0, false, false, true, grid);
    expect(mob.velocity.y).toBe(3.0);

    // Hold grip (no climb input on ladder)
    mob.processMovement(0, false, false, false, grid);
    expect(mob.velocity.y).toBe(0);

    // Jump off ladder
    mob.processMovement(0, true, false, false, grid);
    expect(mob.velocity.y).toBe(-mob.jumpForce);
    expect(mob.hasGravity).toBe(true);
  });

  it('starts and stops mining target', () => {
    const mob = new MiningMobBody({
      position: { x: 5, y: 5 },
    });

    mob.startMining({ x: 4, y: 5 });
    expect(mob.isMining).toBe(true);
    expect(mob.miningTarget).toEqual({ x: 4, y: 5 });
    expect(mob.isFacingLeft).toBe(true);
    expect(mob.velocity.x).toBe(0);

    mob.stopMining();
    expect(mob.isMining).toBe(false);
    expect(mob.miningTarget).toBeNull();
  });
});
