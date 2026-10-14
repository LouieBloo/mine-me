import { describe, it, expect } from 'vitest';
import { FluidGrid, FluidRegistry, NO_FLUID, FLUID_FULL_LEVEL, FLUID_MAX_COMPRESSION } from '../src/index';

const OIL = { typeKey: 'OIL', density: 0.8, flowRate: 0.5, minLevel: 0.05, flowThreshold: 0.02 };
const WATER = { typeKey: 'WATER', density: 1, flowRate: 0.5, minLevel: 0.01, flowThreshold: 0.01 };
const registry = new FluidRegistry([OIL, WATER]);
const oil = registry.idOf('OIL')!;
const water = registry.idOf('WATER')!;

/** Draws a map: '#' solid, anything else open. Row 0 is the top. */
function makeGrid(rows: string[], reg = registry) {
  const solid = rows.map((r) => r.split(''));
  const grid = new FluidGrid(rows[0].length, rows.length, reg, (x, y) => solid[y][x] === '#');
  return { grid, solid };
}

function settle(grid: FluidGrid, maxSteps = 2000): number {
  for (let n = 1; n <= maxSteps; n++) {
    grid.step();
    if (grid.activeCount === 0) return n;
  }
  throw new Error(`did not settle within ${maxSteps} steps`);
}

describe('FluidRegistry', () => {
  it('hands out ids in typeKey order, whatever order it is given', () => {
    const a = new FluidRegistry([WATER, OIL]);
    const b = new FluidRegistry([OIL, WATER]);
    expect(a.idOf('OIL')).toBe(1);
    expect(a.idOf('WATER')).toBe(2);
    expect(b.idOf('OIL')).toBe(1);
    expect(a.keyOf(2)).toBe('WATER');
    expect(a.paramsOf(1)?.density).toBe(0.8);
  });

  it('never uses 0 and ignores duplicates and unknown ids', () => {
    const r = new FluidRegistry([OIL, OIL]);
    expect(r.size).toBe(1);
    expect(r.paramsOf(NO_FLUID)).toBeUndefined();
    expect(r.paramsOf(9)).toBeUndefined();
    expect(r.idOf('LAVA')).toBeUndefined();
  });
});

describe('FluidGrid basics', () => {
  it('refuses fluid in solid cells, outside the grid, and of unknown fluids', () => {
    const { grid } = makeGrid(['.#.']);
    expect(grid.addFluid(1, 0, oil, 1)).toBe(false);
    expect(grid.addFluid(5, 0, oil, 1)).toBe(false);
    expect(grid.addFluid(0, 0, 99, 1)).toBe(false);
    expect(grid.addFluid(0, 0, oil, 1)).toBe(true);
    expect(grid.getLevel(0, 0)).toBe(1);
  });

  it('does not mix two fluids in one cell', () => {
    const { grid } = makeGrid(['.']);
    grid.addFluid(0, 0, oil, 0.5);
    expect(grid.addFluid(0, 0, water, 0.5)).toBe(false);
    expect(grid.getFluidId(0, 0)).toBe(oil);
  });

  it('reports no fluid for empty cells', () => {
    const { grid } = makeGrid(['..']);
    expect(grid.getFluidId(0, 0)).toBe(NO_FLUID);
    expect(grid.getLevel(-1, 0)).toBe(0);
  });
});

