import { describe, it, expect } from 'vitest';
import { FluidGrid, FluidRegistry } from '../src/index';

const lava = { typeKey: 'LAVA', density: 3, flowRate: 0.1, minLevel: 0.05, flowThreshold: 0.02, reactions: [{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 2 }] };
const water = { typeKey: 'WATER', density: 1, flowRate: 0.6, minLevel: 0.01, flowThreshold: 0.01 };
const oil = { typeKey: 'OIL', density: 0.8, flowRate: 0.4, minLevel: 0.05, flowThreshold: 0.02 };
const registry = new FluidRegistry([lava, water, oil]);
const LAVA = registry.idOf('LAVA')!;
const WATER = registry.idOf('WATER')!;
const OIL = registry.idOf('OIL')!;

/** '#' solid, others open. */
function makeGrid(rows: string[]) {
  const solid = rows.map((r) => r.split(''));
  return new FluidGrid(rows[0].length, rows.length, registry, (x, y) => solid[y][x] === '#');
}
const run = (grid: FluidGrid, steps = 200) => { for (let i = 0; i < steps; i++) grid.step(); };

describe('fluid reactions', () => {
  it('water hardens lava next to it, using up two water per lava', () => {
    const grid = makeGrid(['####', '#..#', '####']);
    grid.setCell(1, 1, LAVA, 0.5);
    grid.setCell(2, 1, WATER, 1);
    const water0 = grid.totalVolume(WATER);
    grid.step();
    const reactions = grid.takeReactions();
    expect(reactions).toEqual([{ x: 1, y: 1, becomes: 'LAVAROCK' }]);
    expect(grid.getFluidId(1, 1)).toBe(0);
    // 0.5 lava hardened costs 1.0 water: the water cell is spent entirely
    expect(grid.totalVolume(WATER)).toBeCloseTo(water0 - 1, 2);
  });

  it('with less water than needed, lava is only reduced and the water is all used', () => {
    const grid = makeGrid(['####', '#..#', '####']);
    grid.setCell(1, 1, LAVA, 1);
    grid.setCell(2, 1, WATER, 0.5);
    grid.step();
    expect(grid.takeReactions()).toEqual([]);
    expect(grid.getFluidId(1, 1)).toBe(LAVA);
    expect(grid.getLevel(1, 1)).toBeCloseTo(0.75, 1); // 0.5 water hardens 0.25 lava
    expect(grid.totalVolume(WATER)).toBeLessThan(0.01);
  });

  it('a thin trickle keeps eating a pool until the lava is gone', () => {
    const grid = makeGrid(['####', '#..#', '####']);
    grid.setCell(1, 1, LAVA, 1);
    for (let n = 0; n < 4; n++) {
      grid.setCell(2, 1, WATER, 0.5);
      grid.step();
    }
    expect(grid.takeReactions().length).toBe(1);
  });

  it('fluids that do not react leave each other alone', () => {
    const grid = makeGrid(['#####', '#...#', '#####']);
    grid.setCell(1, 1, LAVA, 1);
    grid.setCell(2, 1, OIL, 1);
    run(grid, 20);
    expect(grid.takeReactions()).toEqual([]);
    expect(grid.getFluidId(1, 1)).toBe(LAVA);
  });

  it('reacts when water flows onto lava from above (lava is denser and ends up below it)', () => {
    const grid = makeGrid(['###', '#.#', '#.#', '#.#', '###']);
    grid.setCell(1, 3, LAVA, 0.4);
    grid.setCell(1, 1, WATER, 1);
    run(grid, 60);
    expect(grid.takeReactions().length).toBe(1);
    expect(grid.totalVolume(LAVA)).toBe(0);
  });

  it('works whichever fluid is the one that flows into the other', () => {
    const a = makeGrid(['#####', '#...#', '#####']);
    a.setCell(1, 1, WATER, 1);
    a.setCell(3, 1, LAVA, 0.3); // water spreads onto the lava
    run(a, 40);
    expect(a.takeReactions().length).toBeGreaterThanOrEqual(1);
    expect(a.totalVolume(LAVA)).toBe(0);
  });

  it('a rule naming an unknown fluid is ignored', () => {
    const reg = new FluidRegistry([{ ...lava, reactions: [{ with: 'NOPE', becomes: 'X', costPerLevel: 1 }] }, water]);
    const rows = ['#####', '#...#', '#####'];
    const grid = new FluidGrid(5, 3, reg, (x, y) => rows[y][x] === '#');
    grid.setCell(1, 1, reg.idOf('LAVA')!, 1);
    grid.setCell(2, 1, reg.idOf('WATER')!, 1);
    grid.step();
    expect(grid.takeReactions()).toEqual([]);
  });

  it('reports a reaction once', () => {
    const grid = makeGrid(['#####', '#...#', '#####']);
    grid.setCell(1, 1, LAVA, 0.4);
    grid.setCell(2, 1, WATER, 1);
    run(grid, 10);
    expect(grid.takeReactions().length).toBe(1);
    run(grid, 10);
    expect(grid.takeReactions().length).toBe(0);
  });
});
