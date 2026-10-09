import { describe, it, expect } from 'vitest';
import { DEFAULT_EFFECT_FLAGS, EFFECT_KINDS, describeEffectKinds, getEffectKind } from './effectKinds';

describe('effect kinds', () => {
  it('has a unique flag and label for every kind, including the combat-stat ones', () => {
    const flags = EFFECT_KINDS.map((k) => k.flag);
    expect(new Set(flags).size).toBe(flags.length);
    expect(flags).toEqual(
      expect.arrayContaining(['damageModifier', 'toolDamageModifier', 'pickPowerModifier', 'knockbackModifier', 'miningSpeedModifier'])
    );
    for (const k of EFFECT_KINDS) {
      expect(k.label.length).toBeGreaterThan(0);
      expect(k.short.length).toBeGreaterThan(0);
    }
  });

  it('defaults every flag to false', () => {
    expect(Object.keys(DEFAULT_EFFECT_FLAGS).sort()).toEqual(EFFECT_KINDS.map((k) => k.flag).sort());
    expect(Object.values(DEFAULT_EFFECT_FLAGS).every((v) => v === false)).toBe(true);
  });

  it('identifies an effect by its first matching kind', () => {
    expect(getEffectKind({ pickPowerModifier: true })?.short).toBe('Pick Power');
    expect(getEffectKind({ toolDamageModifier: true })?.short).toBe('Tool Damage');
    expect(getEffectKind({ knockbackModifier: true })?.short).toBe('Knockback');
    // Damage wins when an effect has several flags (matches the old badge priority)
    expect(getEffectKind({ damageModifier: true, miningSpeedModifier: true })?.short).toBe('Damage');
  });

  it('returns nothing for an effect with no flags, or no effect', () => {
    expect(getEffectKind({})).toBeUndefined();
    expect(getEffectKind(null)).toBeUndefined();
    expect(getEffectKind(undefined)).toBeUndefined();
  });

  it('describes all kinds an effect has for dropdown labels', () => {
    expect(describeEffectKinds({ damageModifier: true, pickPowerModifier: true })).toBe('(Damage)(Pick Power)');
    expect(describeEffectKinds({})).toBe('');
    expect(describeEffectKinds(null)).toBe('');
  });
});
