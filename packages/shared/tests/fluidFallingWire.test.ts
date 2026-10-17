import { describe, it, expect } from 'vitest';
import {
  FluidDisplay, FluidField, FluidGrid, FluidLayout, FluidRegistry, fallHurry, freeFallShare, quantizeFluidLevel, toFluidWireCell,
} from '../src/index';

/** What falls is told to clients, and drawn moving (the sandbox report: falling water smeared into thin lines). */
const WATER = { typeKey: 'WATER', density: 1, flowRate: 0.6, minLevel: 0.02, flowThreshold: 0.01 };
const T = 64;
const q = quantizeFluidLevel;

const sky = () => new FluidGrid(9, 12, new FluidRegistry([WATER]), (x, y) => y >= 11 || x < 0 || x >= 9);

describe('the grid records what fell', () => {
  it('a cell that fluid fell into reports it as falling; resting fluid reports none', () => {
    const grid = sky();
    grid.setCell(4, 1, 1, 1);
    expect(grid.getFalling(4, 1)).toBe(0); // placed, not fallen
    grid.step();
    expect(grid.getFalling(4, 2)).toBeCloseTo(1, 6);
    for (let i = 0; i < 20; i++) grid.step();
    for (let x = 0; x < 9; x++) expect(grid.getFalling(x, 10)).toBe(0); // landed and spread out
  });

  it('tells about a cell whose fluid stops falling even when its level stays the same', () => {
    // A full cell drops one cell in a one-wide closed shaft and lands: still full, no longer falling
    const rows = ['###', '#.#', '#.#', '###'];
    const grid = new FluidGrid(3, 4, new FluidRegistry([WATER]), (x, y) => rows[y][x] === '#');
    grid.setCell(1, 1, 1, 1);
    grid.step();
    expect(grid.getFalling(1, 2)).toBeCloseTo(1, 6);
    grid.drainChanges();
    grid.step();
    expect(grid.getLevel(1, 2)).toBeCloseTo(1, 6);
    expect(grid.getFalling(1, 2)).toBe(0);
    expect(grid.drainChanges()).toContainEqual({ x: 1, y: 2, fluidId: 1, level: expect.any(Number), falling: 0 });
  });
});

describe('falling on the wire', () => {
  it('a falling cell carries a fifth value; a still one does not', () => {
    expect(toFluidWireCell(1, 2, 3, 0.5, 0.5)).toEqual([1, 2, 3, q(0.5), q(0.5)]);
    expect(toFluidWireCell(1, 2, 3, 0.5, 0)).toEqual([1, 2, 3, q(0.5)]);
    expect(toFluidWireCell(1, 2, 3, 0.5, 0.9)).toEqual([1, 2, 3, q(0.5), q(0.5)]); // never more than the level
  });

  it('the client copy keeps it, and a change in it alone counts as a change', () => {
    const field = new FluidField(4, 4);
    field.apply([[1, 1, 1, q(0.5), q(0.5)]]);
    expect(field.getFalling(1, 1)).toBeCloseTo(0.5, 2);
    expect(field.apply([[1, 1, 1, q(0.5)]])).toHaveLength(1);
    expect(field.getFalling(1, 1)).toBe(0);
  });
});

describe('drawing falling fluid', () => {
  const open = (x: number, y: number) => y >= 11 || x < 0 || x >= 9;

  it('a cell in free fall is hurried; landed fluid and a steady stream are not', () => {
    const blob = new FluidField(9, 12);
    blob.apply([[4, 5, 1, q(1), q(1)]]);
    expect(freeFallShare(blob, 4, 5, open)).toBeCloseTo(1, 2);
    expect(fallHurry(blob, 4, 5, open)).toBeCloseTo(1, 2); // the cell it left is empty
    const landed = new FluidField(9, 12);
    landed.apply([[4, 10, 1, q(1), q(1)]]);
    expect(freeFallShare(landed, 4, 10, open)).toBe(0); // the ground holds it
    const stream = new FluidField(9, 12);
    stream.apply([[4, 4, 1, q(0.5), q(0.5)], [4, 5, 1, q(0.5), q(0.5)]]);
    expect(fallHurry(stream, 4, 5, open)).toBe(0); // the cell above is as full as before
  });

  it('a hurried cell eases to its new level almost at once; others ease gently', () => {
    const d = new FluidDisplay(4, 4);
    d.setNow(1, 1, 1, 0);
    d.setNow(2, 1, 1, 0);
    d.setTarget(1, 1, 1, 1, 1);
    d.setTarget(2, 1, 1, 1);
    d.hurry(1, 1, 1);
    for (let f = 0; f < 3; f++) d.step(1 / 60);
    expect(d.getLevel(1, 1)).toBeGreaterThan(0.95);
    expect(d.getLevel(2, 1)).toBeLessThan(0.5);
  });

  it('a falling blob is drawn sliding down from the cell above over the step, the same size all the way', () => {
    const field = new FluidField(9, 12);
    field.apply([[4, 5, 1, q(1), q(1)]]);
    const extentAt = (progress: number) => {
      const layout = new FluidLayout(field, T, open, { fallProgress: progress });
      const pieces = [4, 5].flatMap((y) => layout.shapesAt(4, y).filter((s) => s.stream));
      const top = Math.min(...pieces.map((p) => p.top));
      const bottom = Math.max(...pieces.map((p) => p.bottom));
      return { top, bottom, size: pieces[0].width * (bottom - top) };
    };
    expect(extentAt(0).top).toBeCloseTo(4 * T, 0); // still where it was: the cell above
    expect(extentAt(1).top).toBeCloseTo(5 * T, 0); // arrived
    expect(extentAt(0.5).top).toBeCloseTo(4.5 * T, 0);
    for (const p of [0, 0.25, 0.5, 0.75, 1]) expect(extentAt(p).size).toBeCloseTo(T * T, -1);
  });

  it('without falling information everything is drawn in its cell, as before', () => {
    const field = new FluidField(9, 12);
    field.apply([[4, 5, 1, q(1)]]);
    const a = new FluidLayout(field, T, open, { fallProgress: 0 }).shapesAt(4, 5);
    const b = new FluidLayout(field, T, open).shapesAt(4, 5);
    expect(a).toEqual(b);
  });
});
