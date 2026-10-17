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
    run(grid, 4);
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
    run(grid, 4);
    expect(grid.takeReactions()).toEqual([]);
    expect(grid.getFluidId(1, 1)).toBe(LAVA);
    expect(grid.totalVolume(LAVA)).toBeCloseTo(0.75, 1); // 0.5 water hardens 0.25 lava (what is left may spread into the emptied cell)
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

  it('does nothing in the step water first arrives next to lava: it is there for one step before anything is used up', () => {
    const grid = makeGrid(['#####', '#...#', '#####']);
    grid.setCell(1, 1, LAVA, 1);
    grid.setCell(3, 1, WATER, 1);
    grid.step(); // the water spreads into the gap and now touches the lava
    expect(grid.getFluidId(2, 1)).toBe(WATER);
    expect(grid.totalVolume(LAVA)).toBeCloseTo(1, 5);
    grid.step();
    expect(grid.totalVolume(LAVA)).toBeLessThan(1);
  });

  it('hardens at most ratePerStep per step, so a full cell takes several steps and the water is seen sitting against it', () => {
    const grid = makeGrid(['####', '#..#', '####']);
    grid.setCell(1, 1, LAVA, 0.8);
    grid.setCell(2, 1, WATER, 1);
    const totals: number[] = [grid.totalVolume(LAVA)];
    for (let n = 0; n < 5; n++) {
      grid.step();
      totals.push(grid.totalVolume(LAVA));
    }
    for (let n = 1; n < totals.length; n++) expect(totals[n - 1] - totals[n]).toBeLessThanOrEqual(0.25 + 1e-6);
    expect(totals[2]).toBeGreaterThan(0.3); // still lava two steps in
  });

  it('a reaction can name its own rate', () => {
    const quick = new FluidRegistry([{ ...lava, reactions: [{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 1, ratePerStep: 1 }] }, water]);
    const rows = ['####', '#..#', '####'];
    const grid = new FluidGrid(4, 3, quick, (x, y) => rows[y][x] === '#');
    grid.setCell(1, 1, quick.idOf('LAVA')!, 1);
    grid.setCell(2, 1, quick.idOf('WATER')!, 1);
    grid.step();
    grid.step();
    expect(grid.takeReactions()).toEqual([{ x: 1, y: 1, becomes: 'LAVAROCK' }]);
  });

  it('water falling onto lava is seen next to it before the lava is touched (never used up in the step it arrives)', () => {
    const rows: string[] = [];
    for (let y = 0; y < 14; y++) rows.push(y >= 13 ? '#######' : '#.....#');
    const grid = new FluidGrid(7, 14, registry, (x, y) => rows[y][x] === '#');
    for (let x = 1; x <= 5; x++) grid.setCell(x, 12, LAVA, 1);
    let adjacentBefore = false;
    for (let n = 0; n < 16; n++) {
      if (n < 6) grid.addFluid(3, 1, WATER, 0.5);
      const lavaBefore = grid.totalVolume(LAVA);
      grid.step();
      if (grid.totalVolume(LAVA) < lavaBefore - 1e-6) expect(adjacentBefore, `lava used at step ${n} with no water beside it the step before`).toBe(true);
      adjacentBefore = [1, 2, 3, 4, 5].some((x) => grid.getFluidId(x, 11) === WATER);
    }
    expect(grid.totalVolume(LAVA)).toBeLessThan(5);
  });
});
