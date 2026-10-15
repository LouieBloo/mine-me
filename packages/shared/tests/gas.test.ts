import { describe, it, expect } from 'vitest';
import {
  validateGas, validateGasGeneration, validateGasAppearance, resolveGasAppearance, DEFAULT_GAS_APPEARANCE,
  GasRegistry, FluidRegistry, NO_GAS, type GasDefinition,
} from '../src/index';
import seedGases from '../src/data/gases.json';

const valid: GasDefinition = {
  id: 'g1', typeKey: 'HYDROGEN', name: 'Hydrogen', color: '#dff1ff', opacity: 0.35, density: 0.07,
  diffusionRate: 0.35, minConcentration: 0.02, ventLifetime: 6,
  flammability: { ignitionChance: 0.9, spreadChance: 1, burnDuration: 0.5, heat: 4, burnsInto: null },
};

describe('validateGas', () => {
  it('accepts a complete gas, with or without flammability', () => {
    expect(validateGas(valid)).toEqual([]);
    expect(validateGas({ ...valid, flammability: null })).toEqual([]);
    expect(validateGas({ ...valid, flammability: undefined })).toEqual([]);
  });

  it('accepts every gas in the dev seed mirror', () => {
    for (const gas of seedGases) expect(validateGas(gas as GasDefinition)).toEqual([]);
  });

  it.each([
    ['typeKey', { typeKey: 'hydrogen' }],
    ['typeKey', { typeKey: '' }],
    ['typeKey', { typeKey: '1H' }],
    ['name', { name: '  ' }],
    ['color', { color: 'blue' }],
    ['opacity', { opacity: 1.1 }],
    ['opacity', { opacity: NaN }],
    ['density', { density: 0 }],
    ['density', { density: -1 }],
    ['diffusionRate', { diffusionRate: 0 }],
    ['diffusionRate', { diffusionRate: 1.5 }],
    ['minConcentration', { minConcentration: -0.1 }],
    ['minConcentration', { minConcentration: 2 }],
    ['ventLifetime', { ventLifetime: 0 }],
    ['ventLifetime', { ventLifetime: -3 }],
  ])('rejects a bad %s', (field, patch) => {
    const errors = validateGas({ ...valid, ...patch });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(field);
  });

  it('reports every problem at once', () => {
    expect(validateGas({}).length).toBeGreaterThanOrEqual(8);
  });

  it('checks flammability, appearance and generation too', () => {
    expect(validateGas({ ...valid, flammability: { ...valid.flammability!, ignitionChance: 3 } })[0]).toContain('ignitionChance');
    expect(validateGas({ ...valid, appearance: { softness: 9 } })[0]).toContain('appearance.softness');
    expect(validateGas({ ...valid, generation: { minDepth: 0, percentage: 1, minSize: 1, maxSize: 2 } })[0]).toContain('minDepth');
  });
});

describe('validateGasGeneration', () => {
  const ok = { minDepth: 3, maxDepth: null, percentage: 3, minSize: 2, maxSize: 4, concentration: 1 };

  it('accepts none, a full shape, and a shape without a concentration', () => {
    expect(validateGasGeneration(null)).toEqual([]);
    expect(validateGasGeneration(ok)).toEqual([]);
    const { concentration: _c, ...without } = ok;
    expect(validateGasGeneration(without)).toEqual([]);
  });

  it.each([0, -0.5, 1.01, 'full', NaN])('rejects concentration %s', (concentration) => {
    expect(validateGasGeneration({ ...ok, concentration }).some((e) => e.includes('concentration'))).toBe(true);
  });

  it('keeps the same size and depth rules as fluid pockets', () => {
    expect(validateGasGeneration({ ...ok, maxSize: 1 }).some((e) => e.includes('maxSize'))).toBe(true);
    expect(validateGasGeneration('x')).toEqual(['generation must be an object or null']);
  });
});

describe('gas appearance', () => {
  it('fills missing fields with the defaults and clamps out-of-range ones', () => {
    expect(resolveGasAppearance(null)).toEqual(DEFAULT_GAS_APPEARANCE);
    expect(resolveGasAppearance({ softness: 0.1 })).toEqual({ ...DEFAULT_GAS_APPEARANCE, softness: 0.1 });
    expect(resolveGasAppearance({ softness: 5, driftSpeed: -1, driftAmount: 'x' })).toEqual({ ...DEFAULT_GAS_APPEARANCE, softness: 1, driftSpeed: 0 });
  });

  it('validates range and shape', () => {
    expect(validateGasAppearance(undefined)).toEqual([]);
    expect(validateGasAppearance([])).toEqual(['appearance must be an object or null']);
    expect(validateGasAppearance({ driftAmount: 0.9 })).toHaveLength(1);
  });
});

describe('GasRegistry', () => {
  const params = (typeKey: string) => ({ typeKey, density: 1, diffusionRate: 0.2, minConcentration: 0.02, ventLifetime: 5 });

  it('hands out ids in key order whatever order the gases arrive in, and never uses 0', () => {
    const a = new GasRegistry([params('NITROGEN'), params('HYDROGEN')]);
    const b = new GasRegistry([params('HYDROGEN'), params('NITROGEN')]);
    expect(a.idOf('HYDROGEN')).toBe(1);
    expect(a.idOf('NITROGEN')).toBe(2);
    expect(b.idOf('HYDROGEN')).toBe(1);
    expect(a.idOf('NITROGEN')).toBe(b.idOf('NITROGEN'));
    expect(NO_GAS).toBe(0);
  });

  it('looks up both ways, and answers undefined for the unknown', () => {
    const reg = new GasRegistry([params('HYDROGEN')]);
    expect(reg.keyOf(1)).toBe('HYDROGEN');
    expect(reg.paramsOf(1)?.typeKey).toBe('HYDROGEN');
    expect(reg.paramsOf(NO_GAS)).toBeUndefined();
    expect(reg.paramsOf(9)).toBeUndefined();
    expect(reg.idOf('ARGON')).toBeUndefined();
    expect(reg.size).toBe(1);
  });

  it('keeps the first of a duplicated key', () => {
    const reg = new GasRegistry([{ ...params('A'), density: 1 }, { ...params('A'), density: 9 }]);
    expect(reg.size).toBe(1);
    expect(reg.paramsOf(1)?.density).toBe(1);
  });

  it('refuses more than 255 gases, and says gases (fluids say fluids)', () => {
    const many = Array.from({ length: 256 }, (_, i) => params(`G${String(i).padStart(3, '0')}`));
    expect(() => new GasRegistry(many)).toThrow(/255 different gases/);
    const fluids = many.map((p) => ({ typeKey: p.typeKey, density: 1, flowRate: 0.5, minLevel: 0.05, flowThreshold: 0.02 }));
    expect(() => new FluidRegistry(fluids)).toThrow(/255 different fluids/);
  });
});
