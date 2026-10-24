import { describe, it, expect } from 'vitest';
import { MiningTileType, type BiomeDefinition, type FluidDefinition, type MiningMapConfigData } from '@mine-me/shared';
import { generateMiningMapWithFluids, type ServerMiningGrid } from './miningMap.service';

const biome = (key: string, over: Partial<BiomeDefinition> = {}): BiomeDefinition => ({
  id: `b_${key}`, key, name: key, isDefault: false, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 24, ...over,
});
const oil: FluidDefinition = {
  id: 'f1', typeKey: 'OIL', name: 'Oil', color: '#000000', opacity: 0.9, density: 0.8, viscosity: 0.6,
  flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02,
  generation: { minDepth: 8, maxDepth: null, percentage: 6, minSize: 2, maxSize: 4 },
};
const CONFIG = { gridWidth: 90, gridHeight: 90, cavernDensity: 30, silveriumPercentage: 4, silveriumMinDepth: 6 };
const make = (seed: number, biomes: BiomeDefinition[], extra: Partial<MiningMapConfigData> = {}, fluids: FluidDefinition[] = []) =>
  generateMiningMapWithFluids({ seed, config: { ...CONFIG, ...extra }, biomes, fluids });

const types = (grid: ServerMiningGrid) => grid.map((row) => row.map((t) => t.type));
const count = (grid: ServerMiningGrid, type: MiningTileType, within?: (x: number, y: number) => boolean) => {
  let n = 0;
  grid.forEach((row, y) => row.forEach((t, x) => { if (t.type === type && (!within || within(x, y))) n++; }));
  return n;
};

