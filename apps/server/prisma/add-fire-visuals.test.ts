import { describe, it, expect } from 'vitest';
import { planFireVisuals, OIL_FIRE_CONFIG, BURNING_CONFIG, OIL_FLAME_LIGHT } from './add-fire-visuals';
import { validateFlammability } from '@mine-me/shared';

const burningOil = { flammability: { ignitionChance: 0.8, spreadChance: 0.5, burnDuration: 8, heat: 3 } };
const base = { oilFireExists: false, burningExists: false, oil: burningOil, mapConfig: { burningEffectId: null } };

describe('add-fire-visuals', () => {
  it('creates what is missing and fills in what is unset', () => {
    expect(planFireVisuals(base)).toEqual({ createOilFire: true, createBurning: true, setOilEffect: true, setOilLight: true, setBurningEffect: true });
  });

  it('leaves alone what exists or is already set (the owner may have tuned it)', () => {
    const plan = planFireVisuals({
      oilFireExists: true,
      burningExists: true,
      oil: { flammability: { ...burningOil.flammability, flameEffectId: 'x', flameLight: OIL_FLAME_LIGHT } },
      mapConfig: { burningEffectId: 'y' },
    });
    expect(plan).toEqual({ createOilFire: false, createBurning: false, setOilEffect: false, setOilLight: false, setBurningEffect: false });
  });

  it('sets only the oil settings that are missing', () => {
    const plan = planFireVisuals({ ...base, oil: { flammability: { ...burningOil.flammability, flameEffectId: 'x' } } });
    expect([plan.setOilEffect, plan.setOilLight]).toEqual([false, true]);
  });

  it('does not make oil flammable: no oil, or oil that does not burn, gets no flame settings', () => {
    expect(planFireVisuals({ ...base, oil: null })).toMatchObject({ setOilEffect: false, setOilLight: false });
    expect(planFireVisuals({ ...base, oil: { flammability: null } })).toMatchObject({ setOilEffect: false, setOilLight: false });
  });

  it('does nothing about the mine config when there is no active one', () => {
    expect(planFireVisuals({ ...base, mapConfig: null }).setBurningEffect).toBe(false);
  });

  it('the effects are flames: continuous, upward, additive', () => {
    for (const config of [OIL_FIRE_CONFIG, BURNING_CONFIG]) {
      expect(config).toMatchObject({ emitterType: 'continuous', shape: 'flame', blendMode: 'add' });
      expect(config.gravity.y).toBeLessThan(0);
    }
    expect(OIL_FIRE_CONFIG.spawnWidth).toBeGreaterThan(BURNING_CONFIG.spawnWidth);
  });

  it('the flame light passes the same validation the admin applies', () => {
    expect(validateFlammability({ ignitionChance: 1, spreadChance: 1, burnDuration: 4, heat: 1, flameLight: OIL_FLAME_LIGHT, flameEffectId: 'pe1' })).toEqual([]);
  });
});
