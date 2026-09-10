import { describe, it, expect, beforeEach } from 'vitest';
import { MiningPlayerBody, MiningTileType, MINING_CONFIG } from '../src';
import type { MiningCollisionGrid } from '../src/physics/MiningPhysicsBody';

function createEmptyGrid(): MiningCollisionGrid {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    grid[y] = {};
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      grid[y][x] = { type: MiningTileType.EMPTY };
    }
  }
  return grid;
}

describe('MiningPhysicsBody Ground Stability & Zero Jitter', () => {
  let grid: MiningCollisionGrid;

  beforeEach(() => {
    grid = createEmptyGrid();
  });

  it('maintains rock-solid position without vertical jitter when standing on a block over 120 frames', () => {
    // Floor block at (5, 5)
    grid[5][5] = { type: MiningTileType.DIRT };

    // Player positioned resting directly on the top surface of block y=5
    const player = new MiningPlayerBody({ x: 5.5, y: 5.0 - (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE)) });
    player.isGrounded = true;

    const initialY = player.position.y;
    expect(player.velocity.y).toBe(0);

    // Simulate 120 frames (~2 seconds at 60 Hz or 1 second at 120 Hz) with variable delta times
    for (let i = 0; i < 120; i++) {
      const dt = i % 2 === 0 ? 0.0166 : 0.0083; // alternating 60Hz and 120Hz frame times
      player.update(dt, grid);

      // Player must remain firmly grounded with zero vertical velocity
      expect(player.isGrounded).toBe(true);
      expect(player.velocity.y).toBe(0);
      // Absolute position.y must never deviate by even a fraction of a pixel
      expect(player.position.y).toBe(initialY);
    }
  });

  it('lands cleanly on a solid floor from air and stabilizes immediately', () => {
    // Floor block at y=5
    grid[5][5] = { type: MiningTileType.DIRT };

    // Player falling from y=2
    const player = new MiningPlayerBody({ x: 5.5, y: 2.0 });
    expect(player.isGrounded).toBe(false);

    // Run physics until the player lands
    for (let i = 0; i < 30; i++) {
      player.update(0.033, grid);
    }

    expect(player.isGrounded).toBe(true);
    expect(player.velocity.y).toBe(0);

    const expectedRestingY = 5.0 - player.halfHeight;
    expect(player.position.y).toBeCloseTo(expectedRestingY, 4);

    // Following frames must remain locked at expectedRestingY
    for (let i = 0; i < 60; i++) {
      player.update(0.016, grid);
      expect(player.position.y).toBeCloseTo(expectedRestingY, 4);
      expect(player.velocity.y).toBe(0);
      expect(player.isGrounded).toBe(true);
    }
  });

  it('ungrounds and falls immediately when the floor block beneath is mined', () => {
    grid[5][5] = { type: MiningTileType.DIRT };
    const player = new MiningPlayerBody({ x: 5.5, y: 5.0 - (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE)) });
    player.isGrounded = true;

    player.update(0.016, grid);
    expect(player.isGrounded).toBe(true);

    // Destroy the block underneath (e.g. mined to EMPTY air)
    grid[5][5] = { type: MiningTileType.EMPTY };

    // Next update step must detect loss of ground and apply gravity
    player.update(0.016, grid);
    expect(player.isGrounded).toBe(false);
    expect(player.velocity.y).toBeGreaterThan(0);
    expect(player.position.y).toBeGreaterThan(5.0 - player.halfHeight);
  });

  it('ungrounds and falls when walking horizontally off a ledge', () => {
    // Solid block only at (5, 5), tile (6, 5) is empty pit
    grid[5][5] = { type: MiningTileType.DIRT };

    const restingY = 5.0 - (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE));
    const player = new MiningPlayerBody({ x: 5.5, y: restingY });
    player.isGrounded = true;

    // Walk right towards the pit
    player.processInputs({ left: false, right: true, up: false, down: false, miningKey: false, sequence: 1 });

    // Step physics until player walks completely off tile 5
    for (let i = 0; i < 20; i++) {
      player.update(0.05, grid);
    }

    // Player should now be past tile 5 over the pit and falling
    expect(player.position.x).toBeGreaterThan(6.0);
    expect(player.isGrounded).toBe(false);
    expect(player.velocity.y).toBeGreaterThan(0);
  });

  it('allows jumping immediately from grounded stance without ground clamp resistance', () => {
    grid[5][5] = { type: MiningTileType.DIRT };
    const player = new MiningPlayerBody({ x: 5.5, y: 5.0 - (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE)) });
    player.isGrounded = true;

    player.processInputs({ left: false, right: false, up: false, down: false, jump: true, miningKey: false, sequence: 1 });
    expect(player.velocity.y).toBeCloseTo(-MINING_CONFIG.JUMP_FORCE);
    expect(player.isGrounded).toBe(false);

    // Update frame - player ascends into air
    player.update(0.016, grid);
    expect(player.position.y).toBeLessThan(5.0 - player.halfHeight);
    expect(player.isGrounded).toBe(false);
  });

  it('snaps flush against a solid wall on the right and maintains rock-solid position without jitter over 60 frames', () => {
    // Floor at y=5, wall at (7, 4)
    grid[5][5] = { type: MiningTileType.DIRT };
    grid[5][6] = { type: MiningTileType.DIRT };
    grid[5][7] = { type: MiningTileType.DIRT };
    grid[4][7] = { type: MiningTileType.DIRT }; // Wall blocking right movement

    const restingY = 5.0 - (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE));
    const player = new MiningPlayerBody({ x: 5.5, y: restingY });
    player.isGrounded = true;

    const moveRightInput = { left: false, right: true, up: false, down: false, miningKey: false, sequence: 1 };

    // Step physics with active right input until player hits the wall
    for (let i = 0; i < 30; i++) {
      player.processInputs(moveRightInput, grid);
      player.update(0.016, grid);
    }

    const expectedFlushX = 7.0 - player.halfWidth;
    expect(player.position.x).toBeCloseTo(expectedFlushX, 4);
    expect(player.collisionX).toBe(true);

    // Continue pressing right into the wall for 60 more frames - must not penetrate or jitter
    for (let i = 0; i < 60; i++) {
      player.processInputs(moveRightInput, grid);
      player.update(0.016, grid);
      expect(player.position.x).toBeCloseTo(expectedFlushX, 4);
      expect(player.collisionX).toBe(true);
      expect(player.velocity.x).toBe(0);
    }
  });

  it('snaps flush against a solid wall on the left and maintains rock-solid position without jitter over 60 frames', () => {
    // Floor at y=5, wall at (3, 4)
    grid[5][3] = { type: MiningTileType.DIRT };
    grid[5][4] = { type: MiningTileType.DIRT };
    grid[5][5] = { type: MiningTileType.DIRT };
    grid[4][3] = { type: MiningTileType.DIRT }; // Wall blocking left movement

    const restingY = 5.0 - (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE));
    const player = new MiningPlayerBody({ x: 5.0, y: restingY });
    player.isGrounded = true;

    const moveLeftInput = { left: true, right: false, up: false, down: false, miningKey: false, sequence: 1 };

    // Step physics with active left input until player hits the wall
    for (let i = 0; i < 30; i++) {
      player.processInputs(moveLeftInput, grid);
      player.update(0.016, grid);
    }

    const expectedFlushX = 3.0 + 1.0 + player.halfWidth; // 4.0 + halfWidth
    expect(player.position.x).toBeCloseTo(expectedFlushX, 4);
    expect(player.collisionX).toBe(true);

    // Continue pressing left into the wall for 60 more frames - must not penetrate or jitter
    for (let i = 0; i < 60; i++) {
      player.processInputs(moveLeftInput, grid);
      player.update(0.016, grid);
      expect(player.position.x).toBeCloseTo(expectedFlushX, 4);
      expect(player.collisionX).toBe(true);
      expect(player.velocity.x).toBe(0);
    }
  });
});
