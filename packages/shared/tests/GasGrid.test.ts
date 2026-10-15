import { describe, it, expect } from 'vitest';
import { GasGrid, GasRegistry, NO_GAS, GAS_FULL_CONCENTRATION, gasBuoyancy } from '../src/index';

const HYDROGEN = { typeKey: 'HYDROGEN', density: 0.07, diffusionRate: 0.35, minConcentration: 0.02, ventLifetime: 6 };
const NITROGEN = { typeKey: 'NITROGEN', density: 1.15, diffusionRate: 0.25, minConcentration: 0.02, ventLifetime: 6 };
const AIRLIKE = { typeKey: 'AIRLIKE', density: 1, diffusionRate: 0.5, minConcentration: 0.02, ventLifetime: 6 };
const CHLORINE = { typeKey: 'CHLORINE', density: 2.5, diffusionRate: 0.25, minConcentration: 0.02, ventLifetime: 6 };
const registry = new GasRegistry([HYDROGEN, NITROGEN, AIRLIKE, CHLORINE]);
const h2 = registry.idOf('HYDROGEN')!;
const n2 = registry.idOf('NITROGEN')!;
const neutral = registry.idOf('AIRLIKE')!;
const cl = registry.idOf('CHLORINE')!;

/** Draws a map: '#' solid, 'f' fluid (open, but fluid wins it), anything else open. Row 0 is the top. */
function makeGrid(rows: string[], reg = registry) {
  const cells = rows.map((r) => r.split(''));
  const grid = new GasGrid(rows[0].length, rows.length, reg, (x, y) => cells[y][x] === '#', { hasFluid: (x, y) => cells[y][x] === 'f' });
  return { grid, cells };
}

function settle(grid: GasGrid, maxSteps = 3000): number {
  for (let n = 1; n <= maxSteps; n++) {
    grid.step();
    if (grid.activeCount === 0) return n;
  }
  throw new Error(`did not settle within ${maxSteps} steps`);
}

function run(grid: GasGrid, steps: number) {
  for (let n = 0; n < steps; n++) grid.step();
}

/** Everything that left the grid, so conservation can be checked. */
const accounted = (g: GasGrid) => g.totalVolume() + g.droppedVolume + g.ventedVolume + g.lostVolume + g.drainedVolume;

/** Concentration summed per row. */
const rowTotals = (g: GasGrid, gasId?: number) =>
  Array.from({ length: g.height }, (_, y) => {
    let sum = 0;
    for (let x = 0; x < g.width; x++) if (gasId === undefined || g.getGasId(x, y) === gasId) sum += g.getConcentration(x, y);
    return sum;
  });

/** A sealed room: solid all round, open inside. */
const room = (inner: number, rows: number) => ['#'.repeat(inner + 2), ...Array.from({ length: rows }, () => '#' + '.'.repeat(inner) + '#'), '#'.repeat(inner + 2)];

describe('gasBuoyancy', () => {
  it('is positive for gases lighter than air, negative for heavier, zero at air, and capped at 1', () => {
    expect(gasBuoyancy(0.07)).toBeCloseTo(0.93);
    expect(gasBuoyancy(1.15)).toBeCloseTo(-0.15);
    expect(gasBuoyancy(1)).toBe(0);
    expect(gasBuoyancy(0.0001)).toBeLessThanOrEqual(1);
    expect(gasBuoyancy(50)).toBe(-1);
  });
});

