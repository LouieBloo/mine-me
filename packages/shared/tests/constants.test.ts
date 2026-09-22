import { describe, it, expect } from 'vitest';
import { DEFAULT_PARTICLE_EFFECTS } from '../src/constants';

describe('DEFAULT_PARTICLE_EFFECTS dynamite presets', () => {
  it('defines dynamite_fuse_sparks as a continuous spark emitter', () => {
    const config = DEFAULT_PARTICLE_EFFECTS.dynamite_fuse_sparks;
    expect(config).toBeDefined();
    expect(config.emitterType).toBe('continuous');
    expect(config.shape).toBe('spark');
    expect(config.rate).toBeGreaterThan(0);
    expect(config.lifetime.max).toBeLessThan(1.0);
    expect(config.blendMode).toBe('add');
  });

  it('defines dynamite_fuse_flames as a continuous flame emitter with warmth', () => {
    const config = DEFAULT_PARTICLE_EFFECTS.dynamite_fuse_flames;
    expect(config).toBeDefined();
    expect(config.emitterType).toBe('continuous');
    expect(config.shape).toBe('flame');
    expect(config.rate).toBeGreaterThan(0);
    expect(config.gravity?.y).toBeLessThan(0); // upward drift
  });

  it('defines dynamite_explosion_smoke as a burst smoke emitter with couple-second lifetime', () => {
    const config = DEFAULT_PARTICLE_EFFECTS.dynamite_explosion_smoke;
    expect(config).toBeDefined();
    expect(config.emitterType).toBe('burst');
    expect(config.shape).toBe('smoke');
    expect(config.burstCount).toBeGreaterThanOrEqual(30);
    expect(config.lifetime.min).toBeGreaterThanOrEqual(1.5);
    expect(config.lifetime.max).toBeLessThanOrEqual(3.5);
    expect(config.scale.end).toBeGreaterThan(config.scale.start); // expanding smoke puff
    expect(config.alpha.end).toBe(0.0); // fades away completely
  });

  it('defines dynamite_explosion_flash as a burst flash emitter', () => {
    const config = DEFAULT_PARTICLE_EFFECTS.dynamite_explosion_flash;
    expect(config).toBeDefined();
    expect(config.emitterType).toBe('burst');
    expect(config.shape).toBe('spark');
    expect(config.blendMode).toBe('add');
  });
});
