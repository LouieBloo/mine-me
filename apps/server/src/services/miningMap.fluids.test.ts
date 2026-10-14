import { describe, it, expect } from 'vitest';
import { MiningTileType, isTileSolid, type FluidDefinition } from '@mine-me/shared';
import { generateMiningMap, generateMiningMapWithFluids } from './miningMap.service';

const oil = (generation: FluidDefinition['generation']): FluidDefinition => ({
  id: 'f1', typeKey: 'OIL', name: 'Oil', color: '#000000', opacity: 0.9, density: 0.8, viscosity: 0.6,
  flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02, generation,
});
const GEN = { minDepth: 8, maxDepth: null, percentage: 3, minSize: 2, maxSize: 4 };
const CONFIG = { gridWidth: 60, gridHeight: 60, cavernDensity: 30 };
const make = (seed: number, fluids: FluidDefinition[], config = CONFIG) => generateMiningMapWithFluids({ seed, config, fluids });

describe('oil pockets in map generation', () => {
  it('places pockets of full fluid cells', () => {
    const { fluidCells } = make(11, [oil(GEN)]);
    expect(fluidCells.length).toBeGreaterThan(0);
    for (const c of fluidCells) expect(c).toMatchObject({ typeKey: 'OIL', level: 1 });
  });

  it('puts every fluid cell on an open tile, and no two on the same tile', () => {
    const { grid, fluidCells } = make(11, [oil(GEN)]);
    const seen = new Set<string>();
    for (const c of fluidCells) {
      expect(grid[c.y][c.x].type).toBe(MiningTileType.EMPTY);
      const key = `${c.x},${c.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('keeps pockets within the depth range', () => {
    const { fluidCells } = make(5, [oil({ ...GEN, minDepth: 20, maxDepth: 30, percentage: 12 })]);
    expect(fluidCells.length).toBeGreaterThan(0);
    for (const c of fluidCells) {
      expect(c.y).toBeGreaterThanOrEqual(20);
      expect(c.y).toBeLessThanOrEqual(30);
    }
  });

  it('makes square pockets of the configured size', () => {
    const { fluidCells } = make(21, [oil({ ...GEN, minSize: 3, maxSize: 3 })]);
    expect(fluidCells.length % 9).toBe(0);
  });

  it('seals every pocket: all neighbours of a fluid cell are fluid cells or solid tiles', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { grid, fluidCells } = make(seed, [oil(GEN)]);
      const inPocket = new Set(fluidCells.map((c) => `${c.x},${c.y}`));
      for (const c of fluidCells) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (inPocket.has(`${nx},${ny}`)) continue;
          const type = grid[ny]?.[nx]?.type;
          expect(type !== undefined && isTileSolid(type)).toBe(true);
        }
      }
    }
  });

  it('never leaves a chest, ore or rock inside a pocket, or a rock hanging over one', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { grid, fluidCells } = make(seed, [oil({ ...GEN, percentage: 8 })]);
      for (const c of fluidCells) {
        expect(grid[c.y][c.x].type).toBe(MiningTileType.EMPTY);
        expect(grid[c.y - 1][c.x].type).not.toBe(MiningTileType.ROCK);
      }
    }
  });

  it('leaves a map without generating fluids exactly as it was', () => {
    const base = generateMiningMap({ seed: 9, config: CONFIG });
    expect(make(9, [oil(null)]).grid).toEqual(base);
    expect(make(9, []).grid).toEqual(base);
  });

  it('is reproducible from the seed', () => {
    const a = make(77, [oil(GEN)]).fluidCells;
    const b = make(77, [oil(GEN)]).fluidCells;
    expect(a).toEqual(b);
    expect(make(78, [oil(GEN)]).fluidCells).not.toEqual(a);
  });

  it('places nothing without generation settings, a zero percentage, or no fluids', () => {
    expect(make(3, [oil(null)]).fluidCells).toEqual([]);
    expect(make(3, [oil({ ...GEN, percentage: 0 })]).fluidCells).toEqual([]);
    expect(make(3, []).fluidCells).toEqual([]);
    expect(generateMiningMapWithFluids({ seed: 3, config: CONFIG }).fluidCells).toEqual([]);
  });

  it('puts more oil in with a higher percentage', () => {
    const few = make(4, [oil({ ...GEN, percentage: 1 })]).fluidCells.length;
    const many = make(4, [oil({ ...GEN, percentage: 6 })]).fluidCells.length;
    expect(many).toBeGreaterThan(few);
  });

  it('never touches the surface row or the bottom edge', () => {
    const { fluidCells } = make(6, [oil({ ...GEN, minDepth: 1 })], { ...CONFIG, gridHeight: 30 });
    for (const c of fluidCells) {
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(29);
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(59);
    }
  });
});
