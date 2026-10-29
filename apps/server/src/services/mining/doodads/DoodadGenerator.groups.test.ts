import { describe, it, expect } from 'vitest';
import {
  BiomeField,
  MiningTileType,
  doodadRect,
  doodadRectCells,
  doodadSupportCells,
  isTileSolid,
  orderDoodads,
  type BiomeDefinition,
  type DoodadDefinition,
  type DoodadPlacement,
  type DoodadRect,
  type DoodadSpawnRules,
} from '@mine-me/shared';
import { createSeededRng } from '../../miningMap.service';
import { blockKeyForTileType } from '../subsystems/MiningDataManager';
import { DOODAD_SEED_SALT, generateDoodadPlacements, type DoodadGenerationInput } from './DoodadGenerator';
import { LEGACY_DOODAD_SEED_SALT, legacyGenerateDoodadPlacements } from './legacyDoodadGenerator.testutil';

const biome = (key: string, isDefault = false): BiomeDefinition => ({ id: key, key, name: key, isDefault, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 45 });

const doodad = (key: string, over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({
  id: key, key, name: key, anchor: 'FLOOR', width: 1, height: 1, zOffset: 0,
  biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 1, density: 1 }],
  ...over,
});

/** A wide, shallow cave: one block thick walls all round, row 0 the surface. Lots of flat floor. */
const flatCave = (width = 100, height = 14) =>
  Array.from({ length: height }, (_, y) => (y === 0 || y === height - 1 ? Array(width).fill(MiningTileType.DIRT) : [MiningTileType.DIRT, ...Array(width - 2).fill(MiningTileType.EMPTY), MiningTileType.DIRT]))
    .map((row) => row.map((type) => ({ type })));

/** A lumpy cave from seeded noise, so floors, ceilings and walls all have steps. */
const lumpyCave = (seed: number, width = 80, height = 50) => {
  const rng = createSeededRng(seed);
  const solid = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => y === 0 || y === height - 1 || x === 0 || x === width - 1 || rng() < 0.42));
  for (let pass = 0; pass < 3; pass++) {
    const next = solid.map((row) => [...row]);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && solid[y + dy][x + dx]) n++;
      next[y][x] = n >= 5;
    }
    for (let y = 0; y < height; y++) solid[y] = next[y];
  }
  return solid.map((row, y) => row.map((s) => ({ type: s ? (y % 7 === 0 ? MiningTileType.ROCK : MiningTileType.DIRT) : MiningTileType.EMPTY })));
};

type Grid = ReturnType<typeof flatCave>;

const input = (grid: Grid, doodads: DoodadDefinition[], seed: number, over: Partial<DoodadGenerationInput> = {}, salt = DOODAD_SEED_SALT): DoodadGenerationInput => ({
  grid,
  biomeField: new BiomeField(seed, [biome('default', true)], 0.15, grid[0].length, grid.length),
  doodads,
  fluidCells: [],
  gasCells: [],
  rng: createSeededRng(seed ^ salt),
  maxCount: 5000,
  entranceX: Math.floor(grid[0].length / 2),
  blockKeyOf: blockKeyForTileType,
  ...over,
});

const run = (grid: Grid, doodads: DoodadDefinition[], seed = 7, over: Partial<DoodadGenerationInput> = {}) => generateDoodadPlacements(input(grid, doodads, seed, over));

const group = (spawn: DoodadSpawnRules): DoodadSpawnRules => ({ groupChance: 1, groupSizeMin: 6, groupSizeMax: 6, groupSpread: 8, groupFill: 1, ...spawn });

const keyOf = (doodads: DoodadDefinition[], p: DoodadPlacement) => orderDoodads(doodads)[p.typeIndex].key;
const rectsOf = (doodads: DoodadDefinition[], placements: DoodadPlacement[], key: string): DoodadRect[] =>
  placements.filter((p) => keyOf(doodads, p) === key).map((p) => doodadRect(orderDoodads(doodads)[p.typeIndex], p));
const gap = (a: DoodadRect, b: DoodadRect) => Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)), Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
/** The mean distance from each to its nearest neighbour: small when they sit in groups. */
const meanNearest = (rects: DoodadRect[]) => rects.reduce((sum, r) => sum + Math.min(...rects.filter((o) => o !== r).map((o) => gap(r, o))), 0) / rects.length;

