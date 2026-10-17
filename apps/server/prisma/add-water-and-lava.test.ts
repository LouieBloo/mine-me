import { describe, it, expect } from 'vitest';
import { validateFluid } from '@mine-me/shared';
import { LAVA, WATER, NEW_FLUIDS, planFluids } from './add-water-and-lava';
import { planOil } from './add-oil-fluid';

describe('add-water-and-lava', () => {
  it('both fluids pass the same validation the admin enforces', () => {
    for (const f of NEW_FLUIDS) expect(validateFluid(f), f.typeKey).toEqual([]);
  });

  it('lava is slow and thick compared to oil and water, dense, glowing, harmful and hardens into lavarock', () => {
    expect(LAVA.flowRate).toBeLessThan(0.35); // oil
    expect(LAVA.flowRate).toBeLessThan(WATER.flowRate);
    expect(LAVA.viscosity).toBeGreaterThan(0.6); // oil
    expect(LAVA.density).toBeGreaterThan(WATER.density);
    expect(LAVA.contact?.damagePerSecond).toBeGreaterThan(0);
    expect(LAVA.contact?.ignites).toBeGreaterThan(0);
    expect(LAVA.light?.enabled).toBe(true);
    expect(LAVA.reactions).toEqual([{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 2 }]);
  });

  it('water puts fires out, does not burn and does not glow', () => {
    expect(WATER.contact).toEqual({ extinguishes: true });
    expect(WATER.flammability).toBeNull();
    expect(WATER.light).toBeNull();
  });

  it('only creates what is missing, never touching an existing fluid', () => {
    expect(planFluids([]).create.map((f) => f.typeKey)).toEqual(['WATER', 'LAVA']);
    const plan = planFluids(['OIL', 'LAVA']);
    expect(plan.create.map((f) => f.typeKey)).toEqual(['WATER']);
    expect(plan.skip.map((f) => f.typeKey)).toEqual(['LAVA']);
    expect(planFluids(['WATER', 'LAVA']).create).toEqual([]);
    expect(planOil([]).action).toBe('create'); // the oil script is unaffected
  });
});