describe('biomes in map generation', () => {
  it('a map with no biomes, or biomes that change nothing, is generated exactly as before', () => {
    const plain = make(21, [], {}, [oil]);
    const withBiome = make(21, [biome('cosmetic', { ambient: { tint: '#8899ff' } })], {}, [oil]);
    expect(types(withBiome.grid)).toEqual(types(plain.grid));
    expect(withBiome.fluidCells).toEqual(plain.fluidCells);
  });

  it('is deterministic for a seed', () => {
    const biomes = [biome('rich', { blockPalette: { weights: { SILVERIUM: 4 } } })];
    const a = make(5, biomes);
    const b = make(5, biomes);
    expect(types(a.grid)).toEqual(types(b.grid));
    expect(Array.from(a.biomeField.primaryGrid())).toEqual(Array.from(b.biomeField.primaryGrid()));
  });

  it('exposes the biome of every cell', () => {
    const { biomeField, grid } = make(7, [biome('rich')]);
    expect(biomeField.hasBiomes).toBe(true);
    expect(biomeField.primaryGrid()).toHaveLength(grid.length * grid[0].length);
  });

  it('a biome that wants more of an ore gets more of it than the rest of the map', () => {
    let rich = 0;
    let richDirt = 0;
    let other = 0;
    let otherDirt = 0;
    for (const seed of [8, 9, 10, 11, 12, 13]) {
      const { grid, biomeField } = make(seed, [biome('rich', { blockPalette: { weights: { SILVERIUM: 8 } } })]);
      const index = biomeField.biomes.findIndex((b) => b.key === 'rich');
      grid.forEach((row, y) =>
        row.forEach((tile, x) => {
          const inRich = biomeField.weightsAt(x, y)[index] > 0.5;
          const isOre = tile.type === MiningTileType.SILVERIUM;
          const isDirt = tile.type === MiningTileType.DIRT || isOre;
          if (inRich) { if (isOre) rich++; if (isDirt) richDirt++; } else { if (isOre) other++; if (isDirt) otherDirt++; }
        })
      );
    }
    expect(rich / richDirt).toBeGreaterThan((other / otherDirt) * 1.5);
  });

  it('a biome that wants none of a block has none of it', () => {
    const { grid, biomeField } = make(9, [biome('barren', { weight: 3, blockPalette: { weights: { ROCK: 0 } } })], { rockPercentage: 12 });
    const barren = biomeField.biomes.findIndex((b) => b.key === 'barren');
    const pure = (x: number, y: number) => biomeField.weightsAt(x, y)[barren] > 0.999;
    expect(count(grid, MiningTileType.ROCK, pure)).toBe(0);
    expect(count(grid, MiningTileType.ROCK)).toBeGreaterThan(0);
  });

  it('fluid weights decide where pockets go: a biome with weight 0 gets (almost) none', () => {
    let pocketShare = 0;
    let pockets = 0;
    let mapShare = 0;
    let cells = 0;
    for (const seed of [10, 11, 12, 13]) {
      const { fluidCells, biomeField } = make(seed, [biome('dry', { fluidWeights: { OIL: 0 } })], {}, [oil]);
      const index = biomeField.biomes.findIndex((b) => b.key === 'dry');
      for (const cell of fluidCells) { pocketShare += biomeField.weightsAt(cell.x, cell.y)[index]; pockets++; }
      for (let y = 8; y < 90; y += 2) for (let x = 0; x < 90; x += 2) { mapShare += biomeField.weightsAt(x, y)[index]; cells++; }
    }
    expect(pockets).toBeGreaterThan(0);
    expect(pocketShare / pockets).toBeLessThan((mapShare / cells) * 0.5);
  });

  it('swaps base blocks inside the biome and nowhere outside it', () => {
    const icy = biome('icy', { weight: 2, blockPalette: { swaps: [{ from: 'DIRT', to: 'LAVAROCK' }] } });
    const { grid, biomeField } = make(12, [icy]);
    const index = biomeField.biomes.findIndex((b) => b.key === 'icy');
    let swappedInside = 0;
    grid.forEach((row, y) =>
      row.forEach((tile, x) => {
        const share = biomeField.weightsAt(x, y)[index];
        if (tile.type === MiningTileType.LAVAROCK) {
          expect(share).toBeGreaterThan(0);
          swappedInside++;
        }
        if (share === 0) expect(tile.type).not.toBe(MiningTileType.LAVAROCK);
      })
    );
    expect(swappedInside).toBeGreaterThan(0);
  });

  it('a swap with a chance swaps about that share', () => {
    const icy = biome('icy', { weight: 1000, blockPalette: { swaps: [{ from: 'DIRT', to: 'LAVAROCK', chance: 0.5 }] } });
    const { grid } = make(13, [icy]);
    const dirt = count(grid, MiningTileType.DIRT);
    const lava = count(grid, MiningTileType.LAVAROCK);
    expect(lava / (dirt + lava)).toBeGreaterThan(0.35);
    expect(lava / (dirt + lava)).toBeLessThan(0.65);
  });

  it('a swap to an unknown block is ignored', () => {
    const odd = biome('odd', { weight: 1000, blockPalette: { swaps: [{ from: 'DIRT', to: 'NOT_A_BLOCK' }] } });
    expect(types(make(14, [odd]).grid)).toEqual(types(make(14, []).grid));
  });

  it('keeps the ground row solid dirt and the exit clear with biomes in play', () => {
    const { grid } = make(15, [biome('rich', { blockPalette: { weights: { SILVERIUM: 5, ROCK: 3 } } })]);
    for (const tile of grid[0]) expect(tile.type).toBe(MiningTileType.DIRT);
  });

  it('generates a 135x135 map with biomes quickly', () => {
    const start = performance.now();
    make(16, [biome('a', { blockPalette: { weights: { ROCK: 2 } } }), biome('b', { minDepth: 30, fluidWeights: { OIL: 2 } }), biome('c', { minDepth: 60 })], { gridWidth: 135, gridHeight: 135 }, [oil]);
    expect(performance.now() - start).toBeLessThan(3000);
  });

  it('uses only the biomes a map lists, at the map\'s weights', () => {
    const biomes = [biome('rich', { blockPalette: { weights: { SILVERIUM: 4 } } }), biome('poor', { blockPalette: { weights: { SILVERIUM: 0 } } })];
    const all = make(9, biomes);
    expect(all.biomeField.biomes.map((b) => b.key)).toEqual(['default', 'poor', 'rich']);
    const only = make(9, biomes, { biomeWeights: { rich: 2 } });
    expect(only.biomeField.biomes.map((b) => b.key)).toEqual(['default', 'rich']);
    expect(only.biomeField.biomes.find((b) => b.key === 'rich')!.weight).toBe(2);
  });

  it('a map that lists no biomes is generated as before', () => {
    const biomes = [biome('rich', { blockPalette: { weights: { SILVERIUM: 4 } } })];
    expect(types(make(9, biomes, { biomeWeights: null }).grid)).toEqual(types(make(9, biomes).grid));
  });

  it('a biome swap can put the basic terrain blocks (stone, clay, sandstone...) in the mine', () => {
    for (const key of ['STONE', 'CLAY', 'SANDSTONE', 'GRAVEL', 'ICE', 'BEDROCK'] as const) {
      const { grid } = make(3, [biome('b', { isDefault: true, blockPalette: { swaps: [{ from: 'DIRT', to: key }] } })]);
      expect(count(grid, MiningTileType[key])).toBeGreaterThan(100);
      expect(count(grid, MiningTileType.DIRT)).toBe(0);
    }
  });
});
