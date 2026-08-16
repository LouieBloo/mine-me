import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';

describe('MiningGameEngine', () => {
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      connected: true,
      emit: vi.fn(),
    };
  });

  it('initializes engine with floating-point entrance position', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });

    expect(engine.position.x).toBe(MINING_CONFIG.ENTRANCE_X);
    expect(engine.position.y).toBe(MINING_CONFIG.ENTRANCE_Y);
    expect(engine.isMining).toBe(false);
  });

  it('updates inputs and processes physics tick', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });

    // Press right arrow
    engine.handleInput({
      up: false,
      down: false,
      left: false,
      right: true,
      miningKey: false,
      sequence: 1,
    });

    // Run 1 tick manually
    (engine as any).tick(0.033);

    // Position should move right
    expect(engine.position.x).toBeGreaterThan(MINING_CONFIG.ENTRANCE_X);
    expect(mockSocket.emit).toHaveBeenCalledWith('mining_state_tick', expect.objectContaining({
      position: expect.objectContaining({ x: expect.any(Number) }),
    }));
  });

  it('prevents walking into solid unmined tiles via AABB collision', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });

    // Make tile directly to the right a solid DIRT block
    engine.grid[0][MINING_CONFIG.ENTRANCE_X + 1] = { type: MiningTileType.DIRT, revealed: true };

    // Try moving right into solid dirt block
    engine.handleInput({
      up: false,
      down: false,
      left: false,
      right: true,
      miningKey: false,
      sequence: 2,
    });

    (engine as any).tick(0.1);

    // Position should be stopped by tile boundary collision
    expect(engine.position.x).toBeLessThan(MINING_CONFIG.ENTRANCE_X + 0.6);
  });

  it('picks up dropped items when player overlaps item position', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });

    // Add a dropped item near player position
    engine.droppedItems.push({
      position: { x: MINING_CONFIG.ENTRANCE_X, y: MINING_CONFIG.ENTRANCE_Y },
      itemId: 'gold_ore',
      itemName: 'Gold Ore',
      iconUrl: '/assets/items/gold_ore.png',
      quantity: 3,
    });

    // Run tick to trigger item pickup check
    (engine as any).tick(0.033);

    expect(engine.droppedItems.length).toBe(0);
    expect(engine.temporaryBackpack.length).toBe(1);
    expect(engine.temporaryBackpack[0].itemName).toBe('Gold Ore');
    expect(engine.temporaryBackpack[0].quantity).toBe(3);
  });

  it('stops mining when user releases all movement inputs', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });
    engine.playerBody.position = { x: MINING_CONFIG.ENTRANCE_X + 0.5, y: 1.0 - engine.playerBody.radius };
    engine.playerBody.isGrounded = true;

    // Make tile directly to the right a dirt block
    engine.grid[0][MINING_CONFIG.ENTRANCE_X + 1] = { type: MiningTileType.DIRT, revealed: true };

    // Move right into it to start mining
    engine.handleInput({
      up: false,
      down: false,
      left: false,
      right: true,
      miningKey: false,
      sequence: 1,
    });

    (engine as any).tick(0.033);
    expect(engine.isMining).toBe(true);
    expect(engine.miningTarget).toEqual({ x: MINING_CONFIG.ENTRANCE_X + 1, y: 0 });

    // Release all movement inputs
    engine.handleInput({
      up: false,
      down: false,
      left: false,
      right: false,
      miningKey: false,
      sequence: 2,
    });

    (engine as any).tick(0.033);
    expect(engine.isMining).toBe(false);
    expect(engine.miningTarget).toBeNull();
  });

  it('stops mining the first block and switches to the new block when input direction changes', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });
    engine.playerBody.position = { x: MINING_CONFIG.ENTRANCE_X + 0.5, y: 1.0 - engine.playerBody.radius };
    engine.playerBody.isGrounded = true;

    // Make tile right and tile left dirt blocks
    engine.grid[0][MINING_CONFIG.ENTRANCE_X + 1] = { type: MiningTileType.DIRT, revealed: true };
    engine.grid[0][MINING_CONFIG.ENTRANCE_X - 1] = { type: MiningTileType.DIRT, revealed: true };

    // Mine right
    engine.handleInput({
      up: false,
      down: false,
      left: false,
      right: true,
      miningKey: false,
      sequence: 1,
    });

    (engine as any).tick(0.033);
    expect(engine.isMining).toBe(true);
    expect(engine.miningTarget).toEqual({ x: MINING_CONFIG.ENTRANCE_X + 1, y: 0 });

    // Switch input direction to left
    engine.handleInput({
      up: false,
      down: false,
      left: true,
      right: false,
      miningKey: false,
      sequence: 2,
    });

    (engine as any).tick(0.033);
    expect(engine.isMining).toBe(true);
    expect(engine.miningTarget).toEqual({ x: MINING_CONFIG.ENTRANCE_X - 1, y: 0 });
  });

  it('automatically times out and stops session after max duration (15 min)', () => {
    const onTimeoutMock = vi.fn();
    const emitSpy = vi.fn();
    const testSocket = {
      ...mockSocket,
      connected: true,
      emit: emitSpy,
    } as any;

    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: testSocket,
      maxDurationSeconds: 10, // 10 seconds for unit test
      onTimeout: onTimeoutMock,
    });

    // Advance 5 seconds — should still run
    (engine as any).tick(5.0);
    expect(emitSpy).not.toHaveBeenCalledWith('mining_session_timeout', expect.anything());
    expect(onTimeoutMock).not.toHaveBeenCalled();

    // Advance past 10 seconds — should trigger timeout
    (engine as any).tick(5.1);
    expect(emitSpy).toHaveBeenCalledWith('mining_session_timeout', expect.objectContaining({
      message: expect.stringContaining('15-minute time limit'),
    }));
    expect(onTimeoutMock).toHaveBeenCalledWith('char-1');
  });

  it('prevents starting mining while jumping or airborne', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });
    engine.playerBody.position = { x: MINING_CONFIG.ENTRANCE_X + 0.5, y: MINING_CONFIG.ENTRANCE_Y + 0.5 };
    engine.playerBody.isGrounded = false;
    engine.grid[0][MINING_CONFIG.ENTRANCE_X + 1] = { type: MiningTileType.DIRT, revealed: true };

    const started = engine.startMining({ x: MINING_CONFIG.ENTRANCE_X + 1, y: 0 });
    expect(started).toBe(false);
    expect(engine.isMining).toBe(false);
  });

  it('cancels active mining immediately when player jumps or becomes airborne', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });
    engine.playerBody.position = { x: MINING_CONFIG.ENTRANCE_X + 0.5, y: 1.0 - engine.playerBody.radius };
    engine.playerBody.isGrounded = true;
    engine.grid[0][MINING_CONFIG.ENTRANCE_X + 1] = { type: MiningTileType.DIRT, revealed: true };

    // Move right into it to start mining while grounded
    engine.handleInput({
      up: false,
      down: false,
      left: false,
      right: true,
      miningKey: false,
      sequence: 1,
    });

    (engine as any).tick(0.033);
    expect(engine.isMining).toBe(true);

    // Player jumps (spacebar)
    engine.handleInput({
      up: false,
      down: false,
      left: false,
      right: true,
      jump: true,
      miningKey: false,
      sequence: 2,
    });

    (engine as any).tick(0.033);
    // Player is now airborne with upward velocity, mining should be stopped
    expect(engine.playerBody.isGrounded).toBe(false);
    expect(engine.isMining).toBe(false);
    expect(engine.miningTarget).toBeNull();
  });

  it('allows mining in diagonal directions (NE, NW, SE, SW)', () => {
    const engine = new MiningGameEngine({
      characterId: 'char-1',
      cityId: 'city-1',
      seed: 12345,
      socket: mockSocket,
    });
    engine.playerBody.position = { x: 10.5, y: 1.0 - engine.playerBody.halfHeight };
    engine.playerBody.isGrounded = true;

    // Place dirt block at South-East (11, 1) and South-West (9, 1)
    engine.grid[1][11] = { type: MiningTileType.DIRT, revealed: true };
    engine.grid[1][9] = { type: MiningTileType.DIRT, revealed: true };

    // Mine South-East (down + right)
    engine.handleInput({
      up: false,
      down: true,
      left: false,
      right: true,
      miningKey: false,
      sequence: 1,
    });

    (engine as any).tick(0.033);
    expect(engine.isMining).toBe(true);
    expect(engine.miningTarget).toEqual({ x: 11, y: 1 });

    // Switch to South-West (down + left)
    engine.handleInput({
      up: false,
      down: true,
      left: true,
      right: false,
      miningKey: false,
      sequence: 2,
    });

    (engine as any).tick(0.033);
    expect(engine.isMining).toBe(true);
    expect(engine.miningTarget).toEqual({ x: 9, y: 1 });
  });
});
