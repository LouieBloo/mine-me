import { describe, it, expect } from 'vitest';
import { getIgnitionStrength, ignitionChance } from './ignition';

const withEffects = (...effects: Array<{ ignites?: boolean; value: number }>) => ({
  itemEffects: effects.map((e) => ({ value: e.value, effect: { ignites: e.ignites } })) as any,
});

describe('getIgnitionStrength', () => {
  it('is 0 for an item with no Ignites effect, or no item at all', () => {
    expect(getIgnitionStrength(undefined)).toBe(0);
    expect(getIgnitionStrength({ itemEffects: undefined })).toBe(0);
    expect(getIgnitionStrength({ itemEffects: [] })).toBe(0);
    expect(getIgnitionStrength(withEffects({ ignites: false, value: 100 }))).toBe(0);
  });

  it('reads the effect value as a percentage: 100 is normal strength', () => {
    expect(getIgnitionStrength(withEffects({ ignites: true, value: 100 }))).toBe(1);
    expect(getIgnitionStrength(withEffects({ ignites: true, value: 50 }))).toBe(0.5);
    expect(getIgnitionStrength(withEffects({ ignites: true, value: 250 }))).toBe(2.5);
  });

  it('adds up several Ignites effects and ignores other effects', () => {
    expect(getIgnitionStrength(withEffects({ ignites: true, value: 50 }, { ignites: true, value: 25 }, { value: 999 }))).toBeCloseTo(0.75, 5);
  });

  it('ignores a zero, negative or broken value', () => {
    expect(getIgnitionStrength(withEffects({ ignites: true, value: 0 }))).toBe(0);
    expect(getIgnitionStrength(withEffects({ ignites: true, value: -50 }))).toBe(0);
    expect(getIgnitionStrength(withEffects({ ignites: true, value: NaN }))).toBe(0);
  });
});

describe('ignitionChance', () => {
  it('is the material\'s chance times the source strength, held between 0 and 1', () => {
    expect(ignitionChance({ ignitionChance: 0.8 }, 1)).toBeCloseTo(0.8, 5);
    expect(ignitionChance({ ignitionChance: 0.8 }, 0.5)).toBeCloseTo(0.4, 5);
    expect(ignitionChance({ ignitionChance: 0.8 }, 5)).toBe(1);
    expect(ignitionChance({ ignitionChance: 0 }, 5)).toBe(0);
  });

  it('is 0 with no strength, whatever the material', () => {
    expect(ignitionChance({ ignitionChance: 1 }, 0)).toBe(0);
    expect(ignitionChance({ ignitionChance: 1 }, -1)).toBe(0);
    expect(ignitionChance({ ignitionChance: 1 }, NaN)).toBe(0);
  });
});