describe('GasGrid basics', () => {
  it('refuses gas in solid cells, outside the grid, and of unknown gases', () => {
    const { grid } = makeGrid(['.#.']);
    expect(grid.addGas(1, 0, h2, 1)).toBe(0);
    expect(grid.addGas(5, 0, h2, 1)).toBe(0);
    expect(grid.addGas(0, 0, 99, 1)).toBe(0);
    expect(grid.addGas(0, 0, h2, 0)).toBe(0);
    expect(grid.addGas(0, 0, h2, 0.6)).toBeCloseTo(0.6);
    expect(grid.getConcentration(0, 0)).toBeCloseTo(0.6);
    expect(grid.getGasId(0, 0)).toBe(h2);
  });

  it('does not mix two gases in one cell, and a cell holds at most one full cell of gas', () => {
    const { grid } = makeGrid(['.']);
    grid.addGas(0, 0, h2, 0.5);
    expect(grid.addGas(0, 0, n2, 0.5)).toBe(0);
    expect(grid.getGasId(0, 0)).toBe(h2);
    expect(grid.addGas(0, 0, h2, 5)).toBeCloseTo(0.5);
    expect(grid.getConcentration(0, 0)).toBe(GAS_FULL_CONCENTRATION);
    expect(grid.addGas(0, 0, h2, 1)).toBe(0);
    expect(grid.setCell(0, 0, h2, 7)).toBe(true);
    expect(grid.getConcentration(0, 0)).toBe(GAS_FULL_CONCENTRATION);
  });

  it('empties a cell with a concentration of 0 and reports no gas there', () => {
    const { grid } = makeGrid(['.']);
    grid.addGas(0, 0, h2, 1);
    grid.setCell(0, 0, NO_GAS, 0);
    expect(grid.getGasId(0, 0)).toBe(NO_GAS);
    expect(grid.getConcentration(0, 0)).toBe(0);
  });

  it('reports changed cells once, with their current contents', () => {
    const { grid } = makeGrid(['..']);
    grid.addGas(0, 0, h2, 0.5);
    expect(grid.drainChanges()).toEqual([{ x: 0, y: 0, gasId: h2, concentration: 0.5 }]);
    expect(grid.drainChanges()).toEqual([]);
    grid.drainGas(0, 0, 0.5);
    expect(grid.drainChanges()).toEqual([{ x: 0, y: 0, gasId: NO_GAS, concentration: 0 }]);
  });

  it('takes gas out on purpose and counts it', () => {
    const { grid } = makeGrid(['.']);
    grid.addGas(0, 0, h2, 0.8);
    expect(grid.drainGas(0, 0, 0.3)).toBeCloseTo(0.3);
    expect(grid.drainGas(0, 0, 5)).toBeCloseTo(0.5);
    expect(grid.getGasId(0, 0)).toBe(NO_GAS);
    expect(grid.drainGas(0, 0, 1)).toBe(0);
    expect(grid.drainedVolume).toBeCloseTo(0.8);
  });
});

describe('buoyancy: light gases rise, heavy gases sink', () => {
  it('hydrogen released at the floor of a sealed room ends up under the ceiling', () => {
    const { grid } = makeGrid(room(3, 6));
    grid.addGas(2, 6, h2, 1);
    settle(grid);
    const rows = rowTotals(grid, h2);
    expect(rows[1]).toBeGreaterThan(rows[6]);
    expect(rows.slice(1).findIndex((r) => r > 0.05)).toBe(0);
    expect(grid.getConcentration(2, 1)).toBeGreaterThan(0.1);
  });

  it('nitrogen released at the top of a sealed room sinks to the floor', () => {
    const { grid } = makeGrid(room(3, 6));
    grid.addGas(2, 1, n2, 1);
    settle(grid);
    const rows = rowTotals(grid, n2);
    expect(rows[6]).toBeGreaterThan(rows[1]);
  });

  it('a heavy gas sinks faster than a barely heavy one', () => {
    const rows = room(1, 12);
    const a = makeGrid(rows).grid;
    const b = makeGrid(rows).grid;
    a.addGas(1, 1, cl, 1);
    b.addGas(1, 1, n2, 1);
    run(a, 4);
    run(b, 4);
    const lowest = (g: GasGrid, id: number) => {
      let max = -1;
      for (let y = 0; y < g.height; y++) if (g.getGasId(1, y) === id) max = y;
      return max;
    };
    expect(lowest(a, cl)).toBeGreaterThan(lowest(b, n2));
  });

  it('a gas as heavy as air does not drift up or down, it only spreads', () => {
    const { grid } = makeGrid(room(1, 7));
    grid.addGas(1, 4, neutral, 1);
    settle(grid);
    // It levelled out over the whole column rather than collecting at one end
    const top = grid.getConcentration(1, 1);
    const bottom = grid.getConcentration(1, 7);
    expect(Math.abs(top - bottom)).toBeLessThan(0.1);
    expect(top).toBeGreaterThan(0);
  });

  it('light gas fills a sealed room from the ceiling down once the ceiling layer is full', () => {
    const { grid } = makeGrid(room(4, 5));
    for (let x = 1; x <= 4; x++) for (let y = 1; y <= 5; y++) grid.addGas(x, y, h2, 0.5);
    settle(grid);
    // Gas is stacked at the top: the top row is fuller than the bottom row
    const rows = rowTotals(grid, h2);
    expect(rows[1]).toBeGreaterThan(rows[5]);
    expect(rows[1]).toBeCloseTo(4, 0);
  });

  it('spreads along a ceiling under a roof with an opening off to one side', () => {
    const { grid } = makeGrid(['#########', '#.......#', '#...#...#', '#########']);
    grid.addGas(1, 2, h2, 1);
    settle(grid);
    // Hydrogen rose, then crept along the roof to the far side
    expect(grid.getConcentration(7, 1)).toBeGreaterThan(0.02);
  });
});

