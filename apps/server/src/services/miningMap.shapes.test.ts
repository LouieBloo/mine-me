import { describe, it, expect } from 'vitest';
import { MiningTileType, isTileSolid, type FluidDefinition, type FluidGeneration } from '@mine-me/shared';
import { generateMiningMapWithFluids } from './miningMap.service';

const fluid = (typeKey: string, generation: FluidGeneration | null): FluidDefinition => ({
  id: `f_${typeKey}`, typeKey, name: typeKey, color: '#000000', opacity: 0.9, density: 1, viscosity: 0.5,
  flowRate: 0.5, minLevel: 0.05, flowThreshold: 0.02, generation,
});
const GEN: FluidGeneration = { minDepth: 4, maxDepth: null, percentage: 6, minSize: 2, maxSize: 4 };
const CONFIG = { gridWidth: 70, gridHeight: 70, cavernDensity: 30 };
const make = (seed: number, fluids: FluidDefinition[]) => generateMiningMapWithFluids({ seed, config: CONFIG, fluids });

type Cell = { x: number; y: number };

/** Splits cells into 4-connected groups. */
function groups(cells: Cell[]): Cell[][] {
  const left = new Map(cells.map((c) => [`${c.x},${c.y}`, c]));
  const out: Cell[][] = [];
  while (left.size > 0) {
    const [firstKey, first] = left.entries().next().value as [string, Cell];
    left.delete(firstKey);
    const group = [first];
    for (let i = 0; i < group.length; i++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${group[i].x + dx},${group[i].y + dy}`;
        const next = left.get(key);
        if (next) {
          left.delete(key);
          group.push(next);
        }
      }
    }
    out.push(group);
  }
  return out;
}

const isBox = (group: Cell[]) => {
  const xs = group.map((c) => c.x);
  const ys = group.map((c) => c.y);
  return (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) === group.length;
};

describe('pocket shapes in map generation', () => {
  it('only squares and rectangles when only those are allowed: every pocket is a filled box', () => {
    for (const seed of [1, 2, 3]) {
      const { fluidCells } = make(seed, [fluid('OIL', { ...GEN, shapes: { SQUARE: 1, RECTANGLE: 1 } })]);
      expect(fluidCells.length).toBeGreaterThan(0);
      for (const g of groups(fluidCells)) expect(isBox(g)).toBe(true);
    }
  });

  it('veins make irregular pockets that are not boxes', () => {
    const { fluidCells } = make(4, [fluid('OIL', { ...GEN, shapes: { VEIN: 1 } })]);
    const all = groups(fluidCells);
    expect(all.length).toBeGreaterThan(3);
    expect(all.filter((g) => !isBox(g)).length).toBeGreaterThan(all.length / 2);
  });

  it('the default mix contains boxes and irregular pockets alike', () => {
    const all = [1, 2, 3, 4, 5].flatMap((seed) => groups(make(seed, [fluid('OIL', GEN)]).fluidCells));
    expect(all.some(isBox)).toBe(true);
    expect(all.some((g) => !isBox(g))).toBe(true);
  });

  it('seals every pocket of every shape: neighbours are the pocket or solid, and each pocket is separate', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { grid, fluidCells } = make(seed, [fluid('OIL', GEN)]);
      const inPocket = new Set(fluidCells.map((c) => `${c.x},${c.y}`));
      for (const c of fluidCells) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (inPocket.has(`${c.x + dx},${c.y + dy}`)) continue;
            const type = grid[c.y + dy]?.[c.x + dx]?.type;
            expect(type !== undefined && isTileSolid(type)).toBe(true);
          }
        }
      }
    }
  });

  it('is the same map for the same seed, and a different one for another', () => {
    const a = make(9, [fluid('OIL', GEN)]).fluidCells;
    expect(make(9, [fluid('OIL', GEN)]).fluidCells).toEqual(a);
    expect(make(10, [fluid('OIL', GEN)]).fluidCells).not.toEqual(a);
  });

  it('applies to every fluid, each with its own shapes', () => {
    const { fluidCells } = make(6, [fluid('LAVA', { ...GEN, minDepth: 20, shapes: { VEIN: 1 } }), fluid('OIL', { ...GEN, shapes: { SQUARE: 1 } })]);
    const lava = fluidCells.filter((c) => c.typeKey === 'LAVA');
    const oil = fluidCells.filter((c) => c.typeKey === 'OIL');
    expect(lava.length).toBeGreaterThan(0);
    expect(oil.length).toBeGreaterThan(0);
    for (const g of groups(oil)) expect(isBox(g) && g.length === Math.round(Math.sqrt(g.length)) ** 2).toBe(true);
  });
});

describe('pools on cave floors', () => {
  const POOL: FluidGeneration = { mode: 'POOL', minDepth: 2, maxDepth: null, percentage: 8, minSize: 3, maxSize: 6 };

  it('puts pools only on open floor, one row, at any depth', () => {
    const { grid, fluidCells } = make(12, [fluid('WATER', POOL)]);
    expect(fluidCells.length).toBeGreaterThan(0);
    for (const c of fluidCells) {
      expect(grid[c.y][c.x].type).toBe(MiningTileType.EMPTY);
      expect(isTileSolid(grid[c.y + 1][c.x].type)).toBe(true);
    }
    const rows = new Set(fluidCells.map((c) => c.y));
    expect(Math.max(...rows) - Math.min(...rows)).toBeGreaterThan(10); // spread over many depths
  });

  it('pools are runs no wider than the maximum, and no cell is used twice', () => {
    const { fluidCells } = make(13, [fluid('WATER', POOL)]);
    expect(new Set(fluidCells.map((c) => `${c.x},${c.y}`)).size).toBe(fluidCells.length);
    for (const g of groups(fluidCells)) {
      const rows = new Set(g.map((c) => c.y));
      if (rows.size === 1) expect(g.length).toBeLessThanOrEqual(POOL.maxSize * 4); // touching pools may join
    }
  });

  it('respects the depth range', () => {
    const { fluidCells } = make(14, [fluid('WATER', { ...POOL, minDepth: 12, maxDepth: 40 })]);
    expect(fluidCells.length).toBeGreaterThan(0);
    for (const c of fluidCells) {
      expect(c.y).toBeGreaterThanOrEqual(12);
      expect(c.y).toBeLessThanOrEqual(40);
    }
  });

  it('is deterministic, and leaves pocket fluids as they were', () => {
    const water = fluid('WATER', POOL);
    expect(make(15, [water]).fluidCells).toEqual(make(15, [water]).fluidCells);
    const oilOnly = make(15, [fluid('OIL', GEN)]).fluidCells;
    const both = make(15, [fluid('OIL', GEN), water]).fluidCells.filter((c) => c.typeKey === 'OIL');
    expect(both).toEqual(oilOnly);
  });

  it('percentage 0 makes no pools', () => {
    expect(make(16, [fluid('WATER', { ...POOL, percentage: 0 })]).fluidCells).toEqual([]);
  });
});

describe('gas pockets take the same shapes', () => {
  const gas = (generation: any) => ({
    id: 'g1', typeKey: 'HYDROGEN', name: 'Hydrogen', color: '#cccccc', opacity: 0.4, density: 0.07,
    diffusionRate: 0.3, minConcentration: 0.02, ventLifetime: 6, generation,
  });
  const makeGas = (seed: number, generation: any) => generateMiningMapWithFluids({ seed, config: CONFIG, gases: [gas(generation)] as any });

  it('veins of gas are connected, sealed and irregular', () => {
    const { grid, gasCells } = makeGas(3, { ...GEN, shapes: { VEIN: 1 } });
    const all = groups(gasCells);
    expect(all.length).toBeGreaterThan(2);
    expect(all.some((g) => !isBox(g))).toBe(true);
    const inPocket = new Set(gasCells.map((c) => `${c.x},${c.y}`));
    for (const c of gasCells) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (inPocket.has(`${c.x + dx},${c.y + dy}`)) continue;
          expect(isTileSolid(grid[c.y + dy][c.x + dx].type)).toBe(true);
        }
      }
    }
  });

  it('without shapes the default mix has boxes and veins', () => {
    const all = [1, 2, 3, 4, 5].flatMap((seed) => groups(makeGas(seed, GEN).gasCells));
    expect(all.some(isBox)).toBe(true);
    expect(all.some((g) => !isBox(g))).toBe(true);
  });
});
