import { describe, it, expect } from 'vitest';
import { BiomeField, normalizeBiomes, resolveMapBiomes, valueNoise, DEFAULT_BIOME_BLEND_WIDTH } from './biomeField';
import { BUILT_IN_DEFAULT_BIOME, type BiomeDefinition } from '../../types/biome';

const biome = (key: string, over: Partial<BiomeDefinition> = {}): BiomeDefinition => ({
  id: `id-${key}`,
  key,
  name: key,
  isDefault: false,
  minDepth: 0,
  maxDepth: null,
  weight: 1,
  noiseScale: 20,
  ...over,
});

const ICE = biome('ice', { minDepth: 30, maxDepth: 90 });
const LAVA = biome('lava', { minDepth: 60 });
const W = 90;
const H = 120;

const cells = (field: BiomeField) => {
  const out: [number, number][] = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) out.push([x, y]);
  return out;
};

describe('valueNoise', () => {
  it('is deterministic, in [0, 1] and smooth', () => {
    expect(valueNoise(5, 1.3, 2.7)).toBe(valueNoise(5, 1.3, 2.7));
    expect(valueNoise(5, 1.3, 2.7)).not.toBe(valueNoise(6, 1.3, 2.7));
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(3, i * 0.37, i * 0.91);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(valueNoise(3, 4.0, 4.0) - valueNoise(3, 4.01, 4.0))).toBeLessThan(0.05);
  });
});

describe('normalizeBiomes', () => {
  it('adds the built-in default when there is none and sorts by key', () => {
    const list = normalizeBiomes([LAVA, ICE]);
    expect(list.map((b) => b.key)).toEqual(['default', 'ice', 'lava']);
    expect(list.filter((b) => b.isDefault)).toHaveLength(1);
  });

  it('keeps only the first default by key', () => {
    const list = normalizeBiomes([biome('b', { isDefault: true }), biome('a', { isDefault: true })]);
    expect(list.find((b) => b.key === 'a')!.isDefault).toBe(true);
    expect(list.find((b) => b.key === 'b')!.isDefault).toBe(false);
  });

  it('is just the default for no biomes', () => {
    expect(normalizeBiomes(undefined)).toEqual([BUILT_IN_DEFAULT_BIOME]);
  });
});