describe('diffusion', () => {
  it('spreads a puff sideways along a corridor until it is thin and even', () => {
    const { grid } = makeGrid(['#########', '#.......#', '#########']);
    grid.addGas(1, 1, neutral, 1);
    settle(grid);
    const values = Array.from({ length: 7 }, (_, i) => grid.getConcentration(1 + i, 1));
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.1);
    expect(values.every((v) => v > 0)).toBe(true);
  });

  it('never makes concentration go above a full cell or below zero', () => {
    const { grid } = makeGrid(room(3, 3));
    for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) grid.addGas(x, y, x === 2 ? h2 : n2, 1);
    for (let n = 0; n < 200; n++) {
      grid.step();
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const c = grid.getConcentration(x, y);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(GAS_FULL_CONCENTRATION + 1e-6);
        }
      }
    }
  });
});

describe('two gases', () => {
  it('a heavier gas above a lighter one swaps below it', () => {
    const { grid } = makeGrid(['#.#', '#.#']);
    grid.addGas(1, 0, n2, 1);
    grid.addGas(1, 1, h2, 1);
    grid.step();
    expect(grid.getGasId(1, 1)).toBe(n2);
    expect(grid.getGasId(1, 0)).toBe(h2);
  });

  it('never puts two gases in one cell, however long they run', () => {
    const { grid } = makeGrid(room(4, 4));
    grid.addGas(1, 4, h2, 1);
    grid.addGas(4, 1, n2, 1);
    grid.addGas(2, 2, cl, 1);
    for (let n = 0; n < 300; n++) {
      grid.step();
      for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
        const c = grid.getConcentration(x, y);
        if (c > 0) expect(grid.getGasId(x, y)).not.toBe(NO_GAS);
      }
    }
    expect(grid.totalVolume(h2)).toBeGreaterThan(0);
  });
});