describe('FluidGrid flow', () => {
  it('falls straight down and comes to rest on the floor', () => {
    const { grid } = makeGrid(['#.#', '#.#', '#.#', '###']);
    grid.addFluid(1, 0, oil, 1);
    settle(grid);
    expect(grid.getLevel(1, 2)).toBeCloseTo(1, 1);
    expect(grid.getLevel(1, 0)).toBe(0);
  });

  it('spreads over a flat floor to an even depth', () => {
    const { grid } = makeGrid(['#######', '#.....#', '#######']);
    grid.addFluid(3, 1, oil, 1);
    // A full cell spread over 5 would be 0.2 each, which is above the oil minimum of 0.05
    settle(grid);
    const levels = [1, 2, 3, 4, 5].map((x) => grid.getLevel(x, 1));
    for (const l of levels) expect(l).toBeGreaterThan(0.15);
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(0.1);
  });

  it('fills a basin level rather than piling up', () => {
    const { grid } = makeGrid(['#.....#', '#.....#', '#######']);
    for (let x = 1; x <= 5; x++) grid.addFluid(x, 0, oil, 0);
    grid.addFluid(1, 0, oil, 1);
    grid.addFluid(1, 1, oil, 1);
    grid.addFluid(2, 0, oil, 1);
    settle(grid);
    const bottom = [1, 2, 3, 4, 5].map((x) => grid.getLevel(x, 1));
    expect(Math.max(...bottom) - Math.min(...bottom)).toBeLessThan(0.15);
    for (const l of [1, 2, 3, 4, 5].map((x) => grid.getLevel(x, 0))) expect(l).toBeLessThan(0.5);
  });

  it('flows out when a wall is broken, and not before', () => {
    const rows = ['#.##..#', '#.##..#', '#######'];
    const { grid, solid } = makeGrid(rows);
    grid.addFluid(1, 0, oil, 1);
    grid.addFluid(1, 1, oil, 1);
    settle(grid);
    expect(grid.getLevel(4, 1)).toBe(0);
    expect(grid.activeCount).toBe(0);

    // Break the wall between the two pockets on the bottom row
    solid[1][2] = '.';
    solid[1][3] = '.';
    grid.onTileChanged(2, 1);
    grid.onTileChanged(3, 1);
    expect(grid.activeCount).toBeGreaterThan(0);
    settle(grid);
    expect(grid.getLevel(4, 1)).toBeGreaterThan(0.1);
    expect(grid.getLevel(5, 1)).toBeGreaterThan(0.1);
  });

  it('levels out through a U-tube when the fluid is thin enough to climb', () => {
    // Water has a tiny minimum level, so even a small pressure difference can lift it
    const { grid } = makeGrid(['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#...#', '#####']);
    for (let y = 0; y <= 4; y++) grid.addFluid(1, y, water, 1);
    grid.addFluid(2, 4, water, 1);
    grid.addFluid(3, 4, water, 1);
    const before = grid.totalVolume();
    settle(grid, 20000);
    const arm = (x: number) => [0, 1, 2, 3, 4].reduce((sum, y) => sum + grid.getLevel(x, y), 0);
    // Pressure leveling is approximate (compression is small), so the arms end within about two cells
    expect(arm(3)).toBeGreaterThan(1.9);
    expect(Math.abs(arm(1) - arm(3))).toBeLessThan(2.5);
    expect(grid.totalVolume() + grid.evaporatedVolume).toBeCloseTo(before, 3);
    expect(grid.evaporatedVolume).toBeLessThan(0.05);
  });

  it('shallow pressure cannot lift thick fluid, and nothing leaks trying', () => {
    const { grid } = makeGrid(['#.#.#', '#.#.#', '#.#.#', '#...#', '#####']);
    for (let y = 0; y <= 3; y++) grid.addFluid(1, y, oil, 1);
    grid.addFluid(2, 3, oil, 1);
    grid.addFluid(3, 3, oil, 1);
    const before = grid.totalVolume();
    settle(grid, 5000);
    expect(grid.getLevel(3, 2)).toBe(0);
    expect(grid.evaporatedVolume).toBeCloseTo(0, 5);
    expect(grid.totalVolume()).toBeCloseTo(before, 3);
  });

  it('conserves volume apart from what evaporates', () => {
    const { grid } = makeGrid(['#########', '#.......#', '#.......#', '#########']);
    grid.addFluid(4, 1, oil, 1);
    grid.addFluid(4, 2, oil, 0.5);
    const before = grid.totalVolume();
    settle(grid);
    expect(grid.totalVolume() + grid.evaporatedVolume).toBeCloseTo(before, 3);
  });

  it('evaporates a film thinner than the fluid minimum, and keeps the rest', () => {
    const { grid } = makeGrid(['#.#', '###']);
    grid.addFluid(1, 0, oil, 0.03);
    grid.step();
    expect(grid.getLevel(1, 0)).toBe(0);
    expect(grid.evaporatedVolume).toBeCloseTo(0.03, 5);
    grid.addFluid(1, 0, oil, 0.2);
    settle(grid);
    expect(grid.getLevel(1, 0)).toBeCloseTo(0.2, 5);
  });

  it('thin spread stops instead of smearing forever', () => {
    const { grid } = makeGrid(['#' + '.'.repeat(60) + '#', '#'.repeat(62)]);
    grid.addFluid(30, 0, oil, 1);
    const steps = settle(grid, 3000);
    expect(steps).toBeLessThan(3000);
    // The film keeps the minimum depth where it ends
    const lit = Array.from({ length: 60 }, (_, i) => grid.getLevel(i + 1, 0)).filter((l) => l > 0);
    for (const l of lit) expect(l).toBeGreaterThanOrEqual(0.05);
  });

  it('does not shuffle fluid between cells that differ by less than the flow threshold', () => {
    const { grid } = makeGrid(['#..#', '####']);
    grid.addFluid(1, 0, oil, 0.30);
    grid.addFluid(2, 0, oil, 0.29);
    expect(grid.step()).toBe(0);
    expect(grid.getLevel(1, 0)).toBeCloseTo(0.3, 5);
    expect(grid.getLevel(2, 0)).toBeCloseTo(0.29, 5);
    expect(grid.activeCount).toBe(0);
  });

  it('a still pool costs nothing', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(1, 0, oil, 0.3);
    grid.addFluid(2, 0, oil, 0.3);
    grid.addFluid(3, 0, oil, 0.3);
    settle(grid);
    expect(grid.activeCount).toBe(0);
    expect(grid.step()).toBe(0);
  });

  it('is deterministic', () => {
    const run = () => {
      const { grid } = makeGrid(['#.......#', '#.......#', '#.##....#', '#########']);
      grid.addFluid(3, 0, oil, 1);
      grid.addFluid(5, 0, oil, 1);
      for (let n = 0; n < 40; n++) grid.step();
      return Array.from({ length: 27 }, (_, i) => grid.getLevel(i % 9, Math.floor(i / 9)));
    };
    expect(run()).toEqual(run());
  });

  it('never lets fluid into solid cells', () => {
    const { grid } = makeGrid(['#.#.#', '#####']);
    grid.addFluid(1, 0, oil, 1);
    settle(grid);
    expect(grid.getLevel(0, 0)).toBe(0);
    expect(grid.getLevel(2, 0)).toBe(0);
    expect(grid.getLevel(3, 0)).toBe(0);
  });

  it('keeps cells within full level plus the squeeze allowance when settled', () => {
    const { grid } = makeGrid(['#.#', '#.#', '#.#', '###']);
    for (let y = 0; y < 3; y++) grid.addFluid(1, y, oil, 1);
    settle(grid, 3000);
    for (let y = 0; y < 3; y++) expect(grid.getLevel(1, y)).toBeLessThanOrEqual(FLUID_FULL_LEVEL + 3 * FLUID_MAX_COMPRESSION);
  });
});