describe('BiomeField', () => {
  it('with only the default, every cell is the default and nothing is mixed', () => {
    const field = new BiomeField(7, [], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    expect(field.hasBiomes).toBe(false);
    for (const [x, y] of cells(field)) {
      expect(field.weightsAt(x, y)).toEqual([1]);
      expect(field.primaryAt(x, y)).toBe(0);
    }
    expect(field.blockMultiplier(3, 3, 'ROCK')).toBe(1);
    expect(field.swapChances(3, 3, 'DIRT')).toEqual([]);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const make = (seed: number) => new BiomeField(seed, [ICE, LAVA], DEFAULT_BIOME_BLEND_WIDTH, W, H).primaryGrid();
    expect(Array.from(make(11))).toEqual(Array.from(make(11)));
    expect(Array.from(make(11))).not.toEqual(Array.from(make(12)));
  });

  it('does not depend on the order the biomes are given in', () => {
    const a = new BiomeField(4, [ICE, LAVA], DEFAULT_BIOME_BLEND_WIDTH, W, H).primaryGrid();
    const b = new BiomeField(4, [LAVA, ICE], DEFAULT_BIOME_BLEND_WIDTH, W, H).primaryGrid();
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('weights add up to 1 and are never negative', () => {
    const field = new BiomeField(2, [ICE, LAVA], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    for (const [x, y] of cells(field)) {
      const weights = field.weightsAt(x, y);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      for (const w of weights) expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it('respects depth windows: a biome never appears outside its rows', () => {
    const field = new BiomeField(9, [ICE, LAVA], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    const iceIndex = field.biomes.findIndex((b) => b.key === 'ice');
    const lavaIndex = field.biomes.findIndex((b) => b.key === 'lava');
    let iceSeen = false;
    for (const [x, y] of cells(field)) {
      const weights = field.weightsAt(x, y);
      if (y < 30 || y > 90) expect(weights[iceIndex]).toBe(0);
      if (y < 60) expect(weights[lavaIndex]).toBe(0);
      if (weights[iceIndex] > 0) iceSeen = true;
    }
    expect(iceSeen).toBe(true);
  });

  it('falls back to the default where no biome fits the depth', () => {
    const only = biome('deep', { minDepth: 100 });
    const field = new BiomeField(1, [only], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    for (let x = 0; x < W; x += 5) expect(field.biomes[field.primaryAt(x, 5)].isDefault).toBe(true);
  });

  it('a higher weight makes a biome cover more of the map', () => {
    const share = (weight: number) => {
      const field = new BiomeField(5, [biome('x', { weight })], DEFAULT_BIOME_BLEND_WIDTH, W, H);
      const x = field.biomes.findIndex((b) => b.key === 'x');
      return cells(field).filter(([cx, cy]) => field.primaryAt(cx, cy) === x).length;
    };
    expect(share(3)).toBeGreaterThan(share(1));
  });

  it('blends borders: border cells mix biomes, and hard edges (blend 0) never do', () => {
    const soft = new BiomeField(3, [ICE], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    const hard = new BiomeField(3, [ICE], 0, W, H);
    const mixed = (field: BiomeField) =>
      cells(field).filter(([x, y]) => field.weightsAt(x, y).filter((w) => w > 0).length > 1).length;
    expect(mixed(soft)).toBeGreaterThan(0);
    expect(mixed(hard)).toBe(0);
  });

  it('a wider blend makes more mixed cells', () => {
    const mixed = (blend: number) => {
      const field = new BiomeField(3, [ICE], blend, W, H);
      return cells(field).filter(([x, y]) => field.weightsAt(x, y).filter((w) => w > 0).length > 1).length;
    };
    expect(mixed(0.4)).toBeGreaterThan(mixed(0.05));
  });

  it('keeps the primary biome in the mix at a border', () => {
    const field = new BiomeField(3, [ICE], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    for (const [x, y] of cells(field)) {
      const weights = field.weightsAt(x, y);
      expect(weights[field.primaryAt(x, y)]).toBe(Math.max(...weights));
    }
  });

  it('primaryGrid matches primaryAt', () => {
    const field = new BiomeField(8, [ICE, LAVA], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    const grid = field.primaryGrid();
    expect(grid[40 * W + 25]).toBe(field.primaryAt(25, 40));
  });

  it('answers cells outside the map with the default', () => {
    const field = new BiomeField(8, [ICE], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    expect(field.weightsAt(-1, 5)[field.defaultIndex]).toBe(1);
    expect(field.weightsAt(W, 5)[field.defaultIndex]).toBe(1);
  });
});

describe('BiomeField with sky rows', () => {
  it('shifts the field down: ground cells keep their biome and the sky is the default', () => {
    const ground = new BiomeField(6, [ICE, LAVA], DEFAULT_BIOME_BLEND_WIDTH, W, H);
    const shifted = new BiomeField(6, [ICE, LAVA], DEFAULT_BIOME_BLEND_WIDTH, W, H).shiftRows(24);
    expect(shifted.totalHeight).toBe(H + 24);
    for (const [x, y] of cells(ground)) expect(shifted.weightsAt(x, y + 24)).toEqual(ground.weightsAt(x, y));
    for (let x = 0; x < W; x += 7) expect(shifted.primaryAt(x, 10)).toBe(shifted.defaultIndex);
    expect(shifted.primaryGrid()).toHaveLength(W * (H + 24));
  });
});

describe('BiomeField flags', () => {
  it('say whether blocks or mobs are changed by any biome', () => {
    expect(new BiomeField(1, [ICE], 0.1, W, H).changesBlockWeights).toBe(false);
    expect(new BiomeField(1, [ICE], 0.1, W, H).hasMobSpawns).toBe(false);
    expect(new BiomeField(1, [biome('r', { blockPalette: { weights: { ROCK: 2 } } })], 0.1, W, H).changesBlockWeights).toBe(true);
    expect(new BiomeField(1, [biome('r', { mobSpawns: { m: 1 } })], 0.1, W, H).hasMobSpawns).toBe(true);
  });
});

describe('BiomeField content tables', () => {
  const pure = (over: Partial<BiomeDefinition>) => {
    // One biome that owns the whole map, so the mix is exactly its table
    const only = biome('only', { weight: 1000, noiseScale: 20, ...over });
    return new BiomeField(1, [only], 0.01, W, H);
  };

  it('block, fluid and gas multipliers come from the biome and default to 1', () => {
    const field = pure({
      blockPalette: { weights: { SILVERIUM: 3, ROCK: 0 } },
      fluidWeights: { OIL: 2 },
      gasWeights: { HYDROGEN: 0 },
    });
    expect(field.blockMultiplier(10, 10, 'SILVERIUM')).toBeCloseTo(3, 5);
    expect(field.blockMultiplier(10, 10, 'ROCK')).toBe(0);
    expect(field.blockMultiplier(10, 10, 'COPPERIUM')).toBe(1);
    expect(field.fluidMultiplier(10, 10, 'OIL')).toBeCloseTo(2, 5);
    expect(field.gasMultiplier(10, 10, 'HYDROGEN')).toBe(0);
  });

  it('a border cell mixes the multipliers of both biomes', () => {
    const field = new BiomeField(3, [biome('rich', { blockPalette: { weights: { SILVERIUM: 5 } } })], 0.3, W, H);
    const values = new Set<number>();
    for (const [x, y] of cells(field)) values.add(Math.round(field.blockMultiplier(x, y, 'SILVERIUM') * 100));
    // pure default = 1, pure rich = 5, and values in between at the borders
    expect([...values].some((v) => v > 110 && v < 490)).toBe(true);
  });

  it('swap chances come from the biome and combine by share', () => {
    const field = pure({ blockPalette: { swaps: [{ from: 'DIRT', to: 'ICE', chance: 0.5 }] } });
    expect(field.swapChances(10, 10, 'DIRT')).toEqual([{ to: 'ICE', chance: expect.closeTo(0.5, 5) }]);
    expect(field.swapChances(10, 10, 'ROCK')).toEqual([]);
  });

  it('mob choices use the biome list, or the map list where the biome has none', () => {
    const own = pure({ mobSpawns: { a: 3, b: 1 } });
    const choices = own.mobChoices(10, 10, ['x', 'y']);
    expect(choices.find((c) => c.id === 'a')!.weight).toBeCloseTo(0.75, 5);
    expect(choices.find((c) => c.id === 'x')).toBeUndefined();

    const none = pure({});
    expect(none.mobChoices(10, 10, ['x', 'y']).map((c) => c.id).sort()).toEqual(['x', 'y']);
    expect(none.mobChoices(10, 10, [])).toEqual([]);
  });
});

describe('resolveMapBiomes', () => {
  const DEFAULT = biome('base', { isDefault: true });
  const all = [DEFAULT, ICE, LAVA];

  it('uses every biome at its own weight when the map chose none', () => {
    expect(resolveMapBiomes(all, null)).toEqual(all);
    expect(resolveMapBiomes(all, undefined)).toEqual(all);
    expect(resolveMapBiomes(all, {})).toEqual(all);
    expect(resolveMapBiomes(undefined, { ice: 2 })).toBeUndefined();
  });

  it('keeps only the biomes the map lists, with the map\'s weight, and always the default', () => {
    const out = resolveMapBiomes(all, { ice: 3 })!;
    expect(out.map((b) => b.key)).toEqual(['base', 'ice']);
    expect(out.find((b) => b.key === 'ice')!.weight).toBe(3);
    expect(out.find((b) => b.key === 'base')!.weight).toBe(1);
  });

  it('lets the map weight the default too, ignores unknown keys and does not change the originals', () => {
    const out = resolveMapBiomes(all, { base: 0.5, ghost: 9 })!;
    expect(out.map((b) => b.key)).toEqual(['base']);
    expect(out[0].weight).toBe(0.5);
    expect(DEFAULT.weight).toBe(1);
  });
});
