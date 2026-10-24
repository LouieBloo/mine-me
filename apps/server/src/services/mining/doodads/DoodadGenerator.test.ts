import { describe, it, expect } from 'vitest';
import {
  BandBiomeField,
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
} from '@mine-me/shared';
import { createSeededRng } from '../../miningMap.service';
import { blockKeyForTileType } from '../subsystems/MiningDataManager';
import { DOODAD_ENTRANCE_CLEAR_RADIUS, DOODAD_SEED_SALT, generateDoodadPlacements, type DoodadGenerationInput } from './DoodadGenerator';

const biome = (key: string, isDefault = false): BiomeDefinition => ({ id: key, key, name: key, isDefault, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 45 });

const doodad = (key: string, over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({
  id: key, key, name: key, anchor: 'FLOOR', width: 1, height: 1, zOffset: 0,
  // Always chosen where it fits: weight x density x base chance reaches 1
  biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 100, density: 1 }],
  ...over,
});

/** A grid from text: '#' dirt, '.' open air, 'R' rock, 'S' silverium. */
const gridOf = (rows: string[]) =>
  rows.map((row) => [...row].map((c) => ({ type: c === '#' ? MiningTileType.DIRT : c === 'R' ? MiningTileType.ROCK : c === 'S' ? MiningTileType.SILVERIUM : MiningTileType.EMPTY })));

/** A big open cave, one block thick walls all round, 40 wide and 30 deep (row 0 is the surface). */
const cave = (width = 40, height = 30) =>
  Array.from({ length: height }, (_, y) => (y === 0 || y === height - 1 ? '#'.repeat(width) : `#${'.'.repeat(width - 2)}#`));

const run = (over: Partial<DoodadGenerationInput> & { doodads: DoodadDefinition[] }, seed = 7) =>
  generateDoodadPlacements({
    grid: gridOf(cave()),
    biomeField: new BiomeField(seed, [biome('default', true)], 0.15, 40, 30),
    fluidCells: [],
    gasCells: [],
    rng: createSeededRng(seed ^ DOODAD_SEED_SALT),
    maxCount: 1000,
    entranceX: 20,
    blockKeyOf: blockKeyForTileType,
    ...over,
  });

const isOpen = (grid: ReturnType<typeof gridOf>, x: number, y: number) => grid[y]?.[x]?.type === MiningTileType.EMPTY;
const isSolidAt = (grid: ReturnType<typeof gridOf>, x: number, y: number) => y >= 0 && y < grid.length && x >= 0 && x < grid[0].length && isTileSolid(grid[y][x].type);

/** Checks a result against the rules, whatever the doodads are. */
function expectValid(placements: DoodadPlacement[], doodads: DoodadDefinition[], grid: ReturnType<typeof gridOf>): void {
  const ordered = orderDoodads(doodads);
  const seen = new Set<string>();
  for (const p of placements) {
    const def = ordered[p.typeIndex];
    const rect = doodadRect(def, p);
    for (const c of doodadRectCells(rect)) {
      expect(isOpen(grid, c.x, c.y), `${def.key} at ${c.x},${c.y} is in open air`).toBe(true);
      expect(seen.has(`${c.x},${c.y}`), `no overlap at ${c.x},${c.y}`).toBe(false);
      seen.add(`${c.x},${c.y}`);
    }
    if (def.anchor === 'AIR') {
      for (let dy = -1; dy <= rect.height; dy++) for (let dx = -1; dx <= rect.width; dx++) expect(isSolidAt(grid, rect.x + dx, rect.y + dy)).toBe(false);
    } else {
      for (const c of doodadSupportCells(def.anchor, rect, p.flip)) expect(isSolidAt(grid, c.x, c.y), `${def.anchor} support at ${c.x},${c.y}`).toBe(true);
    }
  }
}

