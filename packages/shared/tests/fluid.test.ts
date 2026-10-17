import { describe, it, expect } from 'vitest';
import { validateFluid, validateFlammability, validateFluidGeneration, type FluidDefinition } from '../src/types/fluid';
import seedFluids from '../src/data/fluids.json';

const valid: FluidDefinition = {
  id: 'f1', typeKey: 'OIL', name: 'Oil', color: '#0b0b0d', opacity: 0.9, density: 0.8,
  viscosity: 0.6, flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02,
  flammability: { ignitionChance: 0.8, spreadChance: 0.5, burnDuration: 8, heat: 3, burnsInto: null },
};

describe('validateFluid', () => {
  it('accepts a complete fluid, with or without flammability', () => {
    expect(validateFluid(valid)).toEqual([]);
    expect(validateFluid({ ...valid, flammability: null })).toEqual([]);
    expect(validateFluid({ ...valid, flammability: undefined })).toEqual([]);
  });

  it('accepts every fluid in the dev seed mirror', () => {
    for (const fluid of seedFluids) expect(validateFluid(fluid as FluidDefinition)).toEqual([]);
  });

  it.each([
    ['typeKey', { typeKey: 'oil' }],
    ['typeKey', { typeKey: '' }],
    ['typeKey', { typeKey: '1OIL' }],
    ['name', { name: '  ' }],
    ['color', { color: 'black' }],
    ['color', { color: '#fff' }],
    ['opacity', { opacity: 1.1 }],
    ['density', { density: 0 }],
    ['viscosity', { viscosity: -0.1 }],
    ['flowRate', { flowRate: 0 }],
    ['flowRate', { flowRate: 1.5 }],
    ['minLevel', { minLevel: -1 }],
    ['flowThreshold', { flowThreshold: 2 }],
    ['opacity', { opacity: NaN }],
  ])('rejects a bad %s', (field, patch) => {
    const errors = validateFluid({ ...valid, ...patch });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(field);
  });

  it('reports every problem at once', () => {
    expect(validateFluid({}).length).toBeGreaterThanOrEqual(8);
  });
});

describe('validateFlammability', () => {
  const ok = { ignitionChance: 1, spreadChance: 0, burnDuration: 1, heat: 0 };

  it('treats null and absent as not flammable', () => {
    expect(validateFlammability(null)).toEqual([]);
    expect(validateFlammability(undefined)).toEqual([]);
  });

  it('accepts the boundary values', () => {
    expect(validateFlammability(ok)).toEqual([]);
    expect(validateFlammability({ ...ok, burnsInto: 'ASH' })).toEqual([]);
  });

  it.each([
    ['not an object', 'fire'],
    ['an array', []],
    ['ignitionChance above 1', { ...ok, ignitionChance: 1.01 }],
    ['spreadChance below 0', { ...ok, spreadChance: -0.01 }],
    ['burnDuration of 0', { ...ok, burnDuration: 0 }],
    ['negative heat', { ...ok, heat: -1 }],
    ['burnsInto not a string', { ...ok, burnsInto: 5 }],
    ['missing fields', {}],
  ])('rejects %s', (_name, value) => {
    expect(validateFlammability(value).length).toBeGreaterThan(0);
  });
});

describe('validateFluidGeneration', () => {
  const ok = { minDepth: 8, maxDepth: null, percentage: 1.5, minSize: 2, maxSize: 4 };

  it('treats null and absent as never generated', () => {
    expect(validateFluidGeneration(null)).toEqual([]);
    expect(validateFluidGeneration(undefined)).toEqual([]);
  });

  it('accepts valid settings, with or without a max depth', () => {
    expect(validateFluidGeneration(ok)).toEqual([]);
    expect(validateFluidGeneration({ ...ok, maxDepth: 30 })).toEqual([]);
    expect(validateFluidGeneration({ ...ok, maxDepth: undefined })).toEqual([]);
    expect(validateFluidGeneration({ ...ok, minSize: 3, maxSize: 3 })).toEqual([]);
  });

  it.each([
    ['not an object', 'x'],
    ['an array', []],
    ['minDepth 0', { ...ok, minDepth: 0 }],
    ['fractional minDepth', { ...ok, minDepth: 2.5 }],
    ['maxDepth above minDepth', { ...ok, maxDepth: 3 }],
    ['percentage over 100', { ...ok, percentage: 101 }],
    ['negative percentage', { ...ok, percentage: -1 }],
    ['minSize 0', { ...ok, minSize: 0 }],
    ['maxSize below minSize', { ...ok, maxSize: 1 }],
    ['missing fields', {}],
  ])('rejects %s', (_name, value) => {
    expect(validateFluidGeneration(value).length).toBeGreaterThan(0);
  });

  it('is checked as part of a fluid', () => {
    expect(validateFluid({ ...valid, generation: { ...ok, percentage: 500 } }).join()).toContain('generation.percentage');
  });
});

describe('validateFluid contact, light and reactions', () => {
  const base = (extra: Partial<FluidDefinition>): Partial<FluidDefinition> => ({
    typeKey: 'LAVA', name: 'Lava', color: '#ff5500', opacity: 0.9, density: 3, viscosity: 0.8, flowRate: 0.1, minLevel: 0.05, flowThreshold: 0.02, ...extra,
  });

  it('accepts a sensible contact, light and reaction', () => {
    expect(validateFluid(base({
      contact: { damagePerSecond: 20, ignites: 100 },
      light: { type: 'POINT', color: '#ff7a1c', radius: 4, intensity: 0.8, enabled: true } as any,
      reactions: [{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 2 }],
    }))).toEqual([]);
  });

  it('rejects bad contact values', () => {
    expect(validateFluid(base({ contact: { damagePerSecond: -1 } }))).toContain('contact.damagePerSecond must be 0 or more');
    expect(validateFluid(base({ contact: { ignites: 5000 } })).length).toBe(1);
    expect(validateFluid(base({ contact: { ignites: 50, extinguishes: true } }))).toContain('contact cannot both ignite and extinguish');
  });

  it('rejects a light without radius or intensity', () => {
    expect(validateFluid(base({ light: { radius: 0, intensity: 1 } as any }))).toContain('light needs a radius and intensity above 0');
  });

  it('rejects bad reactions', () => {
    expect(validateFluid(base({ reactions: [{ with: 'LAVA', becomes: 'X', costPerLevel: 1 }] }))).toContain('reactions[0].with cannot be the fluid itself');
    expect(validateFluid(base({ reactions: [{ with: 'WATER', becomes: '', costPerLevel: 1 }] }))).toContain('reactions[0].becomes must be a block key');
    expect(validateFluid(base({ reactions: [{ with: 'WATER', becomes: 'X', costPerLevel: 0 }] }))).toContain('reactions[0].costPerLevel must be greater than 0');
    expect(validateFluid(base({ reactions: {} as any }))).toContain('reactions must be a list or null');
  });
});
