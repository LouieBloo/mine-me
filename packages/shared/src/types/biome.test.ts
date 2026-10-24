import { describe, it, expect } from 'vitest';
import { validateBiome, BUILT_IN_DEFAULT_BIOME, type BiomeDefinition } from './biome';

const valid: Partial<BiomeDefinition> = { key: 'frozen_caves', name: 'Frozen Caves', minDepth: 10, maxDepth: 60, weight: 1, noiseScale: 30 };

describe('validateBiome', () => {
  it('accepts a plain biome and the built-in default', () => {
    expect(validateBiome(valid)).toEqual([]);
    expect(validateBiome(BUILT_IN_DEFAULT_BIOME)).toEqual([]);
  });

  it('rejects a bad key, name, depth window, weight and scale', () => {
    expect(validateBiome({ ...valid, key: 'Frozen Caves' })).toHaveLength(1);
    expect(validateBiome({ ...valid, name: ' ' })).toHaveLength(1);
    expect(validateBiome({ ...valid, minDepth: 70 })).toContain('minDepth cannot be greater than maxDepth');
    expect(validateBiome({ ...valid, minDepth: -1 })).toHaveLength(1);
    expect(validateBiome({ ...valid, weight: 0 })).toHaveLength(1);
    expect(validateBiome({ ...valid, noiseScale: 1 })).toHaveLength(1);
  });

  it('rejects negative weights in the tables', () => {
    expect(validateBiome({ ...valid, fluidWeights: { OIL: -1 } })).toHaveLength(1);
    expect(validateBiome({ ...valid, gasWeights: { X: 'a' as unknown as number } })).toHaveLength(1);
    expect(validateBiome({ ...valid, mobSpawns: { m: -2 } })).toHaveLength(1);
    expect(validateBiome({ ...valid, blockPalette: { weights: { ROCK: -1 } } })).toHaveLength(1);
  });

  it('checks swaps and ambient', () => {
    expect(validateBiome({ ...valid, blockPalette: { swaps: [{ from: 'DIRT', to: 'DIRT' }] } })).toHaveLength(1);
    expect(validateBiome({ ...valid, blockPalette: { swaps: [{ from: 'DIRT', to: 'ICE', chance: 2 }] } })).toHaveLength(1);
    expect(validateBiome({ ...valid, ambient: { tint: 'blue' } })).toHaveLength(1);
    expect(validateBiome({ ...valid, ambient: { wallTextureUrl: 'http://x/y.png' } })).toHaveLength(1);
    expect(validateBiome({ ...valid, ambient: { tint: '#aabbcc', wallTextureUrl: '/assets/walls/ice.png' } })).toEqual([]);
  });
});