describe('generateDoodadPlacements', () => {
  it('places nothing without doodads, with a count of 0, or for a doodad that is in no biome', () => {
    expect(run({ doodads: [] })).toEqual([]);
    expect(run({ doodads: [doodad('a')], maxCount: 0 })).toEqual([]);
    expect(run({ doodads: [doodad('a', { biomes: [] })] })).toEqual([]);
    expect(run({ doodads: [doodad('a', { biomes: [{ biomeId: 'x', biomeKey: 'other', weight: 5, density: 5 }] })] })).toEqual([]);
  });

  it('uses no random numbers when there is nothing to place, so nothing else can shift', () => {
    let draws = 0;
    const rng = () => (draws++, 0.5);
    run({ doodads: [], rng });
    run({ doodads: [doodad('a')], maxCount: 0, rng });
    expect(draws).toBe(0);
  });

  it('is the same for the same seed and different for another', () => {
    const doodads = [doodad('a', { biomes: [{ biomeId: 'default', biomeKey: 'default', weight: 1, density: 1 }] })];
    expect(run({ doodads }, 3)).toEqual(run({ doodads }, 3));
    expect(run({ doodads }, 3)).not.toEqual(run({ doodads }, 4));
    expect(run({ doodads }, 3).length).toBeGreaterThan(0);
  });

  it('stands FLOOR doodads on blocks, hangs CEILING ones under blocks, leans WALL ones on a side wall, and keeps AIR ones clear of blocks', () => {
    const doodads = [
      doodad('floor', { anchor: 'FLOOR', width: 2, height: 2 }),
      doodad('ceiling', { anchor: 'CEILING', width: 2, height: 3 }),
      doodad('wall', { anchor: 'WALL', width: 1, height: 3 }),
      doodad('air', { anchor: 'AIR', width: 2, height: 2 }),
    ];
    const grid = gridOf(cave());
    const placements = run({ doodads, maxCount: 400 });
    expectValid(placements, doodads, grid);
    for (const anchor of ['FLOOR', 'CEILING', 'WALL', 'AIR']) {
      expect(placements.some((p) => orderDoodads(doodads)[p.typeIndex].anchor === anchor), anchor).toBe(true);
    }
    // Wall doodads lean on both sides of the cave
    const walls = placements.filter((p) => orderDoodads(doodads)[p.typeIndex].anchor === 'WALL');
    expect(walls.some((p) => p.flip)).toBe(true);
    expect(walls.some((p) => !p.flip)).toBe(true);
  });

  it('needs the whole anchor edge supported: a wide doodad does not hang over a gap', () => {
    // A floor with a hole in it two cells wide
    const rows = cave(20, 12);
    rows[10] = '#########..#########'.slice(0, 20);
    rows[11] = '#'.repeat(20);
    const grid = gridOf(rows);
    const doodads = [doodad('wide', { anchor: 'FLOOR', width: 4, height: 1 })];
    const placements = run({ doodads, grid, biomeField: new BiomeField(1, [biome('default', true)], 0.15, 20, 12), entranceX: 100 });
    expectValid(placements, doodads, grid);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('picks sizes by weight, and every size fits', () => {
    const doodads = [doodad('sized', { anchor: 'FLOOR', sizeVariants: [{ width: 1, height: 1, weight: 1 }, { width: 3, height: 5, weight: 1 }] })];
    const placements = run({ doodads });
    expectValid(placements, doodads, gridOf(cave()));
    expect(new Set(placements.map((p) => p.variant))).toEqual(new Set([0, 1]));
  });

  it('never overlaps: a crowded cave gets doodads that all fit', () => {
    const doodads = [doodad('big', { anchor: 'FLOOR', width: 5, height: 5 }), doodad('small', { anchor: 'FLOOR', width: 1, height: 1 })];
    expectValid(run({ doodads }), doodads, gridOf(cave()));
  });

  it('stops at the count cap, and does not favour the top of the map', () => {
    const doodads = [doodad('a', { anchor: 'FLOOR' })];
    const placements = run({ doodads, maxCount: 10 });
    expect(placements).toHaveLength(10);
    expect(Math.max(...placements.map((p) => p.y))).toBeGreaterThan(0); // (sorted row by row on the way out)
    const ys = run({ doodads, maxCount: 10 }).map((p) => p.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('keeps clear of the entrance', () => {
    const doodads = [doodad('a', { anchor: 'AIR', width: 1, height: 1 }), doodad('b', { anchor: 'CEILING' })];
    const placements = run({ doodads, entranceX: 20 });
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) {
      if (p.y <= 6) expect(Math.abs(p.x - 20)).toBeGreaterThan(DOODAD_ENTRANCE_CLEAR_RADIUS);
    }
  });

  it('only puts a doodad in the biomes it is linked to, by their share', () => {
    // Left half is 'meadow', right half 'default'; the doodad is only in the meadow
    const field = new BandBiomeField([biome('default', true), biome('meadow')], 40, 30, 0, 0);
    const doodads = [doodad('flower', { biomes: [{ biomeId: 'meadow', biomeKey: 'meadow', weight: 100, density: 1 }] })];
    const placements = run({ doodads, biomeField: field });
    expect(placements.length).toBeGreaterThan(5);
    const meadowStart = Math.round(field.bandStart(field.bandOrder.indexOf(field.biomes.findIndex((b) => b.key === 'meadow'))));
    const meadowEnd = meadowStart + 20;
    for (const p of placements) expect(p.x >= meadowStart && p.x < meadowEnd).toBe(true);
  });

  it('scales with the link weight and density', () => {
    const link = (weight: number, density: number) => [{ biomeId: 'default', biomeKey: 'default', weight, density }];
    const air = (weight: number, density: number) => run({ doodads: [doodad('a', { anchor: 'AIR', biomes: link(weight, density) })] }).length;
    const few = air(0.2, 1);
    const many = air(1, 1);
    const manyAgain = air(1, 3);
    expect(few).toBeLessThan(many);
    expect(many).toBeLessThan(manyAgain);
  });

  it('honours the depth window', () => {
    const doodads = [doodad('a', { anchor: 'AIR', spawn: { minDepth: 10, maxDepth: 15 } })];
    const placements = run({ doodads });
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) expect(p.y >= 10 && p.y <= 15).toBe(true);
  });

  it('honours the block rule: only on, under or beside the blocks it may sit on', () => {
    // Floor of silverium on the left half, dirt on the right half
    const rows = cave(40, 12);
    rows[11] = `${'S'.repeat(20)}${'#'.repeat(20)}`;
    const grid = gridOf(rows);
    const doodads = [doodad('crystal', { anchor: 'FLOOR', spawn: { blocks: ['SILVERIUM'] } })];
    const placements = run({ doodads, grid, biomeField: new BiomeField(1, [biome('default', true)], 0.15, 40, 12) });
    const floorOnly = placements.filter((p) => p.y === 10);
    expect(floorOnly.length).toBeGreaterThan(0);
    for (const p of floorOnly) expect(p.x).toBeLessThan(20);
  });

  it('keeps a doodad near fluid or gas when it says so', () => {
    // Wall doodads lean on the cave's side walls, so the fluid and gas sit against them
    const doodads = [doodad('moss', { anchor: 'WALL', spawn: { nearFluids: ['WATER'], nearRadius: 3 } })];
    const fluidCells = [{ x: 2, y: 20, typeKey: 'WATER' }];
    const gasCells = [{ x: 37, y: 10, typeKey: 'HYDROGEN' }];
    const placements = run({ doodads, fluidCells, gasCells });
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) expect(Math.abs(p.x - 2) <= 3 && Math.abs(p.y - 20) <= 3).toBe(true);
    const nearGas = run({ doodads: [doodad('moss', { anchor: 'WALL', spawn: { nearGases: ['HYDROGEN'], nearRadius: 3 } })], fluidCells, gasCells });
    expect(nearGas.length).toBeGreaterThan(0);
    for (const p of nearGas) expect(Math.abs(p.x - 37) <= 3 && Math.abs(p.y - 10) <= 3).toBe(true);
  });

  it('never stands in fluid', () => {
    const fluidCells = Array.from({ length: 6 }, (_, i) => ({ x: 10 + i, y: 28, typeKey: 'WATER' }));
    const placements = run({ doodads: [doodad('a', { anchor: 'FLOOR' })], fluidCells });
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) expect(p.y === 28 && p.x >= 10 && p.x < 16).toBe(false);
  });

  it('keeps its own kind apart when it has a minimum spacing', () => {
    const doodads = [doodad('a', { anchor: 'FLOOR', spawn: { minSpacing: 5 } })];
    const placements = run({ doodads });
    expect(placements.length).toBeGreaterThan(1);
    for (const a of placements) for (const b of placements) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(6);
  });

  it('keeps dark-only doodads out of the shallows', () => {
    const placements = run({ doodads: [doodad('a', { anchor: 'FLOOR', spawn: { darkOnly: true } })] });
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) expect(p.y).toBeGreaterThanOrEqual(12);
  });

  it('does not change the map it reads', () => {
    const grid = gridOf(cave());
    const before = JSON.stringify(grid);
    run({ doodads: [doodad('a')], grid });
    expect(JSON.stringify(grid)).toBe(before);
  });
});
