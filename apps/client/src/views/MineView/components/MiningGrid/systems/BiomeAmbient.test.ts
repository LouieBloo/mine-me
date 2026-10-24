import { describe, it, expect, vi } from 'vitest';
import type { BiomeClientDefinition, MiningClientTile } from '@mine-me/shared';
import { BiomeAmbient, blendBiomeAmbient, sampleBiomeShares, NO_TINT } from './BiomeAmbient';

const biomes: BiomeClientDefinition[] = [
  { index: 0, key: 'default', name: 'Default', ambient: {} },
  { index: 1, key: 'frozen', name: 'Frozen', ambient: { tint: '#0000ff' } },
];

/** A grid where the left half is biome 0 and the right half biome 1; `hidden` columns are not revealed. */
const makeGrid = (width: number, height: number, split: number, hidden: (x: number) => boolean = () => false): MiningClientTile[][] =>
  Array.from({ length: height }, () =>
    Array.from({ length: width }, (_, x) => ({ type: 0, revealed: !hidden(x), biome: x < split ? 0 : 1 }) as MiningClientTile)
  );

const targets = () => ({ setTint: vi.fn(), setWallAlphas: vi.fn() });
const run = (system: BiomeAmbient, seconds: number, pos: { x: number; y: number }, grid: MiningClientTile[][]) => {
  for (let t = 0; t < seconds; t += 1 / 30) system.update(1 / 30, pos, grid);
};

describe('sampleBiomeShares', () => {
  const grid = makeGrid(60, 60, 30);

  it('is all one biome deep inside it', () => {
    expect(sampleBiomeShares(grid, 10, 30, 8, 2)).toEqual([1, 0]);
    expect(sampleBiomeShares(grid, 50, 30, 8, 2)).toEqual([0, 1]);
  });

  it('mixes both biomes at the border, adding up to 1, nearer cells counting more', () => {
    const shares = sampleBiomeShares(grid, 31, 30, 8, 2)!;
    expect(shares[0] + shares[1]).toBeCloseTo(1, 5);
    expect(shares[1]).toBeGreaterThan(shares[0]);
    expect(shares[0]).toBeGreaterThan(0.1);
  });

  it('ignores cells the fog still hides, and gives nothing when none are revealed', () => {
    const fogged = makeGrid(60, 60, 30, (x) => x >= 30);
    expect(sampleBiomeShares(fogged, 31, 30, 8, 2)).toEqual([1, 0]);
    expect(sampleBiomeShares(makeGrid(60, 60, 30, () => true), 31, 30, 8, 2)).toBeNull();
  });

  it('ignores a tile with no biome and an index it does not know', () => {
    const plain: MiningClientTile[][] = [[{ type: 0, revealed: true }, { type: 0, revealed: true, biome: 7 }]];
    expect(sampleBiomeShares(plain, 0, 0, 3, 2)).toBeNull();
  });
});

describe('blendBiomeAmbient', () => {
  it('is each biome\'s own look at a full share, and no tint for a biome that sets none', () => {
    expect(blendBiomeAmbient(biomes, [1, 0])).toEqual({ tint: NO_TINT });
    expect(blendBiomeAmbient(biomes, [0, 1])).toEqual({ tint: 0x0000ff });
  });

  it('blends colour by share', () => {
    const half = blendBiomeAmbient(biomes, [0.5, 0.5]);
    expect(half.tint).toBe((0x80 << 16) | (0x80 << 8) | 0xff);
  });

  it('copes with shares that add up to nothing', () => {
    expect(blendBiomeAmbient(biomes, [0, 0])).toEqual({ tint: NO_TINT });
  });
});

describe('BiomeAmbient', () => {
  const grid = makeGrid(80, 40, 40);

  it('takes the first look as it is, with no easing', () => {
    const t = targets();
    const system = new BiomeAmbient(biomes, t);
    system.update(1 / 30, { x: 60, y: 20 }, grid);
    expect(system.shares()).toEqual([0, 1]);
    expect(t.setTint).toHaveBeenLastCalledWith(0x0000ff);
    expect(t.setWallAlphas).toHaveBeenLastCalledWith([0, 1]);
  });

  it('eases between biomes over about a second instead of jumping', () => {
    const t = targets();
    const system = new BiomeAmbient(biomes, t);
    run(system, 0.5, { x: 10, y: 20 }, grid);
    expect(system.shares()[0]).toBeCloseTo(1, 3);
    // Move into the frozen biome
    system.update(1 / 30, { x: 70, y: 20 }, grid);
    expect(system.shares()[1]).toBeLessThan(0.5); // not there yet right after the move
    run(system, 0.4, { x: 70, y: 20 }, grid);
    const partway = system.shares()[1];
    expect(partway).toBeGreaterThan(0.2);
    expect(partway).toBeLessThan(0.95);
    run(system, 1.5, { x: 70, y: 20 }, grid);
    expect(system.shares()[1]).toBeGreaterThan(0.95);
  });

  it('draws only what changed', () => {
    const t = targets();
    const system = new BiomeAmbient(biomes, t);
    run(system, 1, { x: 10, y: 20 }, grid);
    const calls = t.setTint.mock.calls.length;
    run(system, 1, { x: 10, y: 20 }, grid);
    expect(t.setTint.mock.calls.length).toBe(calls);
  });

  it('draws again on reapply, and does nothing before it has seen any biome', () => {
    const t = targets();
    const system = new BiomeAmbient(biomes, t);
    system.reapply();
    expect(t.setTint).not.toHaveBeenCalled();
    run(system, 0.3, { x: 10, y: 20 }, grid);
    const calls = t.setTint.mock.calls.length;
    system.reapply();
    expect(t.setTint.mock.calls.length).toBe(calls + 1);
  });

  it('reports the biome under the cursor for the debug overlay (revealed cells only)', () => {
    const system = new BiomeAmbient(biomes, targets());
    system.update(1 / 30, { x: 10, y: 20 }, grid, { x: 55.4, y: 3.2 });
    expect(system.debugInfo().cursor).toEqual({ x: 55, y: 3, biome: 'Frozen' });
    const fogged = makeGrid(80, 40, 40, (x) => x >= 40);
    system.update(1 / 30, { x: 10, y: 20 }, fogged, { x: 55, y: 3 });
    expect(system.debugInfo().cursor).toEqual({ x: 55, y: 3, biome: null });
    system.update(1 / 30, { x: 10, y: 20 }, fogged, null);
    expect(system.debugInfo().cursor).toBeNull();
    expect(system.debugInfo().names).toEqual(['Default', 'Frozen']);
  });
});
