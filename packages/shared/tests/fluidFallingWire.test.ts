import { describe, it, expect } from 'vitest';
import { FluidField, FluidGrid, FluidRegistry, quantizeFluidLevel, toFluidWireCell } from '../src/index';

/** What is falling is told to clients as a flag, so a column of full cells falling is not mistaken for one standing still. */
const WATER = { typeKey: 'WATER', density: 1, flowRate: 0.6, minLevel: 0.02, flowThreshold: 0.01 };
const q = quantizeFluidLevel;

const sky = () => new FluidGrid(9, 12, new FluidRegistry([WATER]), (x, y) => y >= 11 || x < 0 || x >= 9);

describe('the grid knows what is falling', () => {
  it('fluid with room below it is falling the moment it is placed; resting fluid is not', () => {
    const grid = sky();
    grid.setCell(4, 1, 1, 1);
    expect(grid.isFalling(4, 1)).toBe(true);
    expect(grid.getFalling(4, 1)).toBe(1);
    grid.setCell(4, 10, 1, 0.5);
    expect(grid.isFalling(4, 10)).toBe(false);
    expect(grid.getFalling(4, 10)).toBe(0);
  });

  it('a falling column keeps falling on every step, and stops when it lands', () => {
    const grid = sky();
    grid.setCell(4, 1, 1, 1);
    for (let i = 0; i < 8; i++) {
      grid.step();
      expect(grid.isFalling(4, 2 + i), `step ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 30; i++) grid.step();
    for (let x = 0; x < 9; x++) expect(grid.isFalling(x, 10)).toBe(false);
  });

  it('tells about a cell whose fluid stops falling even when its level stays the same', () => {
    // A full cell drops one cell in a one-wide closed shaft and lands: still full, no longer falling
    const rows = ['###', '#.#', '#.#', '###'];
    const grid = new FluidGrid(3, 4, new FluidRegistry([WATER]), (x, y) => rows[y][x] === '#');
    grid.setCell(1, 1, 1, 1);
    grid.drainChanges();
    grid.step();
    expect(grid.getLevel(1, 2)).toBe(1);
    expect(grid.isFalling(1, 2)).toBe(false);
    expect(grid.drainChanges()).toContainEqual({ x: 1, y: 2, fluidId: 1, level: 1, falling: 0 });
  });

  it('a cell above a full resting cell rests, and starts falling when the support is removed', () => {
    const rows = ['#.#', '#.#', '#.#', '###'];
    const solid = rows.map((r) => r.split(''));
    const grid = new FluidGrid(3, 4, new FluidRegistry([WATER]), (x, y) => solid[y][x] === '#');
    for (let y = 0; y < 3; y++) grid.setCell(1, y, 1, 1);
    for (let y = 0; y < 3; y++) expect(grid.isFalling(1, y)).toBe(false);
    solid[3][1] = '.';
    grid.onTileChanged(1, 3);
    expect(grid.isFalling(1, 2)).toBe(true);
  });
});

describe('falling on the wire', () => {
  it('a falling cell carries a fifth value of 1; a still one does not', () => {
    expect(toFluidWireCell(1, 2, 3, 0.5, 0.5)).toEqual([1, 2, 3, q(0.5), 1]);
    expect(toFluidWireCell(1, 2, 3, 0.5, 0)).toEqual([1, 2, 3, q(0.5)]);
    expect(toFluidWireCell(1, 2, 3, 0, 1)).toEqual([1, 2, 0, 0]);
  });

  it('the client copy keeps it, and a change in it alone counts as a change', () => {
    const field = new FluidField(4, 4);
    field.apply([[1, 1, 1, q(0.5), 1]]);
    expect(field.isFalling(1, 1)).toBe(true);
    expect(field.getFalling(1, 1)).toBeCloseTo(0.5, 6);
    expect(field.apply([[1, 1, 1, q(0.5)]])).toHaveLength(1);
    expect(field.isFalling(1, 1)).toBe(false);
    expect(field.getFalling(1, 1)).toBe(0);
  });

  it('a grid change round-trips through the wire to the same picture', () => {
    const grid = sky();
    grid.setCell(4, 1, 1, 1);
    grid.step();
    const field = new FluidField(9, 12);
    for (const c of grid.drainChanges()) field.apply([toFluidWireCell(c.x, c.y, c.fluidId, c.level, c.falling)]);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 9; x++) {
        expect(field.getLevel(x, y)).toBe(grid.getLevel(x, y));
        expect(field.isFalling(x, y)).toBe(grid.isFalling(x, y));
      }
    }
  });
});
