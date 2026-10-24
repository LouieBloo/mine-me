import { describe, it, expect } from 'vitest';
import { MiningTileType, isTileSolid, type BiomeDefinition, type FluidDefinition, type GasDefinition } from '@mine-me/shared';
import { buildSandboxMap } from './SandboxMapBuilder';
import { createDefaultSandboxLayout, SANDBOX_BLOCK_SCALE, SANDBOX_SKY_ROWS, type SandboxLayout } from './SandboxLayout';
import { BLOCK_TILE_TYPES } from '../subsystems/MiningDataManager';

const SKY = SANDBOX_SKY_ROWS;
/** The layout is drawn in old-size blocks; this many small blocks make one. */
const S = SANDBOX_BLOCK_SCALE;
const fluid = (typeKey: string) => ({ typeKey }) as FluidDefinition;
const gas = (typeKey: string) => ({ typeKey }) as GasDefinition;
const build = (fluids: FluidDefinition[] = [fluid('LAVA'), fluid('OIL'), fluid('WATER')], gases: GasDefinition[] = [gas('HYDROGEN'), gas('NITROGEN')]) =>
  buildSandboxMap(createDefaultSandboxLayout(BLOCK_TILE_TYPES), fluids, gases);
/** A tile by surface-relative coordinates (y = 0 is the ground; negative is sky). */
const at = (grid: ReturnType<typeof build>['grid'], x: number, y: number) => grid[y + SKY][x];

describe('the default sandbox map', () => {
  it('is 105 by 30 original blocks under open sky, fully revealed (no fog of war)', () => {
    const { grid, surfaceRow } = build();
    expect(grid).toHaveLength(30 * S + SKY);
    expect(grid.every((row) => row.length === 105 * S)).toBe(true);
    expect(grid.flat().every((t) => t.revealed)).toBe(true);
    expect(surfaceRow).toBe(SKY);
  });

  it('has open air all the way up through the sky rows', () => {
    const { grid } = build();
    for (let y = 0; y < SKY; y++) expect(grid[y].every((t) => t.type === MiningTileType.EMPTY)).toBe(true);
    // ...and solid ground directly under it where there is no pool or shaft
    expect(isTileSolid(at(grid, 5 * S, 0).type)).toBe(true);
  });

  it('has a 4x4 patch of every block in a line along the ground, right of the spawn, with its top at ground level', () => {
    const { grid } = build();
    const start = 23 * S;
    BLOCK_TILE_TYPES.forEach((type, i) => {
      for (const [dx, dy] of [[0, 0], [3, 0], [0, 3], [3, 3]]) expect(at(grid, start + i * 4 + dx, dy).type).toBe(type);
      expect(grid[SKY - 1][start + i * 4].type).toBe(MiningTileType.EMPTY); // open air above, so it can be walked on
    });
    // ...and under the patch is the plain ground again
    expect(at(grid, start, 4).type).toBe(MiningTileType.DIRT);
    // The line ends before the first pool
    expect(start + BLOCK_TILE_TYPES.length * 4).toBeLessThanOrEqual(47 * S);
  });

  it('contains dirt, rock and every ore', () => {
    const types = new Set(build().grid.flat().map((t) => t.type));
    for (const t of [MiningTileType.DIRT, MiningTileType.ROCK, MiningTileType.COPPERIUM, MiningTileType.SILVERIUM, MiningTileType.LADDER]) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('opens the pools onto the surface, filled with oil and water', () => {
    const { grid, fluidCells } = build([fluid('WATER'), fluid('OIL'), fluid('LAVA')]);
    // the ground is open above each pool, solid dirt next to it
    expect(at(grid, 53 * S, 0).type).toBe(MiningTileType.EMPTY);
    expect(at(grid, 65 * S, 0).type).toBe(MiningTileType.EMPTY);
    expect(isTileSolid(at(grid, 30 * S, 0).type)).toBe(true);
    expect(fluidCells.find((c) => c.x === 53 * S && c.y === 5 * S + SKY)?.typeKey).toBe('OIL');
    expect(fluidCells.find((c) => c.x === 65 * S && c.y === 5 * S + SKY)?.typeKey).toBe('WATER');
    expect(fluidCells.find((c) => c.x === 3 * S && c.y === 5 * S + SKY)?.typeKey).toBe('LAVA');
    // fluid starts one tile below the lip, so the ground level and the sky are open air
    expect(fluidCells.some((c) => c.y <= SKY)).toBe(false);
    expect(fluidCells.every((c) => grid[c.y][c.x].type === MiningTileType.EMPTY)).toBe(true);
  });

  it('seals each pool: every fluid cell has solid walls and floor', () => {
    const { grid, fluidCells } = build();
    const fluidAt = new Set(fluidCells.map((c) => `${c.x},${c.y}`));
    for (const c of fluidCells) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        expect(fluidAt.has(`${nx},${ny}`) || isTileSolid(grid[ny][nx].type)).toBe(true);
      }
    }
  });

  it('leaves a pool dry when there is no fluid for it', () => {
    const { fluidCells } = build([fluid('OIL')]);
    expect(fluidCells.length).toBeGreaterThan(0);
    expect(fluidCells.every((c) => c.x >= 47 * S && c.x <= 59 * S - 1)).toBe(true);
    expect(build([fluid('LAVA')]).fluidCells.every((c) => c.x >= 1 * S && c.x <= 5 * S - 1)).toBe(true);
    expect(build([]).fluidCells).toEqual([]);
  });

  it('starts with two dummies standing on the ground', () => {
    const { mobs } = build();
    expect(mobs).toHaveLength(2);
    expect(mobs.every((m) => m.kind === 'surfaceDummy' && m.y === SKY)).toBe(true);
  });

  it('is reachable: a ladder runs from the ground down into the hall', () => {
    const { grid } = build();
    // the ladder is 2 cells wide, one old-size block
    for (const x of [13 * S, 13 * S + 1]) {
      for (let y = 0; y <= 12 * S - 1; y++) expect(at(grid, x, y).type).toBe(MiningTileType.LADDER);
      expect(at(grid, x, 12 * S).type).toBe(MiningTileType.EMPTY);
    }
  });
});

