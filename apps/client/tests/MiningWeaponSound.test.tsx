import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { MiningGrid } from '../src/views/MineView/components/MiningGrid/MiningGrid';
import { MiningTileType, type MiningSessionClientState, type PlayerState } from '@mine-me/shared';

const mockPlaySfx = vi.fn();

vi.mock('../src/services/sound', () => ({
  soundManager: {
    playSfx: mockPlaySfx,
    startSessionBgm: vi.fn(),
    stopBgm: vi.fn(),
    getSettings: vi.fn().mockReturnValue({ bgmEnabled: true, sfxEnabled: true, bgmVolume: 70, sfxVolume: 90 }),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
  SoundManager: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../src/contexts/SoundContext', () => ({
  useSound: () => ({
    soundManager: {
      playSfx: mockPlaySfx,
    },
    playSfx: mockPlaySfx,
  }),
}));

vi.mock('../src/components/game/PixiStageContext/PixiStageContext', () => ({
  usePixiStage: () => ({
    app: {
      canvas: document.createElement('canvas'),
      ticker: {
        add: vi.fn(),
        remove: vi.fn(),
        deltaMS: 16.67,
      },
      stage: {
        addChild: vi.fn(),
        removeChild: vi.fn(),
      },
      screen: { width: 800, height: 600 },
    },
  }),
}));

let eventListeners: Record<string, (payload: any) => void> = {};
let mockBlockSounds = new Map<number, string>();

vi.mock('../src/contexts/SocketContext', () => ({
  useSocket: () => ({
    isConnected: true,
    sendGameEvent: vi.fn(),
    onEvent: vi.fn((event: string, callback: (payload: any) => void) => {
      eventListeners[event] = callback;
      return () => {
        delete eventListeners[event];
      };
    }),
  }),
}));

vi.mock('../src/views/MineView/components/MiningGrid/hooks/useMiningScene', () => ({
  useMiningScene: () => ({
    containersReady: true,
    tileTextureLoaded: true,
    cameraRef: { current: null },
    gridContainerRef: { current: null },
    tilesContainerRef: { current: null },
    fallingRocksContainerRef: { current: null },
    droppedItemsContainerRef: { current: null },
    dynamitesContainerRef: { current: null },
    playerContainerRef: { current: null },
    reticleGraphicsRef: { current: null },
    debugGraphicsRef: { current: null },
    tileGraphicsMap: new Map(),
    tileSpritesMap: new Map(),
    blockTexturesRef: { current: new Map() },
    droppedSpritesMap: new Map(),
    fallingRockGraphicsMap: new Map(),
    dynamiteGraphicsMap: new Map(),
    dynamiteTextureRef: { current: null },
    torchGlowsRef: { current: new Map() },
    blockEmittersRef: { current: new Map() },
    particleEngineRef: { current: null },
    playerSpriteRef: { current: null },
    remotePlayerRendererRef: { current: null },
    flashlightRef: { current: null },
    lightingEngineRef: { current: null },
    blockParticleConfigsRef: { current: new Map() },
    blockSoundsRef: { current: mockBlockSounds },
  }),
}));

vi.mock('../src/views/MineView/components/MiningGrid/hooks/useMiningInput', () => ({
  useMiningInput: () => ({
    keysPressedRef: {
      current: {
        up: false,
        down: false,
        left: false,
        right: false,
        jump: false,
        miningKey: false,
        miningTarget: null,
        sequence: 0,
      },
    },
  }),
}));

vi.mock('../src/views/MineView/components/MiningGrid/hooks/useMiningTicker', () => ({
  useMiningTicker: () => {},
}));

describe('Mining Weapon Sound Effect Playback', () => {
  beforeEach(() => {
    eventListeners = {};
    mockPlaySfx.mockClear();
    mockBlockSounds = new Map();
  });

  const baseSessionState: MiningSessionClientState = {
    roomId: 'room-1',
    grid: [
      [
        { type: MiningTileType.DIRT, revealed: true, damageStage: 0 },
        { type: MiningTileType.DIRT, revealed: true, damageStage: 0 },
      ],
      [
        { type: MiningTileType.DIRT, revealed: true, damageStage: 0 },
        { type: MiningTileType.DIRT, revealed: true, damageStage: 0 },
      ],
    ],
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    visionRange: 3,
    isMining: true,
    miningTarget: { x: 1, y: 0 },
  } as any;

  const createPlayerState = (soundEffectUrl: string | null = null): PlayerState => ({
    characterId: 'char-1',
    name: 'MinerBob',
    class: 'Warrior',
    level: 1,
    position: { x: 0, y: 0 },
    attributes: {
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      combatScore: 10,
      defenseScore: 10,
      ageInDays: 5000,
      experience: 0,
    },
    inventory: {
      items: [
        {
          id: 'inv-item-1',
          equipped: true,
          quantity: 1,
          item: {
            id: 'item-pickaxe-iron',
            name: 'Iron Pickaxe',
            description: 'Mines stone easily',
            type: 'GEAR',
            subType: 'WEAPON',
            priceSol: 100,
            soundEffectUrl,
          },
        },
      ],
    },
  } as any);

  it('plays weapon sound effect when mining a block and taking damage', () => {
    const playerState = createPlayerState('/assets/sounds/items/item-pickaxe-iron_sfx.wav');

    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    // Simulate mining_state_tick where tile (1, 0) takes damage
    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 1,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: true,
        miningTarget: { x: 1, y: 0 },
        revealedTiles: [
          { x: 1, y: 0, type: MiningTileType.DIRT, damageStage: 1 },
        ],
      });
    });

    expect(mockPlaySfx).toHaveBeenCalledTimes(1);
    expect(mockPlaySfx).toHaveBeenCalledWith('/assets/sounds/items/item-pickaxe-iron_sfx.wav');
  });

  it('plays weapon sound effect when mining a block and destroying it', () => {
    const playerState = createPlayerState('/assets/sounds/items/item-pickaxe-iron_sfx.wav');

    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    // Simulate mining_state_tick where tile (1, 0) breaks completely
    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 2,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: true,
        miningTarget: { x: 1, y: 0 },
        revealedTiles: [
          { x: 1, y: 0, type: MiningTileType.EMPTY, damageStage: 0 },
        ],
      });
    });

    expect(mockPlaySfx).toHaveBeenCalledTimes(1);
    expect(mockPlaySfx).toHaveBeenCalledWith('/assets/sounds/items/item-pickaxe-iron_sfx.wav');
  });

  it('does not play sound effect when weapon has no soundEffectUrl', () => {
    const playerState = createPlayerState(null);

    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 3,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: true,
        miningTarget: { x: 1, y: 0 },
        revealedTiles: [
          { x: 1, y: 0, type: MiningTileType.DIRT, damageStage: 1 },
        ],
      });
    });

    expect(mockPlaySfx).not.toHaveBeenCalled();
  });

  it('plays block damage sound effect when block is damaged and has soundEffectUrl', () => {
    mockBlockSounds.set(MiningTileType.DIRT, '/assets/sounds/blocks/dirt_sfx.wav');
    const playerState = createPlayerState(null); // No weapon sound

    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 4,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: true,
        miningTarget: { x: 1, y: 0 },
        revealedTiles: [
          { x: 1, y: 0, type: MiningTileType.DIRT, damageStage: 1 },
        ],
      });
    });

    expect(mockPlaySfx).toHaveBeenCalledWith('/assets/sounds/blocks/dirt_sfx.wav');
  });

  it('plays block damage sound effect when block is destroyed', () => {
    mockBlockSounds.set(MiningTileType.DIRT, '/assets/sounds/blocks/dirt_sfx.wav');
    const playerState = createPlayerState(null);

    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 5,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: true,
        miningTarget: { x: 1, y: 0 },
        revealedTiles: [
          { x: 1, y: 0, type: MiningTileType.EMPTY, damageStage: 0 },
        ],
      });
    });

    expect(mockPlaySfx).toHaveBeenCalledWith('/assets/sounds/blocks/dirt_sfx.wav');
  });

  it('does NOT play block destroyed sound when revealing a previously unrevealed tile (falling into caverns)', () => {
    mockBlockSounds.set(MiningTileType.DIRT, '/assets/sounds/blocks/dirt_sfx.wav');
    const playerState = createPlayerState(null);

    const sessionWithHiddenTile: MiningSessionClientState = {
      ...baseSessionState,
      grid: [
        [
          { type: MiningTileType.DIRT, revealed: false, damageStage: 0 },
          { type: MiningTileType.DIRT, revealed: false, damageStage: 0 },
        ],
        [
          { type: MiningTileType.DIRT, revealed: false, damageStage: 0 },
          { type: MiningTileType.DIRT, revealed: false, damageStage: 0 },
        ],
      ],
    };

    render(
      <MiningGrid
        sessionState={sessionWithHiddenTile}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    // Simulate falling into an unrevealed cavern where (1, 0) becomes EMPTY
    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 6,
        position: { x: 0, y: 1 },
        velocity: { x: 0, y: 5 },
        isMining: false,
        revealedTiles: [
          { x: 1, y: 0, type: MiningTileType.EMPTY, damageStage: 0 },
        ],
      });
    });

    expect(mockPlaySfx).not.toHaveBeenCalled();
  });

  it('does NOT play block sounds when tiles are destroyed by a dynamite explosion', () => {
    mockBlockSounds.set(MiningTileType.DIRT, '/assets/sounds/blocks/dirt_sfx.wav');
    const playerState = createPlayerState(null);

    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    // Simulate dynamite explosion at (1, 0) destroying tile (1, 0)
    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 7,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        explosions: [
          { id: 'dyn-exp-1', position: { x: 1, y: 0 }, radius: 2 },
        ],
        revealedTiles: [
          { x: 1, y: 0, type: MiningTileType.EMPTY, damageStage: 0 },
        ],
      });
    });

    // Verifies block destroy sound is suppressed, while the dynamite explosion sound plays
    expect(mockPlaySfx).not.toHaveBeenCalledWith('/assets/sounds/blocks/dirt_sfx.wav');
    expect(mockPlaySfx).toHaveBeenCalledWith(
      '/assets/sounds/items/cmtz702uk0001nu7bn2tidnx0_explosion_sfx.mp3',
      expect.objectContaining({ throttleMs: 50 })
    );
  });

  it('does NOT play weapon sound if player is not actively mining that tile', () => {
    const playerState = createPlayerState('/assets/sounds/items/item-pickaxe-iron_sfx.wav');

    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    // Tile takes damage but player is NOT mining or targeting a different tile
    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 8,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        miningTarget: null,
        revealedTiles: [
          { x: 1, y: 0, type: MiningTileType.DIRT, damageStage: 1 },
        ],
      });
    });

    expect(mockPlaySfx).not.toHaveBeenCalled();
  });
});
