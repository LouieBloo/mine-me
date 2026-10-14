import { describe, it, expect } from 'vitest';
import { scaleEffects, FLAME_EFFECT_CONFIG, SPEED_MULTIPLIER } from './add-flame-pickaxe';

describe('add-flame-pickaxe', () => {
  it('multiplies only mining-speed effects, 4x', () => {
    const out = scaleEffects(
      [
        { effectId: 'tool', value: 25, isMiningSpeed: false },
        { effectId: 'speed', value: 25, isMiningSpeed: true },
        { effectId: 'dmg', value: 25, isMiningSpeed: false },
      ],
      SPEED_MULTIPLIER
    );
    expect(out).toEqual([
      { effectId: 'tool', value: 25 },
      { effectId: 'speed', value: 100 },
      { effectId: 'dmg', value: 25 },
    ]);
  });

  it('flame is a continuous effect that rises', () => {
    expect(FLAME_EFFECT_CONFIG.emitterType).toBe('continuous');
    expect(FLAME_EFFECT_CONFIG.rate).toBeGreaterThan(0);
    expect(FLAME_EFFECT_CONFIG.gravity.y).toBeLessThan(0);
  });
});
