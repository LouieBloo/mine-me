import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MiningGrid } from '../src/views/MineView/components/MiningGrid/MiningGrid';
import {
  MiningTileType,
  type MiningSessionClientState,
  type PlayerState,
  type GameItem,
} from '@mine-me/shared';

const mockPlaySfx = vi.fn();
const mockPlayLoopingSfx = vi.fn();
const mockStopLoopingSfx = vi.fn();
const mockStopAllLoopingSfx = vi.fn();
const mockIsLoopingSfxPlaying = vi.fn();

vi.mock('../src/contexts/SoundContext', () => ({
  useSound: () => ({
    soundManager: {
      playSfx: mockPlaySfx,
      playLoopingSfx: mockPlayLoopingSfx,
      stopLoopingSfx: mockStopLoopingSfx,
      stopAllLoopingSfx: mockStopAllLoopingSfx,
      isLoopingSfxPlaying: mockIsLoopingSfxPlaying,
      getSettings: () => ({ bgmVolume: 0.7, sfxVolume: 0.9, bgmEnabled: true, sfxEnabled: true }),
    },
    settings: { bgmVolume: 0.7, sfxVolume: 0.9, bgmEnabled: true, sfxEnabled: true },
    setBgmVolume: vi.fn(),
    setSfxVolume: vi.fn(),
    toggleBgm: vi.fn(),
    toggleSfx: vi.fn(),
  }),
}));

const eventListeners: Record<string, Function> = {};
const mockSendGameEvent = vi.fn().mockResolvedValue({ success: true });

vi.mock('../src/contexts/SocketContext', () => ({
  useSocket: () => ({
    onEvent: vi.fn((event: string, callback: Function) => {
      eventListeners[event] = callback;
      return () => {
        delete eventListeners[event];
      };
    }),
    sendGameEvent: mockSendGameEvent,
    connected: true,
  }),
}));

vi.mock('../src/components/game/PixiStageContext/PixiStageContext', () => ({
  usePixiStage: () => ({
    app: {
      renderer: {
        render: vi.fn(),
      },
      stage: {
        addChild: vi.fn(),
        removeChild: vi.fn(),
      },
    },
    isReady: true,
  }),
}));

vi.mock('../src/views/MineView/components/MiningGrid/hooks/useMiningScene', () => ({
  useMiningScene: () => ({
    containersReady: true,
    tileTextureLoaded: 1,
    cameraRef: { current: null },
    gridContainerRef: { current: null },
    tilesContainerRef: { current: null },
    fallingRocksContainerRef: { current: null },
    droppedItemsContainerRef: { current: null },
    dynamitesContainerRef: { current: null },
    playerContainerRef: { current: null },
    reticleGraphicsRef: { current: null },
    debugGraphicsRef: { current: null },
    tileGraphicsMap: { current: new Map() },
    tileSpritesMap: { current: new Map() },
    blockTexturesRef: { current: new Map() },
    droppedSpritesMap: { current: new Map() },
    fallingRockGraphicsMap: { current: new Map() },
    dynamiteGraphicsMap: { current: new Map() },
    dynamiteTextureRef: { current: null },
    playerSpriteRef: { current: null },
    remotePlayerRendererRef: { current: null },
    lightingEngineRef: { current: null },
    flashlightRef: { current: null },
    particleEngineRef: { current: null },
    blockSoundsRef: { current: new Map() },
    torchEmittersRef: { current: new Map() },
    blockEmittersRef: { current: new Map() },
  }),
}));

vi.mock('../src/views/MineView/components/MiningGrid/hooks/useMiningTicker', () => ({
  useMiningTicker: vi.fn(),
}));

const baseSessionState: MiningSessionClientState = {
  grid: Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => ({
      x,
      y,
      type: MiningTileType.DIRT,
      damageStage: 0,
      revealed: true,
    }))
  ),
  position: { x: 0, y: 0 },
  canExtract: false,
} as any;

const dynamiteItem: GameItem = {
  id: 'dyn-item-1',
  name: 'Dynamite',
  description: 'Go boom',
  type: 'CONSUMABLE',
  subType: 'DYNAMITE',
  priceSol: 10,
  throwable: true,
  soundEffects: {
    throw: { url: '/assets/sounds/items/dynamite_throw_sfx.mp3', loop: false },
    inGameEffect: { url: '/assets/sounds/items/dynamite_fuse_sfx.mp3', loop: true },
    explosion: { url: '/assets/sounds/items/dynamite_explosion_sfx.mp3', loop: false },
  },
};

const playerState: PlayerState = {
  character: {
    id: 'char-1',
    name: 'Miner',
    familyId: 'fam-1',
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    moneySol: 50,
  },
  inventory: {
    slots: 10,
    items: [
      {
        id: 'inv-1',
        item: dynamiteItem,
        quantity: 5,
        equipped: false,
      },
    ],
  },
} as any;

describe('MiningDynamiteSound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(eventListeners)) {
      delete eventListeners[key];
    }
  });

  it('plays explosion sound when mining tick receives explosion events', () => {
    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 1,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        explosions: [
          {
            id: 'dyn-exp-123',
            position: { x: 3, y: 3 },
            radius: 5,
            soundUrl: '/assets/sounds/items/dynamite_explosion_sfx.mp3',
          },
        ],
      });
    });

    expect(mockPlaySfx).toHaveBeenCalledWith(
      '/assets/sounds/items/dynamite_explosion_sfx.mp3',
      expect.objectContaining({ throttleMs: 50 })
    );
  });

  it('falls back to default dynamite explosion sound if soundUrl not specified in event', () => {
    render(
      <MiningGrid
        sessionState={baseSessionState}
        playerState={playerState}
        onExit={vi.fn()}
      />
    );

    act(() => {
      eventListeners['mining_state_tick']?.({
        tick: 2,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        explosions: [
          {
            id: 'dyn-exp-fallback',
            position: { x: 2, y: 2 },
            radius: 4,
          },
        ],
      });
    });

    expect(mockPlaySfx).toHaveBeenCalledWith(
      '/assets/sounds/items/cmtz702uk0001nu7bn2tidnx0_explosion_sfx.mp3',
      expect.objectContaining({ throttleMs: 50 })
    );
  });
});