describe('a doodad with no group settings', () => {
  const kinds = (): DoodadDefinition[] => [
    doodad('moss', { anchor: 'WALL', width: 1, height: 3, biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 4, density: 1 }] }),
    doodad('mushroom', { width: 2, height: 2, sizeVariants: [{ width: 2, height: 2, weight: 3 }, { width: 3, height: 3, weight: 1 }], spawn: { minSpacing: 4, minDepth: 3 }, biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 5, density: 1 }] }),
    doodad('stalactite', { anchor: 'CEILING', width: 1, height: 2, spawn: { blocks: ['DIRT'], minSpacing: 2 }, biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 3, density: 1 }] }),
    doodad('firefly', { anchor: 'AIR', spawn: { darkOnly: true, groupChance: 0 }, biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 2, density: 1 }] }),
    doodad('grass', { biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 6, density: 1 }] }),
  ];

  it('places exactly what the generator did before groups, for several seeds and maps', () => {
    for (const seed of [1, 2, 3, 11, 97]) {
      for (const grid of [lumpyCave(seed), flatCave(60, 20)]) {
        const now = generateDoodadPlacements(input(grid, kinds(), seed));
        const before = legacyGenerateDoodadPlacements(input(grid, kinds(), seed, {}, LEGACY_DOODAD_SEED_SALT));
        expect(now.length, `seed ${seed}`).toBeGreaterThan(20);
        expect(now).toEqual(before);
      }
    }
  });

  it('also matches when it is capped, and when the settings are present but switched off', () => {
    const off = kinds().map((d) => ({ ...d, spawn: { ...d.spawn, groupChance: 0, groupSizeMin: 9, groupFill: 1, groupSpread: 20, maxCount: null } }));
    for (const seed of [5, 6]) {
      const grid = lumpyCave(seed);
      expect(generateDoodadPlacements(input(grid, off, seed, { maxCount: 40 }))).toEqual(legacyGenerateDoodadPlacements(input(grid, kinds(), seed, { maxCount: 40 }, LEGACY_DOODAD_SEED_SALT)));
    }
  });
});

