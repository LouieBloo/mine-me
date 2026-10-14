import { describe, it, expect } from 'vitest';
import { FLUID_DISPLAY_EASE_SECONDS, FluidDisplay } from '../src/index';

const FRAME = 1 / 60;
const run = (d: FluidDisplay, seconds: number) => {
  let changed = 0;
  for (let t = 0; t < seconds; t += FRAME) changed += d.step(FRAME).length;
  return changed;
};

describe('FluidDisplay', () => {
  it('shows a cell at once with setNow, and says whether anything changed', () => {
    const d = new FluidDisplay(4, 4);
    expect(d.setNow(1, 1, 2, 0.5)).toBe(true);
    expect(d.getFluidId(1, 1)).toBe(2);
    expect(d.getLevel(1, 1)).toBe(0.5);
    expect(d.setNow(1, 1, 2, 0.5)).toBe(false);
    expect(d.movingCount).toBe(0);
  });

  it('eases towards a new level instead of jumping, then settles exactly on it', () => {
    const d = new FluidDisplay(4, 4);
    d.setNow(1, 1, 1, 0.2);
    d.setTarget(1, 1, 1, 0.8);
    expect(d.getLevel(1, 1)).toBe(0.2);
    d.step(FLUID_DISPLAY_EASE_SECONDS);
    // One time constant covers about two thirds of the way
    expect(d.getLevel(1, 1)).toBeCloseTo(0.2 + 0.6 * (1 - Math.exp(-1)), 3);
    run(d, 2);
    expect(d.getLevel(1, 1)).toBe(0.8);
    expect(d.movingCount).toBe(0);
  });

  it('reports the cells that moved, and nothing once still', () => {
    const d = new FluidDisplay(4, 4);
    d.setTarget(2, 3, 1, 0.5);
    expect(d.step(FRAME)).toEqual([[2, 3]]);
    run(d, 2);
    expect(d.step(FRAME)).toEqual([]);
    expect(d.step(0)).toEqual([]);
  });

  it('fluid arriving in an empty cell grows from nothing, as its own fluid', () => {
    const d = new FluidDisplay(4, 4);
    d.setTarget(1, 1, 3, 1);
    d.step(FRAME);
    expect(d.getFluidId(1, 1)).toBe(3);
    expect(d.getLevel(1, 1)).toBeGreaterThan(0);
    expect(d.getLevel(1, 1)).toBeLessThan(0.2);
  });

  it('fluid draining away keeps its fluid until it is gone, then the cell is empty', () => {
    const d = new FluidDisplay(4, 4);
    d.setNow(1, 1, 3, 0.6);
    d.setTarget(1, 1, 0, 0);
    d.step(FRAME);
    expect(d.getFluidId(1, 1)).toBe(3);
    run(d, 2);
    expect(d.getFluidId(1, 1)).toBe(0);
    expect(d.getLevel(1, 1)).toBe(0);
  });

  it('a different fluid taking a cell shows at once (it would be wrong to blend two fluids)', () => {
    const d = new FluidDisplay(4, 4);
    d.setNow(1, 1, 1, 0.6);
    d.setTarget(1, 1, 2, 0.6);
    expect(d.getFluidId(1, 1)).toBe(2);
    expect(d.getLevel(1, 1)).toBe(0.6);
  });

  it('damps the simulation\'s step-to-step pulsing (a level see-sawing every step) to a fraction of it', () => {
    const d = new FluidDisplay(4, 4);
    d.setNow(1, 1, 1, 0.2);
    const seen: number[] = [];
    for (let step = 0; step < 40; step++) {
      d.setTarget(1, 1, 1, step % 2 === 0 ? 0.16 : 0.25);
      for (let f = 0; f < 6; f++) d.step(FRAME); // 10 steps a second at 60 frames a second
      if (step > 20) seen.push(d.getLevel(1, 1));
    }
    const swing = Math.max(...seen) - Math.min(...seen);
    expect(swing).toBeLessThan(0.4 * (0.25 - 0.16));
  });

  it('ignores cells outside the grid', () => {
    const d = new FluidDisplay(2, 2);
    expect(d.setNow(5, 5, 1, 1)).toBe(false);
    d.setTarget(-1, 0, 1, 1);
    expect(d.movingCount).toBe(0);
    expect(d.getLevel(9, 9)).toBe(0);
  });
});