describe('FluidGrid densities', () => {
  it('sinks denser fluid under lighter fluid and keeps both', () => {
    const { grid } = makeGrid(['#.#', '#.#', '###']);
    grid.addFluid(1, 1, oil, 1);
    grid.addFluid(1, 0, water, 1);
    settle(grid);
    expect(grid.getFluidId(1, 1)).toBe(water);
    expect(grid.getFluidId(1, 0)).toBe(oil);
    expect(grid.totalVolume(oil)).toBeCloseTo(1, 3);
    expect(grid.totalVolume(water)).toBeCloseTo(1, 3);
  });

  it('does not let a fluid flow sideways into a different fluid', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(1, 0, oil, 0.8);
    grid.addFluid(3, 0, water, 0.8);
    settle(grid);
    expect(grid.getFluidId(3, 0)).toBe(water);
    expect(grid.getFluidId(1, 0)).toBe(oil);
  });
});

describe('FluidGrid tile changes', () => {
  it('pushes fluid out of a cell that becomes solid, upwards first', () => {
    const { grid, solid } = makeGrid(['...', '...', '###']);
    grid.addFluid(1, 1, oil, 0.6);
    solid[1][1] = '#';
    grid.onTileChanged(1, 1);
    expect(grid.getLevel(1, 1)).toBe(0);
    expect(grid.getLevel(1, 0)).toBeCloseTo(0.6, 5);
    expect(grid.evaporatedVolume).toBe(0);
  });

  it('spills what the first neighbour cannot hold into the next', () => {
    const { grid, solid } = makeGrid(['...', '...', '###']);
    grid.addFluid(1, 0, oil, 0.7);
    grid.addFluid(1, 1, oil, 0.6);
    solid[1][1] = '#';
    grid.onTileChanged(1, 1);
    expect(grid.getLevel(1, 0)).toBeCloseTo(1, 5);
    expect(grid.getLevel(0, 1) + grid.getLevel(2, 1)).toBeCloseTo(0.3, 5);
    expect(grid.evaporatedVolume).toBe(0);
  });

  it('loses what has nowhere to go', () => {
    const { grid, solid } = makeGrid(['#.#', '###']);
    grid.addFluid(1, 0, oil, 0.9);
    solid[0][1] = '#';
    grid.onTileChanged(1, 0);
    expect(grid.totalVolume()).toBe(0);
    expect(grid.evaporatedVolume).toBeCloseTo(0.9, 5);
  });

  it('leaves other fluids alone when displacing', () => {
    const { grid, solid } = makeGrid(['...', '###']);
    grid.addFluid(0, 0, water, 1);
    grid.addFluid(1, 0, oil, 0.5);
    solid[0][1] = '#';
    grid.onTileChanged(1, 0);
    expect(grid.getFluidId(0, 0)).toBe(water);
    expect(grid.getFluidId(2, 0)).toBe(oil);
    expect(grid.getLevel(0, 0)).toBe(1);
  });
});

