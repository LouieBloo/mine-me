import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMiningScene } from './useMiningScene';
import { MiningTileType, DEFAULT_PARTICLE_EFFECTS } from '@mine-me/shared';

// Mock PixiJS Application
vi.mock('pixi.js', async () => {
  const actual: any = await vi.importActual('pixi.js');
  return {
    ...actual,
    Assets: {
      load: vi.fn().mockResolvedValue({}),
    },
  };
});

describe('useMiningScene block particle configs', () => {
  const defaultSessionState: any = {
    position: { x: 22, y: 1 },
    grid: [[{ type: MiningTileType.DIRT, revealed: true, damageStage: 0 }]],
    discoveredMinerals: 0,
    chestsCollected: 0,
    torchesLeft: 5,
    laddersLeft: 10,
    flashlightBattery: 100,
    maxBattery: 100,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes default fairy_sparkle particle config for Copperium and Silverium', () => {
    const { result } = renderHook(() =>
      useMiningScene({
        app: null,
        initialSessionState: defaultSessionState,
        gearLayers: [],
        playerFacingDirRef: { current: { x: 1, y: 0 } },
        isFacingLeftRef: { current: false },
        zoom: 1.5,
      })
    );

    const copperConfig = result.current.blockParticleConfigsRef.current.get(MiningTileType.COPPERIUM);
    expect(copperConfig).toBeDefined();
    expect(copperConfig).toEqual(DEFAULT_PARTICLE_EFFECTS.fairy_sparkle);

    const silverConfig = result.current.blockParticleConfigsRef.current.get(MiningTileType.SILVERIUM);
    expect(silverConfig).toBeDefined();
    expect(silverConfig).toEqual(DEFAULT_PARTICLE_EFFECTS.fairy_sparkle);
  });
});
