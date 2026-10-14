import { describe, it, expect } from 'vitest';
import { planPickaxe, EMBER_FLAME_CONFIG, FLAME_HELD_LIGHT } from './add-ember-flame';
import { FLAME_EFFECT_CONFIG } from './add-flame-pickaxe';

describe('add-ember-flame', () => {
  it('switches a pickaxe that still uses the first flame or none, and adds a missing light', () => {
    expect(planPickaxe({ heldParticleEffectId: 'pe1', heldLightConfig: null }, 'pe1')).toEqual({ setEffect: true, setLight: true });
    expect(planPickaxe({ heldParticleEffectId: null, heldLightConfig: null }, 'pe1')).toEqual({ setEffect: true, setLight: true });
  });

  it('leaves alone an effect or light the owner has since chosen', () => {
    expect(planPickaxe({ heldParticleEffectId: 'custom', heldLightConfig: { enabled: true } }, 'pe1')).toEqual({ setEffect: false, setLight: false });
  });

  it('is subtler and smaller than the first flame', () => {
    expect(EMBER_FLAME_CONFIG.rate).toBeLessThan(FLAME_EFFECT_CONFIG.rate);
    expect(EMBER_FLAME_CONFIG.scale.start).toBeLessThan(FLAME_EFFECT_CONFIG.scale.start);
    expect(EMBER_FLAME_CONFIG.speed.max).toBeLessThan(FLAME_EFFECT_CONFIG.speed.max);
    expect(EMBER_FLAME_CONFIG.lifetime.max).toBeLessThan(FLAME_EFFECT_CONFIG.lifetime.max);
  });

  it('light is enabled, flickers and lights a real radius', () => {
    expect(FLAME_HELD_LIGHT).toMatchObject({ enabled: true, type: 'POINT', effect: 'FLICKER' });
    expect(FLAME_HELD_LIGHT.radius).toBeGreaterThan(1.8);
  });
});
