import { describe, it, expect } from 'vitest';
import { FluidGrid, FluidRegistry, NO_FLUID, FLUID_FULL_LEVEL, FLUID_UNITS, FLUID_FILM_EVAPORATE_STEPS } from '../src/index';

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

  it('fills the low part of a U-bend and stops: there is no pressure to push it up the other arm', () => {
    const { grid } = makeGrid(['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#...#', '#####']);
    for (let y = 1; y <= 4; y++) grid.addFluid(1, y, water, 1);
    const before = grid.totalVolume();
    settle(grid, 5000);
    // The arm it was poured into stays full to where it was; the bottom row is covered; the far arm stays empty
    expect(grid.getLevel(3, 4)).toBeGreaterThan(0.5);
    expect(grid.getLevel(3, 2)).toBe(0);
    expect(grid.totalVolume() + grid.evaporatedVolume).toBeCloseTo(before, 3);
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

  it('never holds more than a full cell, and refuses to add past it', () => {
    const { grid } = makeGrid(['#.#', '###']);
    expect(grid.addFluid(1, 0, oil, 1)).toBe(true);
    expect(grid.addFluid(1, 0, oil, 0.5)).toBe(false);
    expect(grid.getUnits(1, 0)).toBe(FLUID_UNITS);
    grid.addFluid(1, 0, oil, 0);
    expect(grid.getLevel(1, 0)).toBe(FLUID_FULL_LEVEL);
  });

  it('stores whole units: an amount rounds to the nearest 1/16 and anything smaller adds nothing', () => {
    const { grid } = makeGrid(['#.#', '###']);
    expect(grid.addFluid(1, 0, oil, 0.01)).toBe(false);
    expect(grid.addFluid(1, 0, oil, 0.3)).toBe(true);
    expect(grid.getUnits(1, 0)).toBe(5);
    expect(grid.getLevel(1, 0)).toBeCloseTo(5 / 16, 6);
  });

  it('evaporates a lone one-unit film after a while, and keeps a film held up by deeper fluid beside it', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(1, 0, oil, 1 / 16);
    grid.addFluid(3, 0, oil, 3 / 16);
    grid.addFluid(2, 0, oil, 2 / 16);
    // (1,0) has the 2-unit cell beside it, so it is held up; the whole thing settles instead of evaporating
    for (let n = 0; n < FLUID_FILM_EVAPORATE_STEPS + 5; n++) grid.step();
    expect(grid.evaporatedVolume).toBe(0);

    const lone = makeGrid(['#.#', '###']).grid;
    lone.addFluid(1, 0, oil, 1 / 16);
    for (let n = 0; n < FLUID_FILM_EVAPORATE_STEPS - 2; n++) lone.step();
    expect(lone.getUnits(1, 0)).toBe(1);
    expect(lone.filmCount).toBe(1);
    for (let n = 0; n < 4; n++) lone.step();
    expect(lone.getUnits(1, 0)).toBe(0);
    expect(lone.evaporatedVolume).toBeCloseTo(1 / 16, 6);
    expect(lone.filmCount).toBe(0);
  });

  it('forgets a film that is added to before it evaporates', () => {
    const { grid } = makeGrid(['#.#', '###']);
    grid.addFluid(1, 0, oil, 1 / 16);
    for (let n = 0; n < FLUID_FILM_EVAPORATE_STEPS - 10; n++) grid.step();
    grid.addFluid(1, 0, oil, 1 / 16);
    for (let n = 0; n < FLUID_FILM_EVAPORATE_STEPS + 10; n++) grid.step();
    expect(grid.getUnits(1, 0)).toBe(2);
    expect(grid.evaporatedVolume).toBe(0);
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

  it('does not shuffle fluid between cells that differ by a single unit', () => {
    const { grid } = makeGrid(['#..#', '####']);
    grid.addFluid(1, 0, oil, 5 / 16);
    grid.addFluid(2, 0, oil, 4 / 16);
    grid.step();
    expect(grid.getUnits(1, 0)).toBe(5);
    expect(grid.getUnits(2, 0)).toBe(4);
    expect(grid.step()).toBe(0);
    expect(grid.activeCount).toBe(0);
  });

  it('moves fluid between cells that differ by two units, towards level', () => {
    const { grid } = makeGrid(['#..#', '####']);
    grid.addFluid(1, 0, water, 6 / 16);
    grid.addFluid(2, 0, water, 4 / 16);
    grid.step();
    grid.step();
    expect(grid.getUnits(1, 0)).toBe(5);
    expect(grid.getUnits(2, 0)).toBe(5);
  });

  it('a slow fluid still spreads, one unit at a time, and stays awake until it has', () => {
    const slow = new FluidRegistry([{ typeKey: 'TAR', density: 2, flowRate: 0.06, minLevel: 0.05, flowThreshold: 0.03 }]);
    const { grid } = makeGrid(['#.....#', '#######'], slow);
    grid.addFluid(3, 0, 1, 1);
    for (let n = 0; n < 5; n++) grid.step();
    expect(grid.activeCount).toBeGreaterThan(0);
    settle(grid, 5000);
    expect(grid.activeCount).toBe(0);
    expect(grid.getUnits(3, 0)).toBeLessThan(FLUID_UNITS);
    expect(grid.getLevel(1, 0)).toBeGreaterThan(0);
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

  it('keeps a full column exactly full when settled (no squeezing)', () => {
    const { grid } = makeGrid(['#.#', '#.#', '#.#', '###']);
    for (let y = 0; y < 3; y++) grid.addFluid(1, y, oil, 1);
    settle(grid, 3000);
    for (let y = 0; y < 3; y++) expect(grid.getLevel(1, y)).toBe(FLUID_FULL_LEVEL);
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
    grid.addFluid(1, 1, oil, 0.5);
    solid[1][1] = '#';
    grid.onTileChanged(1, 1);
    expect(grid.getLevel(1, 1)).toBe(0);
    expect(grid.getLevel(1, 0)).toBeCloseTo(0.5, 5);
    expect(grid.evaporatedVolume).toBe(0);
  });

  it('spills what the first neighbour cannot hold into the next', () => {
    const { grid, solid } = makeGrid(['...', '...', '###']);
    grid.addFluid(1, 0, oil, 0.75);
    grid.addFluid(1, 1, oil, 0.5);
    solid[1][1] = '#';
    grid.onTileChanged(1, 1);
    expect(grid.getLevel(1, 0)).toBeCloseTo(1, 5);
    expect(grid.getLevel(0, 1) + grid.getLevel(2, 1)).toBeCloseTo(0.25, 5);
    expect(grid.evaporatedVolume).toBe(0);
  });

  it('loses what has nowhere to go', () => {
    const { grid, solid } = makeGrid(['#.#', '###']);
    grid.addFluid(1, 0, oil, 0.75);
    solid[0][1] = '#';
    grid.onTileChanged(1, 0);
    expect(grid.totalVolume()).toBe(0);
    expect(grid.evaporatedVolume).toBeCloseTo(0.75, 5);
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
    expect(grid.drainChanges()).toEqual([{ x: 1, y: 0, fluidId: oil, level: 1, falling: 1 }]);
    expect(grid.drainChanges()).toEqual([]);
    grid.step();
    const changes = grid.drainChanges();
    expect(changes.find((c) => c.x === 1 && c.y === 1)?.fluidId).toBe(oil);
    expect(new Set(changes.map((c) => `${c.x},${c.y}`)).size).toBe(changes.length);
  });

  it('reports a cell that emptied as fluid id 0', () => {
    const { grid } = makeGrid(['#.#', '###']);
    grid.addFluid(1, 0, oil, 1 / 16);
    grid.drainChanges();
    grid.drainFluid(1, 0, 1 / 16);
    expect(grid.drainChanges()).toEqual([{ x: 1, y: 0, fluidId: NO_FLUID, level: 0, falling: 0 }]);
  });
});

describe('FluidGrid draining', () => {
  it('takes fluid out of a cell and reports what it took', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(2, 0, oil, 0.5);
    expect(grid.drainFluid(2, 0, 0.25)).toBeCloseTo(0.25, 5);
    expect(grid.getLevel(2, 0)).toBeCloseTo(0.25, 5);
    expect(grid.drainedVolume).toBeCloseTo(0.25, 5);
  });

  it('adds up tiny drains (fire burns in small pieces) until a whole unit is due', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(2, 0, oil, 1);
    for (let n = 0; n < 50; n++) grid.drainFluid(2, 0, 0.01);
    // 50 x 0.01 = half a cell
    expect(grid.getUnits(2, 0)).toBe(8);
    for (let n = 0; n < 50; n++) grid.drainFluid(2, 0, 0.01);
    expect(grid.getUnits(2, 0)).toBe(0);
    expect(grid.getFluidId(2, 0)).toBe(NO_FLUID);
    expect(grid.drainedVolume).toBeCloseTo(1, 5);
  });

  it('forgets a half-drained piece when the cell is emptied and filled again', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(2, 0, oil, 1);
    grid.drainFluid(2, 0, 0.04);
    grid.setCell(2, 0, oil, 1);
    grid.drainFluid(2, 0, 0.03);
    expect(grid.getUnits(2, 0)).toBe(FLUID_UNITS);
  });

  it('empties the cell when asked for more than is there, taking only what exists', () => {
    const { grid } = makeGrid(['#...#', '#####']);
    grid.addFluid(2, 0, oil, 0.25);
    expect(grid.drainFluid(2, 0, 5)).toBeCloseTo(0.25, 5);
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
    expect(grid.drainChanges()).toEqual([{ x: 2, y: 0, fluidId: oil, level: expect.any(Number), falling: 0 }]);
    expect(grid.activeCount).toBeGreaterThan(0);
  });
});
