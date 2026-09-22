import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamiteVisualManager } from './DynamiteVisualManager';
import type { MiningActiveDynamite, MiningExplosionEvent } from '@mine-me/shared';
import { DEFAULT_PARTICLE_EFFECTS } from '@mine-me/shared';

describe('DynamiteVisualManager', () => {
  let manager: DynamiteVisualManager;
  let mockParticleEngine: any;
  let mockLightingEngine: any;
  let mockEmitterSparks: any;
  let mockEmitterFlames: any;

  beforeEach(() => {
    manager = new DynamiteVisualManager();

    mockEmitterSparks = {
      setPosition: vi.fn(),
      destroy: vi.fn(),
    };
    mockEmitterFlames = {
      setPosition: vi.fn(),
      destroy: vi.fn(),
    };

    let emitterCallCount = 0;
    mockParticleEngine = {
      addEmitter: vi.fn().mockImplementation((_config: any) => {
        emitterCallCount++;
        return emitterCallCount % 2 === 1 ? mockEmitterSparks : mockEmitterFlames;
      }),
      spawnBurst: vi.fn(),
    };

    const lightsMap = new Map<string, any>();
    mockLightingEngine = {
      lights: lightsMap,
      getLight: vi.fn((id: string) => lightsMap.get(id)),
      addLight: vi.fn((light: any) => {
        lightsMap.set(light.id, light);
      }),
      removeLight: vi.fn((id: string) => {
        lightsMap.delete(id);
      }),
      markLightmapDirty: vi.fn(),
    };
  });

  describe('calculateFuseWorldPosition', () => {
    it('calculates middle-right fuse position at 0 angle', () => {
      const dyn: MiningActiveDynamite = {
        id: 'dyn-1',
        position: { x: 5, y: 10 },
        velocity: { x: 0, y: 0 },
        angle: 0,
        fuseRemainingSeconds: 3.5,
      };

      const result = DynamiteVisualManager.calculateFuseWorldPosition(dyn, 64);
      // Sprite is 32px wide (0.5 * 64), fuse is at localX = 32 * 0.44 = 14.08px
      expect(result.pixel.x).toBeCloseTo(5 * 64 + 14.08, 1);
      expect(result.pixel.y).toBeCloseTo(10 * 64, 1);
      expect(result.tile.x).toBeCloseTo(5 + 14.08 / 64, 2);
      expect(result.tile.y).toBeCloseTo(10, 2);
    });

    it('rotates fuse position with dynamite angle (90 degrees)', () => {
      const dyn: MiningActiveDynamite = {
        id: 'dyn-1',
        position: { x: 5, y: 10 },
        velocity: { x: 0, y: 0 },
        angle: Math.PI / 2, // 90 deg clockwise -> local X (+14px) points down into Y (+14px)
        fuseRemainingSeconds: 3.5,
      };

      const result = DynamiteVisualManager.calculateFuseWorldPosition(dyn, 64);
      expect(result.pixel.x).toBeCloseTo(5 * 64, 1);
      expect(result.pixel.y).toBeCloseTo(10 * 64 + 14.08, 1);
    });
  });

  describe('update', () => {
    it('creates fuse spark and flame emitters and dynamic PointLight for active dynamite', () => {
      const dyn: MiningActiveDynamite = {
        id: 'dyn-1',
        position: { x: 8, y: 6 },
        velocity: { x: 0, y: 0 },
        angle: 0,
        fuseRemainingSeconds: 3.0,
      };

      manager.update([dyn], 0.016, mockParticleEngine, mockLightingEngine, 64);

      // Should add sparks and flames emitters
      expect(mockParticleEngine.addEmitter).toHaveBeenCalledTimes(2);
      expect(mockParticleEngine.addEmitter).toHaveBeenCalledWith(
        DEFAULT_PARTICLE_EFFECTS.dynamite_fuse_sparks,
        expect.anything(),
        { stagger: false }
      );
      expect(mockParticleEngine.addEmitter).toHaveBeenCalledWith(
        DEFAULT_PARTICLE_EFFECTS.dynamite_fuse_flames,
        expect.anything(),
        { stagger: false }
      );

      // Should add dynamic PointLight for burning fuse
      expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
      const addedLight = mockLightingEngine.addLight.mock.calls[0][0];
      expect(addedLight.id).toBe('dynamite_fuse_dyn-1');
      expect(addedLight.currentIntensity).toBe(0.75);
      expect(addedLight.radius).toBe(2.2);
      expect(addedLight.flicker).toBeDefined();
    });

    it('updates position of existing emitters and light when dynamite moves', () => {
      const dyn1: MiningActiveDynamite = {
        id: 'dyn-1',
        position: { x: 8, y: 6 },
        velocity: { x: 1, y: 1 },
        angle: 0,
        fuseRemainingSeconds: 3.0,
      };

      manager.update([dyn1], 0.016, mockParticleEngine, mockLightingEngine, 64);

      // Move dynamite
      const dyn2: MiningActiveDynamite = {
        ...dyn1,
        position: { x: 9, y: 7 },
        angle: 0.5,
      };

      manager.update([dyn2], 0.016, mockParticleEngine, mockLightingEngine, 64);

      // Emitters setPosition called with new coordinates
      expect(mockEmitterSparks.setPosition).toHaveBeenCalled();
      expect(mockEmitterFlames.setPosition).toHaveBeenCalled();

      // Light marked dirty
      expect(mockLightingEngine.markLightmapDirty).toHaveBeenCalled();
    });

    it('cleans up emitters and removes light when dynamite disappears/explodes', () => {
      const dyn: MiningActiveDynamite = {
        id: 'dyn-1',
        position: { x: 8, y: 6 },
        velocity: { x: 0, y: 0 },
        angle: 0,
        fuseRemainingSeconds: 0.1,
      };

      manager.update([dyn], 0.016, mockParticleEngine, mockLightingEngine, 64);
      expect(mockLightingEngine.addLight).toHaveBeenCalledWith(expect.objectContaining({ id: 'dynamite_fuse_dyn-1' }));

      // Frame 2: dynamite is gone
      manager.update([], 0.016, mockParticleEngine, mockLightingEngine, 64);

      expect(mockEmitterSparks.destroy).toHaveBeenCalled();
      expect(mockEmitterFlames.destroy).toHaveBeenCalled();
      expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('dynamite_fuse_dyn-1');
    });
  });

  describe('triggerExplosion', () => {
    it('spawns smoke cloud scaled to explosion radius and momentary flash light', () => {
      const pos = { x: 12, y: 15 };
      const radius = 5;

      manager.triggerExplosion(pos, radius, mockParticleEngine, mockLightingEngine, 64, 'exp-1');

      const smokeCall = mockParticleEngine.spawnBurst.mock.calls.find(
        (call: any[]) => call[0].shape === 'smoke'
      );
      expect(smokeCall).toBeDefined();
      expect(smokeCall[0].shape).toBe('smoke');
      expect(smokeCall[0].burstCount).toBeGreaterThanOrEqual(30);
      expect(smokeCall[0].spawnRadius).toBeGreaterThan(100);
      expect(smokeCall[1]).toEqual({ x: 12 * 64, y: 15 * 64 });

      // Flash burst spawned
      expect(mockParticleEngine.spawnBurst).toHaveBeenCalledWith(
        DEFAULT_PARTICLE_EFFECTS.dynamite_explosion_flash,
        { x: 12 * 64, y: 15 * 64 }
      );

      // Explosion flash light added
      expect(mockLightingEngine.addLight).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'exp_flash_exp-1',
          baseIntensity: 2.4,
        })
      );
      const flashCall = mockLightingEngine.addLight.mock.calls.find(
        (c: any[]) => c[0].id === 'exp_flash_exp-1'
      );
      expect(flashCall[0].radius).toBeGreaterThanOrEqual(5);
    });

    it('fades out and removes explosion flash light over time', () => {
      const pos = { x: 12, y: 15 };
      manager.triggerExplosion(pos, 5, mockParticleEngine, mockLightingEngine, 64, 'exp-1');

      // Step forward 0.1s: flash still active
      manager.update([], 0.1, mockParticleEngine, mockLightingEngine, 64);
      expect(mockLightingEngine.removeLight).not.toHaveBeenCalledWith('exp_flash_exp-1');

      // Step forward past duration (total 0.4s > 0.35s): flash removed
      manager.update([], 0.3, mockParticleEngine, mockLightingEngine, 64);
      expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('exp_flash_exp-1');
    });
  });

  describe('handleExplosionEvents', () => {
    it('triggers explosions for all received events', () => {
      const events: MiningExplosionEvent[] = [
        { id: 'exp-1', position: { x: 10, y: 10 }, radius: 7 },
        { id: 'exp-2', position: { x: 20, y: 20 }, radius: 3 },
      ];

      manager.handleExplosionEvents(events, mockParticleEngine, mockLightingEngine, 64);

      expect(mockParticleEngine.spawnBurst).toHaveBeenCalledTimes(4); // 2 bursts (smoke + flash) per explosion
      expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(2);
    });
  });

  describe('destroy', () => {
    it('cleans up all active emitters and lights', () => {
      const dyn: MiningActiveDynamite = {
        id: 'dyn-1',
        position: { x: 5, y: 5 },
        velocity: { x: 0, y: 0 },
        angle: 0,
        fuseRemainingSeconds: 2.0,
      };

      manager.update([dyn], 0.016, mockParticleEngine, mockLightingEngine, 64);
      manager.destroy(mockParticleEngine, mockLightingEngine);

      expect(mockEmitterSparks.destroy).toHaveBeenCalled();
      expect(mockEmitterFlames.destroy).toHaveBeenCalled();
      expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('dynamite_fuse_dyn-1');
    });
  });

  describe('dynamic particle effects', () => {
    it('resolves custom configs registered via setCustomParticleEffects', () => {
      const customConfig: any = {
        emitterType: 'continuous',
        rate: 99,
        lifetime: { min: 1, max: 2 },
        speed: { min: 10, max: 20 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0 },
        color: { start: '#00ff00', end: '#0000ff' },
        alpha: { start: 1, end: 0 },
      };

      DynamiteVisualManager.setCustomParticleEffects([
        { id: 'pe_dynamite_fuse_sparks', name: 'Dynamite Fuse Sparks', config: customConfig },
      ]);

      const resolved = DynamiteVisualManager.getEffectConfig('dynamite_fuse_sparks');
      expect(resolved.rate).toBe(99);
      expect(resolved.color.start).toBe('#00ff00');
    });

    it('uses custom effect IDs from physicsConfig when present', () => {
      const customFlames: any = {
        emitterType: 'continuous',
        rate: 88,
        lifetime: { min: 0.5, max: 1 },
        speed: { min: 5, max: 10 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0 },
        color: { start: '#ff00ff', end: '#00ffff' },
        alpha: { start: 1, end: 0 },
      };

      DynamiteVisualManager.setCustomParticleEffects([
        { id: 'custom_flames_id', config: customFlames },
      ]);

      const dyn: MiningActiveDynamite = {
        id: 'dyn-custom',
        position: { x: 5, y: 5 },
        velocity: { x: 0, y: 0 },
        fuseRemainingSeconds: 4,
        physicsConfig: {
          hasPhysics: true,
          colliderType: 'RECTANGLE',
          fuseFlamesEffectId: 'custom_flames_id',
        },
      };

      manager.update([dyn], 0.016, mockParticleEngine, mockLightingEngine, 64);

      expect(mockParticleEngine.addEmitter).toHaveBeenCalledWith(
        expect.objectContaining({ rate: 88 }),
        expect.anything(),
        expect.anything()
      );
    });
  });
});
