import { describe, it, expect } from 'vitest';
import { MiningTileType, isTileSolid, type FluidDefinition, type GasDefinition } from '@mine-me/shared';
import { generateMiningMap, generateMiningMapWithFluids } from './miningMap.service';

const gas = (typeKey: string, generation: GasDefinition['generation']): GasDefinition => ({
  id: `g_${typeKey}`, typeKey, name: typeKey, color: '#cccccc', opacity: 0.4, density: typeKey === 'HYDROGEN' ? 0.07 : 1.15,
  diffusionRate: 0.3, minConcentration: 0.02, ventLifetime: 6, generation,
});
const oil: FluidDefinition = {
  id: 'f1', typeKey: 'OIL', name: 'Oil', color: '#000000', opacity: 0.9, density: 0.8, viscosity: 0.6,
  flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02,
  generation: { minDepth: 8, maxDepth: null, percentage: 3, minSize: 2, maxSize: 4 },
};
const GEN = { minDepth: 6, maxDepth: null, percentage: 3, minSize: 2, maxSize: 4, concentration: 1 };
const CONFIG = { gridWidth: 60, gridHeight: 60, cavernDensity: 30 };
const make = (seed: number, gases: GasDefinition[], config = CONFIG, fluids: FluidDefinition[] = []) =>
  generateMiningMapWithFluids({ seed, config, gases, fluids });

describe('gas pockets in map generation', () => {
  it('places pockets of gas cells at the configured concentration, one gas per pocket cell', () => {
    const { gasCells } = make(11, [gas('HYDROGEN', { ...GEN, concentration: 0.8 })]);
    expect(gasCells.length).toBeGreaterThan(0);
    for (const c of gasCells) expect(c).toMatchObject({ typeKey: 'HYDROGEN', concentration: 0.8 });
  });

  it('fills pockets completely when no concentration is given', () => {
    const { concentration: _c, ...withoutConcentration } = GEN;
    for (const c of make(11, [gas('HYDROGEN', withoutConcentration)]).gasCells) expect(c.concentration).toBe(1);
  });

  it('puts every gas cell on an open tile, and no two on the same tile', () => {
    const { grid, gasCells } = make(11, [gas('HYDROGEN', GEN), gas('NITROGEN', GEN)]);
    const seen = new Set<string>();
    for (const c of gasCells) {
      expect(grid[c.y][c.x].type).toBe(MiningTileType.EMPTY);
      const key = `${c.x},${c.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('places each gas that has generation settings, and none that does not', () => {
    const { gasCells } = make(12, [gas('HYDROGEN', GEN), gas('NITROGEN', null)]);
    expect(new Set(gasCells.map((c) => c.typeKey))).toEqual(new Set(['HYDROGEN']));
    const both = make(12, [gas('HYDROGEN', GEN), gas('NITROGEN', { ...GEN, percentage: 6 })]).gasCells;
    expect(new Set(both.map((c) => c.typeKey))).toEqual(new Set(['HYDROGEN', 'NITROGEN']));
  });

  it('keeps pockets within the depth range', () => {
    const { gasCells } = make(5, [gas('HYDROGEN', { ...GEN, minDepth: 20, maxDepth: 30, percentage: 12 })]);
    expect(gasCells.length).toBeGreaterThan(0);
    for (const c of gasCells) {
      expect(c.y).toBeGreaterThanOrEqual(20);
      expect(c.y).toBeLessThanOrEqual(30);
    }
  });

  it('makes square pockets of the configured size', () => {
    const { gasCells } = make(21, [gas('HYDROGEN', { ...GEN, minSize: 3, maxSize: 3 })]);
    expect(gasCells.length % 9).toBe(0);
  });

  it('seals every pocket: all neighbours of a gas cell are gas cells or solid tiles', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { grid, gasCells } = make(seed, [gas('HYDROGEN', GEN), gas('NITROGEN', GEN)]);
      const inPocket = new Set(gasCells.map((c) => `${c.x},${c.y}`));
      for (const c of gasCells) {
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

  it('never overlaps a fluid pocket, and never changes where the fluid pockets are', () => {
    for (const seed of [1, 2, 3, 4]) {
      const withGas = make(seed, [gas('HYDROGEN', { ...GEN, percentage: 8 })], CONFIG, [oil]);
      const withoutGas = make(seed, [], CONFIG, [oil]);
      expect(withGas.fluidCells).toEqual(withoutGas.fluidCells);
      const fluidKeys = new Set(withGas.fluidCells.map((c) => `${c.x},${c.y}`));
      for (const c of withGas.gasCells) expect(fluidKeys.has(`${c.x},${c.y}`)).toBe(false);
    }
  });

  it('never leaves a chest, ore or rock inside a pocket, or a rock hanging over one', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { grid, gasCells } = make(seed, [gas('HYDROGEN', { ...GEN, percentage: 8 })]);
      for (const c of gasCells) {
        expect(grid[c.y][c.x].type).toBe(MiningTileType.EMPTY);
        expect(grid[c.y - 1][c.x].type).not.toBe(MiningTileType.ROCK);
      }
    }
  });

  it('leaves a map without generating gases exactly as it was', () => {
    const base = generateMiningMap({ seed: 9, config: CONFIG });
    expect(make(9, [gas('HYDROGEN', null)]).grid).toEqual(base);
    expect(make(9, []).grid).toEqual(base);
  });

  it('is reproducible from the seed, whatever order the gases arrive in', () => {
    const a = make(77, [gas('HYDROGEN', GEN), gas('NITROGEN', GEN)]).gasCells;
    expect(make(77, [gas('NITROGEN', GEN), gas('HYDROGEN', GEN)]).gasCells).toEqual(a);
    expect(make(78, [gas('HYDROGEN', GEN), gas('NITROGEN', GEN)]).gasCells).not.toEqual(a);
  });

  it('places nothing without generation settings, a zero percentage, or no gases', () => {
    expect(make(3, [gas('HYDROGEN', null)]).gasCells).toEqual([]);
    expect(make(3, [gas('HYDROGEN', { ...GEN, percentage: 0 })]).gasCells).toEqual([]);
    expect(make(3, []).gasCells).toEqual([]);
    expect(generateMiningMapWithFluids({ seed: 3, config: CONFIG }).gasCells).toEqual([]);
  });

  it('puts more gas in with a higher percentage', () => {
    const few = make(4, [gas('HYDROGEN', { ...GEN, percentage: 1 })]).gasCells.length;
    const many = make(4, [gas('HYDROGEN', { ...GEN, percentage: 6 })]).gasCells.length;
    expect(many).toBeGreaterThan(few);
  });

  it('never touches the surface row or the edges', () => {
    const { gasCells } = make(6, [gas('HYDROGEN', { ...GEN, minDepth: 1 })], { ...CONFIG, gridHeight: 30 });
    for (const c of gasCells) {
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(29);
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(59);
    }
  });
});
