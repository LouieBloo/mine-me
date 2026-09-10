import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';

describe('MiningGameEngine - Multiplayer & Cooperative Mining', () => {
  let mockSocket1: any;
  let mockSocket2: any;

  beforeEach(() => {
    mockSocket1 = {
      connected: true,
      emit: vi.fn(),
    };
    mockSocket2 = {
      connected: true,
      emit: vi.fn(),
    };
  });

  it('allows multiple players to join a shared room and broadcasts otherPlayers in 30Hz tick', () => {
    const engine = new MiningGameEngine({
      roomId: 'test_multiplayer_room',
      gameMode: 'multiplayer',
      cityId: 'city-1',
      seed: 12345,
    });

    // Add Player 1
    engine.addPlayer({
      characterId: 'char-1',
      characterName: 'Miner Alice',
      socket: mockSocket1,
      miningSpeed: 100,
      gearLayers: [{ url: '/gear/hat.png', subType: 'HEAD' }],
    });

    // Add Player 2
    engine.addPlayer({
      characterId: 'char-2',
      characterName: 'Miner Bob',
      socket: mockSocket2,
      miningSpeed: 120,
    });

    expect(engine.playerCount).toBe(2);

    // Simulate 1 tick
    (engine as any).tick(0.033);

    // Player 1 should receive Player 2 in otherPlayers
    expect(mockSocket1.emit).toHaveBeenCalledWith(
      'mining_state_tick',
      expect.objectContaining({
        otherPlayers: expect.arrayContaining([
          expect.objectContaining({
            characterId: 'char-2',
            characterName: 'Miner Bob',
          }),
        ]),
      }),
    );

    // Player 2 should receive Player 1 in otherPlayers with gearLayers
    expect(mockSocket2.emit).toHaveBeenCalledWith(
      'mining_state_tick',
      expect.objectContaining({
        otherPlayers: expect.arrayContaining([
          expect.objectContaining({
            characterId: 'char-1',
            characterName: 'Miner Alice',
            gearLayers: expect.arrayContaining([
              expect.objectContaining({ url: '/gear/hat.png', subType: 'HEAD' }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('allows independent movement for each player without player-to-player collision trapping', () => {
    const engine = new MiningGameEngine({
      roomId: 'test_multiplayer_room',
      gameMode: 'multiplayer',
      cityId: 'city-1',
      seed: 12345,
    });

    const p1 = engine.addPlayer({
      characterId: 'char-1',
      socket: mockSocket1,
      miningSpeed: 100,
    });

    const p2 = engine.addPlayer({
      characterId: 'char-2',
      socket: mockSocket2,
      miningSpeed: 100,
    });

    // Move Player 1 to the right, Player 2 stays still
    engine.handleInput('char-1', {
      up: false,
      down: false,
      left: false,
      right: true,
      miningKey: false,
      sequence: 1,
    });

    (engine as any).tick(0.05);

    expect(p1.playerBody.position.x).toBeGreaterThan(MINING_CONFIG.ENTRANCE_X);
    expect(p2.playerBody.position.x).toBe(MINING_CONFIG.ENTRANCE_X);
    expect(p1.isFacingLeft).toBe(false);
  });

  it('combines mining speeds when both players mine the same target block (cooperative mining)', () => {
    const engine = new MiningGameEngine({
      roomId: 'test_multiplayer_room',
      gameMode: 'multiplayer',
      cityId: 'city-1',
      seed: 12345,
    });

    const p1 = engine.addPlayer({
      characterId: 'char-1',
      socket: mockSocket1,
      miningSpeed: 100, // 100% speed
    });

    const p2 = engine.addPlayer({
      characterId: 'char-2',
      socket: mockSocket2,
      miningSpeed: 100, // 100% speed
    });

    p1.playerBody.isGrounded = true;
    p2.playerBody.isGrounded = true;

    // Set adjacent tile to DIRT (normally 500ms to mine)
    const target = { x: MINING_CONFIG.ENTRANCE_X + 1, y: 0 };
    engine.grid[0][target.x] = { type: MiningTileType.DIRT, revealed: true };

    engine.handleInput('char-1', {
      up: false,
      down: false,
      left: false,
      right: false,
      miningKey: true,
      miningTarget: target,
      sequence: 1,
    });

    engine.handleInput('char-2', {
      up: false,
      down: false,
      left: false,
      right: false,
      miningKey: true,
      miningTarget: target,
      sequence: 1,
    });

    // Both players start mining target
    const started1 = engine.startMining(target, 'char-1');
    const started2 = engine.startMining(target, 'char-2');
    expect(started1).toBe(true);
    expect(started2).toBe(true);

    // Run tick for 150ms (0.150s).
    // With combined speed 200 (2.0x multiplier), progress should be 0.150 * 1000 * 2.0 = 300ms!
    (engine as any).tick(0.15);

    const tile = engine.grid[0][target.x];
    expect(tile.damageMs).toBeCloseTo(300, 1);

    expect(p1.miningProgressMs).toBeCloseTo(300, 1);
    expect(p2.miningProgressMs).toBeCloseTo(300, 1);

    // Another 150ms tick: total damage = 600ms >= 500ms required, block should break!
    (engine as any).tick(0.15);

    expect(engine.grid[0][target.x].type).toBe(MiningTileType.EMPTY);
    expect(p1?.isMining).toBe(false);
    expect(p2?.isMining).toBe(false);
  });

  it('handles item pickups separately into the collecting player temporary backpack', () => {
    const engine = new MiningGameEngine({
      roomId: 'test_multiplayer_room',
      gameMode: 'multiplayer',
      cityId: 'city-1',
      seed: 12345,
    });

    const p1 = engine.addPlayer({
      characterId: 'char-1',
      socket: mockSocket1,
    });

    const p2 = engine.addPlayer({
      characterId: 'char-2',
      socket: mockSocket2,
    });

    // Drop an item near player 1
    engine.droppedItems.push({
      position: { x: MINING_CONFIG.ENTRANCE_X, y: MINING_CONFIG.ENTRANCE_Y },
      itemId: 'gold_coin',
      itemName: 'Gold Coins',
      iconUrl: null,
      quantity: 25,
    });

    // Run tick - player 1 is at entrance and picks it up
    (engine as any).tick(0.033);

    expect(p1.temporaryBackpack).toHaveLength(1);
    expect(p1.temporaryBackpack[0].quantity).toBe(25);
    // Player 2 should not have received the item
    expect(p2.temporaryBackpack).toHaveLength(0);
    // Ground item is gone
    expect(engine.droppedItems).toHaveLength(0);
  });

  it('removes player cleanly on disconnect/leave and invokes onRoomEmpty when empty', () => {
    const onRoomEmpty = vi.fn();
    const engine = new MiningGameEngine({
      roomId: 'test_multiplayer_room',
      gameMode: 'multiplayer',
      cityId: 'city-1',
      seed: 12345,
      onRoomEmpty,
    });

    engine.addPlayer({
      characterId: 'char-1',
      socket: mockSocket1,
    });

    engine.addPlayer({
      characterId: 'char-2',
      socket: mockSocket2,
    });

    expect(engine.playerCount).toBe(2);

    // Remove player 1
    const result1 = engine.removePlayer('char-1');
    expect(result1).not.toBeNull();
    expect(engine.playerCount).toBe(1);
    expect(onRoomEmpty).not.toHaveBeenCalled();

    // Next tick should not send player 1 to player 2
    (engine as any).tick(0.033);
    expect(mockSocket2.emit).toHaveBeenLastCalledWith(
      'mining_state_tick',
      expect.objectContaining({
        otherPlayers: undefined,
      }),
    );

    // Remove player 2
    engine.removePlayer('char-2');
    expect(engine.playerCount).toBe(0);
    expect(onRoomEmpty).toHaveBeenCalledWith('test_multiplayer_room');
  });

  it('synchronizes mouse aim direction, character facing, and flashlight state across players', () => {
    const engine = new MiningGameEngine({
      roomId: 'test_multiplayer_aim_room',
      gameMode: 'multiplayer',
      cityId: 'city-1',
      seed: 12345,
    });

    engine.addPlayer({
      characterId: 'char-1',
      socket: mockSocket1,
    });

    engine.addPlayer({
      characterId: 'char-2',
      socket: mockSocket2,
    });

    // Player 1 aims to the top-left with flashlight ON
    engine.handleInput('char-1', {
      up: false,
      down: false,
      left: false,
      right: false,
      miningKey: false,
      aimDirection: { x: -0.707, y: -0.707 },
      isFacingLeft: true,
      flashlightOn: true,
      sequence: 1,
    });

    // Player 2 aims to the right with flashlight OFF
    engine.handleInput('char-2', {
      up: false,
      down: false,
      left: false,
      right: false,
      miningKey: false,
      aimDirection: { x: 1, y: 0 },
      isFacingLeft: false,
      flashlightOn: false,
      sequence: 1,
    });

    // Run 1 tick
    (engine as any).tick(0.033);

    // Player 2 should see Player 1's aim, facing left, and flashlight ON
    expect(mockSocket2.emit).toHaveBeenCalledWith(
      'mining_state_tick',
      expect.objectContaining({
        otherPlayers: expect.arrayContaining([
          expect.objectContaining({
            characterId: 'char-1',
            isFacingLeft: true,
            aimDirection: { x: -0.707, y: -0.707 },
            flashlightOn: true,
          }),
        ]),
      }),
    );

    // Player 1 should see Player 2's aim, facing right, and flashlight OFF
    expect(mockSocket1.emit).toHaveBeenCalledWith(
      'mining_state_tick',
      expect.objectContaining({
        otherPlayers: expect.arrayContaining([
          expect.objectContaining({
            characterId: 'char-2',
            isFacingLeft: false,
            aimDirection: { x: 1, y: 0 },
            flashlightOn: false,
          }),
        ]),
      }),
    );
  });
});