describe('doodads in groups', () => {
  const grass = (spawn: DoodadSpawnRules = {}, weight = 8) => doodad('grass', { spawn: group(spawn), biomes: [{ biomeId: 'default', biomeKey: 'default', weight, density: 1 }] });
  const plain = (weight = 8) => doodad('grass', { biomes: [{ biomeId: 'default', biomeKey: 'default', weight, density: 1 }] });

  it('is the same for the same seed and differs for another', () => {
    const grid = lumpyCave(3);
    const a = run(grid, [grass()], 5);
    expect(a.length).toBeGreaterThan(10);
    expect(run(grid, [grass()], 5)).toEqual(a);
    expect(run(grid, [grass()], 6)).not.toEqual(a);
  });

  it('sits much closer together than the same kind scattered', () => {
    const grid = flatCave(160, 12);
    const grouped = rectsOf([grass()], run(grid, [grass()], 4), 'grass');
    const scattered = rectsOf([plain()], run(grid, [plain()], 4), 'grass');
    expect(grouped.length).toBeGreaterThan(30);
    expect(scattered.length).toBeGreaterThan(30);
    expect(meanNearest(grouped)).toBeLessThan(meanNearest(scattered) / 2);
  });

  it('keeps the kind\'s overall amount near what a plain scatter gives', () => {
    const grid = flatCave(300, 12);
    let grouped = 0;
    let scattered = 0;
    for (const seed of [1, 2, 3, 4]) {
      grouped += run(grid, [grass({ groupFill: 1, groupSpread: 10, groupSizeMin: 5, groupSizeMax: 5 })], seed).length;
      scattered += run(grid, [plain()], seed).length;
    }
    expect(grouped).toBeGreaterThan(scattered * 0.6);
    expect(grouped).toBeLessThan(scattered * 1.4);
  });

  it('puts everything on solid ground in open air, whatever the surface, and never overlaps', () => {
    const doodads = [
      grass({}, 10),
      doodad('stalactite', { anchor: 'CEILING', width: 1, height: 2, spawn: group({ blocks: ['DIRT'] }), biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 10, density: 1 }] }),
      doodad('moss', { anchor: 'WALL', width: 1, height: 2, spawn: group({}), biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 10, density: 1 }] }),
      doodad('fly', { anchor: 'AIR', spawn: group({ groupChance: 0.5 }), biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 10, density: 1 }] }),
    ];
    const grid = lumpyCave(8);
    const placements = run(grid, doodads, 9);
    const ordered = orderDoodads(doodads);
    const seen = new Set<string>();
    const kinds = new Set<string>();
    for (const p of placements) {
      const def = ordered[p.typeIndex];
      kinds.add(def.key);
      const rect = doodadRect(def, p);
      for (const c of doodadRectCells(rect)) {
        expect(grid[c.y][c.x].type, `${def.key} cell`).toBe(MiningTileType.EMPTY);
        expect(seen.has(`${c.x},${c.y}`), 'no overlap').toBe(false);
        seen.add(`${c.x},${c.y}`);
      }
      if (def.anchor !== 'AIR') for (const c of doodadSupportCells(def.anchor, rect, p.flip)) expect(isTileSolid(grid[c.y][c.x].type), `${def.key} support`).toBe(true);
    }
    expect([...kinds].sort()).toEqual(['fly', 'grass', 'moss', 'stalactite']);
  });

  it('fills more of the floor when the fill is high than when it is low', () => {
    const grid = flatCave(200, 12);
    const high = run(grid, [grass({ groupFill: 1, groupSizeMin: 30, groupSizeMax: 30, groupSpread: 14 })], 2).length;
    const low = run(grid, [grass({ groupFill: 0.2, groupSizeMin: 30, groupSizeMax: 30, groupSpread: 14 })], 2).length;
    expect(high).toBeGreaterThan(low * 1.5);
  });

  it('makes a meadow: a big, full group is a long unbroken run of grass', () => {
    const grid = flatCave(300, 12);
    const rects = rectsOf([grass()], run(grid, [grass({ groupSizeMin: 40, groupSizeMax: 40, groupSpread: 20, groupFill: 1, groupChance: 1 }, 12)], 6), 'grass').sort((a, b) => a.x - b.x);
    expect(rects.length).toBeGreaterThan(40);
    let longest = 1;
    let current = 1;
    for (let i = 1; i < rects.length; i++) {
      current = rects[i].x - rects[i - 1].x <= 1 ? current + 1 : 1;
      longest = Math.max(longest, current);
    }
    expect(longest).toBeGreaterThanOrEqual(12);
  });

  it('gives a denser biome more, and a biome without the link none', () => {
    const grid = flatCave(160, 12);
    const withDensity = (density: number) => doodad('grass', { spawn: group({ groupFill: 0.5 }), biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 6, density }] });
    expect(run(grid, [withDensity(3)], 3).length).toBeGreaterThan(run(grid, [withDensity(1)], 3).length * 1.5);
    expect(run(grid, [doodad('grass', { spawn: group({}), biomes: [] })], 3)).toEqual([]);
  });

  it('keeps minSpacing for lone ones and between groups but not inside a group', () => {
    const grid = flatCave(140, 12);
    const spaced = (spawn: DoodadSpawnRules) => doodad('grass', { spawn, biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 8, density: 1 }] });
    const lone = rectsOf([spaced({ minSpacing: 5 })], run(grid, [spaced({ minSpacing: 5 })], 3), 'grass');
    let closest = Infinity;
    for (const a of lone) for (const b of lone) if (a !== b) closest = Math.min(closest, gap(a, b));
    expect(closest).toBeGreaterThanOrEqual(5);
    const members = rectsOf([spaced({})], run(grid, [spaced(group({ minSpacing: 5 }))], 3), 'grass');
    let touching = 0;
    for (const a of members) for (const b of members) if (a !== b && gap(a, b) < 5) touching++;
    expect(touching).toBeGreaterThan(10);
  });

  it('keeps members apart by the member spacing', () => {
    const grid = flatCave(400, 12);
    const kind = (memberSpacing: number) => doodad('grass', { spawn: group({ memberSpacing }), biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 3, density: 1 }] });
    const closest = (memberSpacing: number) => {
      const rects = rectsOf([kind(memberSpacing)], run(grid, [kind(memberSpacing)], 3), 'grass');
      expect(rects.length).toBeGreaterThan(8);
      let least = Infinity;
      for (const a of rects) for (const b of rects) if (a !== b) least = Math.min(least, gap(a, b));
      return least;
    };
    expect(closest(0)).toBe(0);
    expect(closest(2)).toBeGreaterThanOrEqual(2);
  });

  it('holds each kind to its own limit so one cannot use up the budget', () => {
    const grid = flatCave(200, 12);
    const doodads = [
      grass({ maxCount: 25 }, 10),
      doodad('mushroom', { spawn: group({ groupSizeMin: 3, groupSizeMax: 3 }), biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 8, density: 1 }] }),
    ];
    const placements = run(grid, doodads, 5);
    const counts = (key: string) => placements.filter((p) => keyOf(doodads, p) === key).length;
    expect(counts('grass')).toBe(25);
    expect(counts('mushroom')).toBeGreaterThan(10);
  });

  it('stops at the overall cap', () => {
    const grid = flatCave(200, 12);
    expect(run(grid, [grass({}, 10)], 5, { maxCount: 37 })).toHaveLength(37);
    expect(run(grid, [grass({}, 10)], 5, { maxCount: 0 })).toEqual([]);
  });

  it('keeps the entrance clear and out of fluid, like a lone doodad', () => {
    // Four open rows over the floor: all inside the rows the entrance keeps clear
    const grid = flatCave(60, 6);
    const fluid = Array.from({ length: 10 }, (_, i) => ({ x: 10 + i, y: 4, typeKey: 'WATER' }));
    const placements = run(grid, [grass({ groupSpread: 30, groupSizeMin: 40, groupSizeMax: 40 }, 40)], 2, { entranceX: 30, fluidCells: fluid });
    expect(placements.length).toBeGreaterThan(10);
    for (const p of placements) {
      expect(p.x >= 10 && p.x < 20, 'not in the fluid').toBe(false);
      expect(p.x >= 27 && p.x <= 33, 'not at the entrance').toBe(false);
    }
  });
});
