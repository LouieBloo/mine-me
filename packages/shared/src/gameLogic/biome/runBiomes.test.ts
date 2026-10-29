import { describe, it, expect } from 'vitest';
import { BiomeField } from './biomeField';
import { MAX_RUN_BIOME_KEYS, listPickableBiomes, pickRunBiomes, sanitizeBiomeKeys } from './runBiomes';
import { BUILT_IN_DEFAULT_BIOME, type BiomeDefinition } from '../../types/biome';

const biome = (key: string, extra: Partial<BiomeDefinition> = {}): BiomeDefinition => ({
  ...BUILT_IN_DEFAULT_BIOME,
  id: key,
  key,
  name: key,
  isDefault: false,
  minDepth: 20,
  maxDepth: 60,
  weight: 3,
  ...extra,
});

const all = [biome('default', { isDefault: true, minDepth: 0, maxDepth: null }), biome('ice'), biome('lava', { weight: 0.5 })];

describe('sanitizeBiomeKeys', () => {
  it('keeps key-shaped strings once each and drops everything else', () => {
    expect(sanitizeBiomeKeys(['ice', 'ice', 'Lava', 5, null, 'a b', 'lava_2'])).toEqual(['ice', 'lava_2']);
  });
  it('is empty for anything that is not a list', () => {
    expect(sanitizeBiomeKeys(undefined)).toEqual([]);
    expect(sanitizeBiomeKeys('ice')).toEqual([]);
    expect(sanitizeBiomeKeys({ 0: 'ice' })).toEqual([]);
  });
  it('stops at the cap', () => {
    const many = Array.from({ length: MAX_RUN_BIOME_KEYS + 10 }, (_, i) => `b${i}`);
    expect(sanitizeBiomeKeys(many)).toHaveLength(MAX_RUN_BIOME_KEYS);
  });
});

describe('pickRunBiomes', () => {
  it('keeps only the picked biomes, so the default goes unless picked', () => {
    expect(pickRunBiomes(all, ['ice'])?.map((b) => b.key)).toEqual(['ice']);
    expect(pickRunBiomes(all, ['lava', 'default'])?.map((b) => b.key)).toEqual(['default', 'lava']);
  });
  it('clears the depth window and evens out the weights', () => {
    const [ice, lava] = pickRunBiomes(all, ['ice', 'lava'])!;
    expect([ice.minDepth, ice.maxDepth, ice.weight]).toEqual([0, null, 1]);
    expect([lava.minDepth, lava.maxDepth, lava.weight]).toEqual([0, null, 1]);
  });
  it('makes exactly one default, the first by key', () => {
    const picked = pickRunBiomes(all, ['lava', 'ice'])!;
    expect(picked.map((b) => [b.key, b.isDefault])).toEqual([['ice', true], ['lava', false]]);
  });
  it('does not change the definitions it was given', () => {
    pickRunBiomes(all, ['ice']);
    expect(all[1]).toMatchObject({ minDepth: 20, maxDepth: 60, weight: 3, isDefault: false });
  });
  it('ignores unknown keys, and returns the list as it was when nothing valid is picked', () => {
    expect(pickRunBiomes(all, ['ice', 'nope'])?.map((b) => b.key)).toEqual(['ice']);
    expect(pickRunBiomes(all, ['nope'])).toEqual(all);
    expect(pickRunBiomes(all, [])).toEqual(all);
    expect(pickRunBiomes(all, undefined)).toEqual(all);
    expect(pickRunBiomes(undefined, ['ice'])).toBeUndefined();
  });
  it('makes a field where the picked biomes fill every row, down to the surface', () => {
    const picked = pickRunBiomes(all, ['ice', 'lava'])!;
    const field = new BiomeField(7, picked, 0.15, 40, 80);
    const keys = new Set<string>();
    for (let y = 0; y < 80; y += 5) for (let x = 0; x < 40; x += 3) keys.add(field.biomes[field.primaryAt(x, y)].key);
    expect([...keys].sort()).toEqual(['ice', 'lava']);
  });
  it('without picking, the same biomes keep their depth windows (the normal field)', () => {
    const field = new BiomeField(7, all, 0.15, 40, 80);
    expect(field.biomes[field.primaryAt(5, 2)].key).toBe('default');
  });
});

describe('listPickableBiomes', () => {
  it('lists names and descriptions only, sorted by name', () => {
    const list = listPickableBiomes([biome('lava', { name: 'Lava', description: 'Hot' }), biome('ice', { name: 'Ice' })]);
    expect(list).toEqual([{ key: 'ice', name: 'Ice', description: null }, { key: 'lava', name: 'Lava', description: 'Hot' }]);
  });
  it('is empty when there are no biomes', () => {
    expect(listPickableBiomes(undefined)).toEqual([]);
  });
});