describe('venting through open air', () => {
  // A shaft open at the top: row 0 is open sky, row 5 is the floor
  const shaft = ['#.#', '#.#', '#.#', '#.#', '#.#', '###'];

  it('knows which cells are open to the sky', () => {
    const { grid } = makeGrid(['#.#', '#.#', '#.#']);
    expect(grid.isOpenToSky(1, 2)).toBe(true);
    const sealed = makeGrid(['###', '#.#', '#.#']).grid;
    expect(sealed.isOpenToSky(1, 1)).toBe(false);
    expect(sealed.isOpenToSky(1, 0)).toBe(false);
    expect(sealed.isOpenToSky(9, 9)).toBe(false);
  });

  it('hydrogen released in an open shaft rises up it and is gone after its vent lifetime', () => {
    const { grid } = makeGrid(shaft);
    grid.addGas(1, 4, h2, 1);
    run(grid, 3);
    expect(grid.totalVolume(h2)).toBeGreaterThan(0.3);
    // The gas has climbed rather than vanished at once
    expect(rowTotals(grid, h2).slice(0, 3).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const steps = settle(grid);
    expect(grid.totalVolume(h2)).toBe(0);
    expect(grid.ventedVolume + grid.droppedVolume).toBeGreaterThan(0.9);
    // It lingered about as long as its lifetime (6 s at 0.1 s a step), not instantly
    expect(steps).toBeGreaterThan(20);
    expect(steps).toBeLessThan(80);
  });

  it('a longer vent lifetime lingers longer', () => {
    const slow = new GasRegistry([{ ...HYDROGEN, ventLifetime: 20 }]);
    const a = makeGrid(shaft).grid;
    const b = makeGrid(shaft, slow).grid;
    a.addGas(1, 4, h2, 1);
    b.addGas(1, 4, 1, 1);
    expect(settle(b)).toBeGreaterThan(settle(a) + 40);
  });

  it('gas in a sealed room does not fade', () => {
    const { grid } = makeGrid(room(2, 3));
    grid.addGas(1, 3, h2, 1);
    run(grid, 400);
    expect(grid.ventedVolume).toBe(0);
    expect(grid.totalVolume(h2) + grid.droppedVolume).toBeCloseTo(1, 4);
  });

  it('breaking the ceiling lets a sealed pocket of hydrogen escape and fade away', () => {
    const cells = ['###', '#.#', '#.#', '#.#', '###'].map((r) => r.split(''));
    const grid = new GasGrid(3, 5, registry, (x, y) => cells[y][x] === '#');
    grid.addGas(1, 3, h2, 1);
    settle(grid);
    const before = grid.totalVolume(h2);
    expect(before).toBeGreaterThan(0.5);
    expect(grid.ventedVolume).toBe(0);
    cells[0][1] = '.';
    grid.onTileChanged(1, 0);
    expect(grid.isOpenToSky(1, 3)).toBe(true);
    expect(grid.activeCount).toBeGreaterThan(0);
    settle(grid);
    expect(grid.totalVolume(h2)).toBe(0);
    expect(grid.ventedVolume).toBeGreaterThan(0.3);
  });

  it('closing the top again stops the fading', () => {
    const cells = ['#.#', '#.#', '#.#', '###'].map((r) => r.split(''));
    const grid = new GasGrid(3, 4, registry, (x, y) => cells[y][x] === '#');
    grid.addGas(1, 2, neutral, 1);
    cells[0][1] = '#';
    grid.onTileChanged(1, 0);
    expect(grid.isOpenToSky(1, 2)).toBe(false);
    const vented = grid.ventedVolume;
    run(grid, 200);
    expect(grid.ventedVolume).toBe(vented);
  });
});

describe('conservation and settling', () => {
  it('accounts for every bit of gas: what is left plus what faded, was dropped, drained or lost equals what went in', () => {
    const { grid } = makeGrid(['#...#', '#...#', '#...#', '#...#', '#####']);
    grid.addGas(1, 3, h2, 1);
    grid.addGas(3, 0, n2, 1);
    grid.addGas(2, 2, cl, 1);
    for (let n = 0; n < 150; n++) {
      grid.step();
      expect(accounted(grid)).toBeCloseTo(3, 3);
    }
  });

  it('a still gas becomes inactive and then costs nothing', () => {
    const { grid } = makeGrid(room(3, 3));
    grid.addGas(2, 2, neutral, 0.6);
    settle(grid);
    grid.drainChanges();
    expect(grid.activeCount).toBe(0);
    expect(grid.step()).toBe(0);
    expect(grid.drainChanges()).toEqual([]);
  });

  it('a thin smear does not keep a cloud awake forever', () => {
    const { grid } = makeGrid(['#' + '.'.repeat(30) + '#']);
    grid.addGas(1, 0, neutral, 1);
    expect(() => settle(grid, 5000)).not.toThrow();
  });

  it('is deterministic: the same start gives the same result', () => {
    const build = () => {
      const { grid } = makeGrid(['#.....#', '#.....#', '#..#..#', '#.....#', '#######']);
      grid.addGas(1, 3, h2, 1);
      grid.addGas(5, 0, n2, 1);
      grid.addGas(3, 1, cl, 0.7);
      return grid;
    };
    const a = build();
    const b = build();
    for (let n = 0; n < 60; n++) {
      a.step();
      b.step();
    }
    expect(a.drainChanges()).toEqual(b.drainChanges());
    expect(rowTotals(a)).toEqual(rowTotals(b));
  });
});

describe('solid terrain', () => {
  it('gas does not pass through solid walls', () => {
    const { grid } = makeGrid(['#####', '#.#.#', '#.#.#', '#####']);
    grid.addGas(1, 1, neutral, 1);
    run(grid, 300);
    expect(grid.getConcentration(3, 1) + grid.getConcentration(3, 2)).toBe(0);
  });

  it('a tile closing on gas pushes it into free room next to it, and loses what does not fit', () => {
    const cells = ['####', '#..#', '####'].map((r) => r.split(''));
    const grid = new GasGrid(4, 3, registry, (x, y) => cells[y][x] === '#');
    grid.setCell(1, 1, h2, 0.5);
    cells[1][1] = '#';
    grid.onTileChanged(1, 1);
    expect(grid.getGasId(1, 1)).toBe(NO_GAS);
    expect(grid.getConcentration(2, 1)).toBeCloseTo(0.5);
    // Now close the other cell too: nowhere to go
    cells[1][2] = '#';
    grid.onTileChanged(2, 1);
    expect(grid.totalVolume()).toBe(0);
    expect(grid.lostVolume).toBeCloseTo(0.5);
  });

  it('opening a wall lets gas flow into the gap', () => {
    const cells = ['#####', '#.#.#', '#####'].map((r) => r.split(''));
    const grid = new GasGrid(5, 3, registry, (x, y) => cells[y][x] === '#');
    grid.addGas(1, 1, neutral, 1);
    settle(grid);
    expect(grid.getConcentration(3, 1)).toBe(0);
    cells[1][2] = '.';
    grid.onTileChanged(2, 1);
    settle(grid);
    expect(grid.getConcentration(3, 1)).toBeGreaterThan(0);
  });
});

describe('fluid wins the cell', () => {
  it('refuses to add gas to a cell holding fluid, and never flows into one', () => {
    const { grid } = makeGrid(['#####', '#.f.#', '#####']);
    expect(grid.addGas(2, 1, h2, 1)).toBe(0);
    grid.addGas(1, 1, neutral, 1);
    run(grid, 300);
    expect(grid.getConcentration(2, 1)).toBe(0);
    expect(grid.getConcentration(3, 1)).toBe(0);
  });

  it('pushes gas out of a cell the fluid flows into, to a neighbour with room', () => {
    const cells = ['#####', '#...#', '#####'].map((r) => r.split(''));
    const grid = new GasGrid(5, 3, registry, (x, y) => cells[y][x] === '#', { hasFluid: (x, y) => cells[y][x] === 'f' });
    grid.setCell(2, 1, n2, 0.6);
    cells[1][2] = 'f';
    expect(grid.evictFromFluid()).toBe(1);
    expect(grid.getGasId(2, 1)).toBe(NO_GAS);
    expect(grid.totalVolume(n2)).toBeCloseTo(0.6);
    expect(grid.getConcentration(1, 1) + grid.getConcentration(3, 1)).toBeCloseTo(0.6);
    expect(grid.evictFromFluid()).toBe(0);
  });

  it('loses the gas when there is nowhere for it to go', () => {
    const cells = ['###', '#.#', '###'].map((r) => r.split(''));
    const grid = new GasGrid(3, 3, registry, (x, y) => cells[y][x] === '#', { hasFluid: (x, y) => cells[y][x] === 'f' });
    grid.setCell(1, 1, h2, 0.7);
    cells[1][1] = 'f';
    grid.evictFromFluid();
    expect(grid.totalVolume()).toBe(0);
    expect(grid.lostVolume).toBeCloseTo(0.7);
  });
});
