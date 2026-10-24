import { describe, it, expect } from 'vitest';
import { BandBiomeField } from './bandBiomeField';
import type { BiomeDefinition } from '../../types/biome';

const biome = (key: string, minDepth: number, extra: Partial<BiomeDefinition> = {}): BiomeDefinition => ({
  id: key, key, name: key, isDefault: false, minDepth, maxDepth: null, weight: 1, noiseScale: 45, ...extra,
});
const biomes = [
  biome('zeta', 30),
  biome('default', 0, { isDefault: true }),
  biome('alpha', 10, { blockPalette: { swaps: [{ from: 'DIRT', to: 'ICE', chance: 0.8 }] } }),
];
// 3 biomes over 30 columns: bands of 10 cells, borders at 10 and 20; 4 rows of sky; a border 4 cells wide
const field = () => new BandBiomeField(biomes, 30, 14, 4, 4);
const name = (f: BandBiomeField, i: number) => f.biomes[i].key;

describe('BandBiomeField', () => {
  it('lays the biomes out left to right: the default first, then by the depth they start at', () => {
    const f = field();
    expect(f.bandOrder.map((i) => name(f, i))).toEqual(['default', 'alpha', 'zeta']);
    const primary = (x: number) => name(f, f.primaryAt(x, 8));
    expect([primary(2), primary(15), primary(27)]).toEqual(['default', 'alpha', 'zeta']);
  });

  it('is the default biome in the sky and outside the map', () => {
    const f = field();
    expect(name(f, f.primaryAt(15, 3))).toBe('default');
    expect(name(f, f.primaryAt(-1, 8))).toBe('default');
    expect(name(f, f.primaryAt(99, 8))).toBe('default');
  });

  it('shares always add up to 1 and cross over linearly across a border', () => {
    const f = field();
    const share = (x: number, key: string) => f.weightsAt(x, 8)[f.biomes.findIndex((b) => b.key === key)];
    for (let x = 0; x < 30; x++) expect(f.weightsAt(x, 8).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(share(5, 'default')).toBe(1); // well inside a band: only that biome
    expect(share(9, 'alpha')).toBeCloseTo(0.375); // the centre of cell 9 is half a cell before the border at 10
    expect(share(10, 'alpha')).toBeCloseTo(0.625);
    expect(share(7, 'alpha')).toBe(0); // out of the 4-cell border (cell centres 8 to 12)
    expect(share(12, 'default')).toBe(0);
  });

  it('feeds the generator helpers: swaps are in the mix only where the biome is', () => {
    const f = field();
    expect(f.swapChances(2, 8, 'DIRT')).toEqual([]);
    expect(f.swapChances(15, 8, 'DIRT')[0].chance).toBeCloseTo(0.8);
    const edge = f.swapChances(10, 8, 'DIRT')[0].chance;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0.8);
  });

  it('has hard edges when the blend is 0', () => {
    const f = new BandBiomeField(biomes, 30, 14, 4, 0);
    expect(f.weightsAt(9, 8)[f.biomes.findIndex((b) => b.key === 'default')]).toBe(1);
    expect(f.weightsAt(10, 8)[f.biomes.findIndex((b) => b.key === 'alpha')]).toBe(1);
  });

  it('builds the per-cell primary grid for the wire', () => {
    const f = field();
    const grid = f.primaryGrid();
    expect(grid).toHaveLength(30 * 14);
    expect(grid[8 * 30 + 15]).toBe(f.biomes.findIndex((b) => b.key === 'alpha'));
  });
});