describe('sandbox layouts', () => {
  const base: SandboxLayout = { width: 10, height: 10, skyRows: 3, base: MiningTileType.DIRT, zones: [], mobs: [] };

  it('paints zones in order, later over earlier', () => {
    const { grid } = buildSandboxMap(
      {
        ...base,
        zones: [
          { kind: 'fill', tile: MiningTileType.EMPTY, rect: { x0: 1, y0: 1, x1: 3, y1: 3 } },
          { kind: 'tiles', tile: MiningTileType.ROCK, at: [{ x: 2, y: 2 }] },
        ],
      },
      [],
    );
    expect(at2(grid, 1, 1).type).toBe(MiningTileType.EMPTY);
    expect(at2(grid, 2, 2).type).toBe(MiningTileType.ROCK);
    expect(at2(grid, 5, 5).type).toBe(MiningTileType.DIRT);
  });

  it('puts the sky above the layout and shifts everything by it', () => {
    const { grid, mobs, surfaceRow } = buildSandboxMap({ ...base, mobs: [{ kind: 'surfaceDummy', x: 4.5, y: 0 }] }, []);
    expect(grid).toHaveLength(13);
    expect(surfaceRow).toBe(3);
    expect(grid[2][0].type).toBe(MiningTileType.EMPTY);
    expect(grid[3][0].type).toBe(MiningTileType.DIRT);
    expect(mobs[0].y).toBe(3);
  });

  it('rejects a zone outside the map instead of leaving a hole', () => {
    expect(() =>
      buildSandboxMap({ ...base, zones: [{ kind: 'fill', tile: MiningTileType.EMPTY, rect: { x0: 8, y0: 8, x1: 10, y1: 9 } }] }, []),
    ).toThrow(/outside the 10x10 map/);
    expect(() => buildSandboxMap({ ...base, mobs: [{ kind: 'surfaceDummy', x: 12, y: 0 }] }, [])).toThrow(/outside/);
    expect(() =>
      buildSandboxMap({ ...base, zones: [{ kind: 'fill', tile: MiningTileType.EMPTY, rect: { x0: 5, y0: 1, x1: 2, y1: 3 } }] }, []),
    ).toThrow(/empty rectangle/);
  });
});

/** For the 3-sky-row test layout. */
function at2(grid: ReturnType<typeof build>['grid'], x: number, y: number) {
  return grid[y + 3][x];
}