describe('FluidGrid changes', () => {
  it('reports each changed cell once with its current contents, then forgets', () => {
    const { grid } = makeGrid(['#.#', '#.#', '###']);
    grid.addFluid(1, 0, oil, 1);
    expect(grid.drainChanges()).toEqual([{ x: 1, y: 0, fluidId: oil, level: 1 }]);
    expect(grid.drainChanges()).toEqual([]);
    grid.step();
    const changes = grid.drainChanges();
    expect(changes.find((c) => c.x === 1 && c.y === 1)?.fluidId).toBe(oil);
    expect(new Set(changes.map((c) => `${c.x},${c.y}`)).size).toBe(changes.length);
  });

  it('reports a cell that emptied as fluid id 0', () => {
    const { grid } = makeGrid(['#.#', '###']);
    grid.addFluid(1, 0, oil, 0.02);
    grid.drainChanges();
    grid.step();
    expect(grid.drainChanges()).toEqual([{ x: 1, y: 0, fluidId: NO_FLUID, level: 0 }]);
  });
});

describe('FluidGrid draining', () => {
  it('takes fluid out of a cell and reports what it took', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(2, 0, oil, 0.6);
    expect(grid.drainFluid(2, 0, 0.25)).toBeCloseTo(0.25, 5);
    expect(grid.getLevel(2, 0)).toBeCloseTo(0.35, 5);
    expect(grid.drainedVolume).toBeCloseTo(0.25, 5);
  });

  it('empties the cell when asked for more than is there, taking only what exists', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(2, 0, oil, 0.2);
    expect(grid.drainFluid(2, 0, 5)).toBeCloseTo(0.2, 5);
    expect(grid.getFluidId(2, 0)).toBe(NO_FLUID);
    expect(grid.getLevel(2, 0)).toBe(0);
  });

  it('takes nothing from an empty, outside or invalid request', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    expect(grid.drainFluid(2, 0, 1)).toBe(0);
    expect(grid.drainFluid(9, 0, 1)).toBe(0);
    grid.addFluid(2, 0, oil, 0.5);
    expect(grid.drainFluid(2, 0, 0)).toBe(0);
    expect(grid.drainFluid(2, 0, -1)).toBe(0);
    expect(grid.getLevel(2, 0)).toBeCloseTo(0.5, 5);
  });

  it('reports the change and lets neighbours flow into the gap', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(1, 0, oil, 0.8);
    grid.addFluid(2, 0, oil, 0.8);
    settle(grid);
    grid.drainChanges();
    grid.drainFluid(2, 0, 0.1);
    expect(grid.drainChanges()).toEqual([{ x: 2, y: 0, fluidId: oil, level: expect.any(Number) }]);
    expect(grid.activeCount).toBeGreaterThan(0);
  });
});
