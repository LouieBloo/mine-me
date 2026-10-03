import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectileVisualManager } from './ProjectileVisualManager';

describe('ProjectileVisualManager', () => {
  let manager: ProjectileVisualManager;
  let mockParticleEngine: any;
  let mockLightingEngine: any;
  let mockSoundManager: any;

  beforeEach(() => {
    manager = new ProjectileVisualManager();
    mockParticleEngine = {
      spawnBurst: vi.fn(),
    };
    mockLightingEngine = {
      addLight: vi.fn(),
      removeLight: vi.fn(),
    };
    mockSoundManager = {
      playSfx: vi.fn(),
      playPositionalSfx: vi.fn(),
    };
  });

  it('triggers immediate local shot audiovisual feedback', () => {
    manager.triggerLocalShot(
      { x: 12, y: 8 },
      0.5,
      '/assets/sounds/items/revolver_shot.wav',
      mockParticleEngine,
      mockLightingEngine,
      mockSoundManager
    );

    // Audio check
    expect(mockSoundManager.playPositionalSfx).toHaveBeenCalledWith(
      '/assets/sounds/items/revolver_shot.wav',
      { x: 12, y: 8 }
    );

    // Particle check (muzzle flash & smoke)
    expect(mockParticleEngine.spawnBurst).toHaveBeenCalledTimes(2);
    expect(mockParticleEngine.spawnBurst).toHaveBeenCalledWith(
      expect.anything(),
      { x: 576, y: 384 }
    );

    // Light check
    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
    const addedLight = mockLightingEngine.addLight.mock.calls[0][0];
    expect(addedLight.position.x).toBe(12);
    expect(addedLight.position.y).toBe(8);
  });

  it('handles remote player gunshot events from server ticks', () => {
    manager.handleGunshotEvents(
      [
        {
          id: 'gunshot_1',
          characterId: 'remote-char-99',
          weaponItemId: 'cmn_revolver_6shooter',
          position: { x: 25, y: 15 },
          muzzlePosition: { x: 25, y: 15 },
          angle: 1.2,
          soundUrl: '/assets/sounds/items/revolver_shot.wav',
        },
      ],
      'local-char-1',
      mockParticleEngine,
      mockLightingEngine,
      mockSoundManager
    );

    expect(mockSoundManager.playPositionalSfx).toHaveBeenCalled();
    expect(mockParticleEngine.spawnBurst).toHaveBeenCalledTimes(2);
    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
  });

  it('decays and cleans up muzzle flash light over time', () => {
    manager.triggerLocalShot(
      { x: 10, y: 10 },
      0,
      '/shot.wav',
      null,
      mockLightingEngine,
      null
    );

    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);

    // Advance 0.08s (halfway through 0.16s duration)
    manager.update(0.08, mockLightingEngine);
    expect(mockLightingEngine.removeLight).not.toHaveBeenCalled();

    // Advance another 0.10s (total 0.18s > 0.16s duration)
    manager.update(0.1, mockLightingEngine);
    expect(mockLightingEngine.removeLight).toHaveBeenCalledTimes(1);
  });

  it('adds and decays impact flash light at collision coordinate', () => {
    manager.addImpactFlashLight({ x: 18, y: 22 }, mockLightingEngine);

    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
    const light = mockLightingEngine.addLight.mock.calls[0][0];
    expect(light.position.x).toBe(18);
    expect(light.position.y).toBe(22);

    manager.update(0.1, mockLightingEngine);
    expect(mockLightingEngine.removeLight).toHaveBeenCalledTimes(1);
  });

  it('does not play sound when soundUrl is null or undefined (no hardcoded fallback)', () => {
    manager.triggerLocalShot(
      { x: 10, y: 10 },
      0,
      null,
      mockParticleEngine,
      mockLightingEngine,
      mockSoundManager
    );

    expect(mockSoundManager.playPositionalSfx).not.toHaveBeenCalled();
    expect(mockSoundManager.playSfx).not.toHaveBeenCalled();
  });
});
