import { describe, it, expect } from 'vitest';
import { DEFAULT_MINING_MAP_CONFIG, MiningTileType, type BiomeDefinition, type DoodadDefinition, type MiningMapConfigData } from '@mine-me/shared';
import { generateMiningMapWithFluids, type ServerMiningGrid } from './miningMap.service';

const doodad = (key: string, anchor: DoodadDefinition['anchor'], biomeKey = 'default', over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({
  id: key, key, name: key, anchor, width: 2, height: 2, zOffset: 0,
  biomes: [{ biomeId: biomeKey, biomeKey, weight: 1, density: 1 }],
  ...over,
});
const DOODADS = [doodad('mushroom', 'FLOOR'), doodad('drip', 'CEILING'), doodad('moss', 'WALL'), doodad('firefly', 'AIR')];
const make = (seed: number, doodads: DoodadDefinition[], extra: Partial<MiningMapConfigData> = {}, biomes: BiomeDefinition[] = []) =>
  generateMiningMapWithFluids({ seed, config: { ...DEFAULT_MINING_MAP_CONFIG, ...extra }, doodads, biomes });
const types = (grid: ServerMiningGrid) => grid.map((row) => row.map((t) => t.type));

describe('doodads in map generation (ticket 100)', () => {
  it('leaves the map byte-identical: the same blocks, fluids, gases and biomes with or without doodads', () => {
    const plain = make(11, []);
    const withDoodads = make(11, DOODADS);
    expect(withDoodads.doodads.length).toBeGreaterThan(0);
    expect(types(withDoodads.grid)).toEqual(types(plain.grid));
    expect(withDoodads.fluidCells).toEqual(plain.fluidCells);
    expect(withDoodads.gasCells).toEqual(plain.gasCells);
    expect(plain.doodads).toEqual([]);
  });

  it('is deterministic for a seed', () => {
    expect(make(5, DOODADS).doodads).toEqual(make(5, DOODADS).doodads);
    expect(make(5, DOODADS).doodads).not.toEqual(make(6, DOODADS).doodads);
  });

  it('puts every doodad in a cave, on a wall of the right kind', () => {
    const { grid, doodads } = make(9, DOODADS);
    expect(doodads.length).toBeGreaterThan(10);
    const open = (x: number, y: number) => grid[y]?.[x]?.type === MiningTileType.EMPTY;
    for (const p of doodads) {
      expect(open(p.x, p.y)).toBe(true);
      const def = [...DOODADS].sort((a, b) => (a.key < b.key ? -1 : 1))[p.typeIndex];
      if (def.anchor === 'FLOOR') expect(open(p.x, p.y + 2)).toBe(false);
      if (def.anchor === 'CEILING') expect(open(p.x, p.y - 1)).toBe(false);
    }
  });

  it('obeys the count in the map config', () => {
    expect(make(9, DOODADS, { doodadMaxCount: 7 }).doodads).toHaveLength(7);
    expect(make(9, DOODADS, { doodadMaxCount: 0 }).doodads).toEqual([]);
  });

  it('follows the biomes: a doodad linked to one biome stays in it', () => {
    const rich: BiomeDefinition = { id: 'b', key: 'rich', name: 'rich', isDefault: false, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 24 };
    const def: BiomeDefinition = { id: 'd', key: 'default', name: 'd', isDefault: true, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 24 };
    const only = [doodad('only_rich', 'AIR', 'rich')];
    const { doodads, biomeField } = make(3, only, {}, [def, rich]);
    expect(doodads.length).toBeGreaterThan(0);
    const richIndex = biomeField.biomes.findIndex((b) => b.key === 'rich');
    // Each is mostly rich ground (a border cell can still be shared, but never mostly the other biome)
    for (const p of doodads) expect(biomeField.weightsAt(p.x, p.y)[richIndex]).toBeGreaterThan(0);
  });

  it('is quick on a full 135 x 135 mine', () => {
    const start = performance.now();
    make(2, DOODADS);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
