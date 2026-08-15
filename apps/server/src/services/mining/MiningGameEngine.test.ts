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
    engine.playerBody.position = { x: MINING_CONFIG.ENTRANCE_X + 0.5, y: MINING_CONFIG.ENTRANCE_Y + 0.5 };

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
    engine.playerBody.position = { x: MINING_CONFIG.ENTRANCE_X + 0.5, y: MINING_CONFIG.ENTRANCE_Y + 0.5 };

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
});