describe('the sandbox gas chambers', () => {
  const chamber = (cells: ReturnType<typeof build>['gasCells'], key: string) => cells.filter((c) => c.typeKey === key);

  it('puts the first two gases in key order in two chambers: hydrogen on the left, nitrogen on the right', () => {
    const { gasCells } = build([], [gas('NITROGEN'), gas('HYDROGEN')]);
    const hydrogen = chamber(gasCells, 'HYDROGEN');
    const nitrogen = chamber(gasCells, 'NITROGEN');
    expect(hydrogen.length).toBe(8 * 6 * S * S);
    expect(nitrogen.length).toBe(8 * 6 * S * S);
    expect(Math.max(...hydrogen.map((c) => c.x))).toBeLessThan(Math.min(...nitrogen.map((c) => c.x)));
    for (const c of gasCells) expect(c.concentration).toBe(1);
  });

  it('seals each chamber in solid ground, under a roof two blocks thick that can be mined through', () => {
    const { grid, gasCells } = build();
    const inChamber = new Set(gasCells.map((c) => `${c.x},${c.y}`));
    for (const c of gasCells) {
      expect(grid[c.y][c.x].type).toBe(MiningTileType.EMPTY);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (inChamber.has(`${c.x + dx},${c.y + dy}`)) continue;
        expect(isTileSolid(grid[c.y + dy][c.x + dx].type)).toBe(true);
      }
    }
    // The roof over the hydrogen: two old-size blocks of plain dirt (four rows), with open sky above them
    for (let y = 0; y < 2 * S; y++) expect(at(grid, 78 * S, y).type).toBe(MiningTileType.DIRT);
    expect(grid[SKY - 1][78 * S].type).toBe(MiningTileType.EMPTY);
  });

  it('leaves a chamber empty when there is no gas for its slot, and all of them when there are no gases', () => {
    const one = build([], [gas('HYDROGEN')]);
    expect(chamber(one.gasCells, 'HYDROGEN').length).toBe(48 * S * S);
    expect(one.gasCells.length).toBe(48 * S * S);
    const none = build([], []);
    expect(none.gasCells).toEqual([]);
    // The chambers are still carved out, just empty
    expect(at(none.grid, 78 * S, 4 * S).type).toBe(MiningTileType.EMPTY);
  });

  it('does not touch the pools', () => {
    expect(build().fluidCells).toEqual(build(undefined, []).fluidCells);
  });
});

describe('the sandbox biomes (ticket 142)', () => {
  const biome = (key: string, minDepth: number, extra: Partial<BiomeDefinition> = {}): BiomeDefinition => ({
    id: key, key, name: key, isDefault: false, minDepth, maxDepth: null, weight: 1, noiseScale: 45, ...extra,
  });
  const biomes = [
    biome('default', 0, { isDefault: true }),
    biome('icy', 10, { blockPalette: { swaps: [{ from: 'DIRT', to: 'ICE', chance: 1 }] } }),
    biome('clayey', 20, { blockPalette: { swaps: [{ from: 'DIRT', to: 'CLAY', chance: 0.5 }] } }),
  ];
  const withBiomes = () => buildSandboxMap(createDefaultSandboxLayout(BLOCK_TILE_TYPES), [fluid('WATER')], [], biomes);
  const width = 105 * S;
  const cols = (field: NonNullable<ReturnType<typeof withBiomes>['biomeField']>) => (k: number) => Math.round(field.bandStart(k));

  it('is the same map as before when there are no biomes', () => {
    expect(withBiomes().grid).not.toEqual(build().grid);
    const none = buildSandboxMap(createDefaultSandboxLayout(BLOCK_TILE_TYPES), [fluid('WATER')], [], []);
    expect(none.biomeField).toBeUndefined();
    expect(none.grid).toEqual(buildSandboxMap(createDefaultSandboxLayout(BLOCK_TILE_TYPES), [fluid('WATER')]).grid);
  });

  it('puts the biomes in bands along the whole map: the default first, then by the depth they start at', () => {
    const { biomeField } = withBiomes();
    expect(biomeField).toBeDefined();
    const names = (x: number) => biomeField!.biomes[biomeField!.primaryAt(x, SKY + 20)].key;
    expect([names(5), names(width / 2), names(width - 5)]).toEqual(['default', 'icy', 'clayey']);
    // ...and the sky above is the default everywhere
    expect(biomeField!.biomes[biomeField!.primaryAt(width - 5, 3)].key).toBe('default');
  });

  it('swaps the ground by the band it is in, mixing across the border and keeping the hand-built parts', () => {
    const map = withBiomes();
    const start = cols(map.biomeField!);
    const count = (x0: number, x1: number, type: MiningTileType) => {
      let n = 0;
      for (let x = x0; x < x1; x++) for (let y = 26 * S; y < 28 * S; y++) if (at(map.grid, x, y).type === type) n++;
      return n;
    };
    // Deep in the default band nothing changes; deep in the icy band all the dirt is ice
    expect(count(0, 10, MiningTileType.ICE)).toBe(0);
    const mid = Math.round((start(1) + start(2)) / 2);
    expect(count(mid - 5, mid + 5, MiningTileType.ICE)).toBe(10 * 2 * S);
    // On the border the ice thins out between the two bands
    const border = count(start(1) - 2, start(1) + 2, MiningTileType.ICE);
    expect(border).toBeGreaterThan(0);
    expect(border).toBeLessThan(4 * 2 * S);
    // The hall, the pools and the block patches are painted after the swaps, so they are as drawn
    const plain = build().grid;
    for (const [x, y] of [[40 * S, 13 * S], [53 * S, 3 * S], [23 * S, 0], [23 * S + 5, 2]]) expect(at(map.grid, x, y).type).toBe(at(plain, x, y).type);
  });

  it('is deterministic', () => {
    expect(withBiomes().grid).toEqual(withBiomes().grid);
  });
});
