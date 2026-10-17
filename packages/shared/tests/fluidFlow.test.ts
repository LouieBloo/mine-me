import { describe, it, expect } from 'vitest';
import { DEFAULT_FLUID_APPEARANCE, FLOW_STREAKS_PER_CELL, fluidFlowStreaks, resolveFluidAppearance, validateFluidAppearance } from '../src/index';

const T = 64;
const look = DEFAULT_FLUID_APPEARANCE;

describe('flow streaks', () => {
  it('stay inside their cell and are a few thin vertical dashes', () => {
    for (let cy = 0; cy < 4; cy++) {
      const streaks = fluidFlowStreaks(3, cy, T, 0.37, look);
      expect(streaks.length).toBeGreaterThan(0);
      for (const s of streaks) {
        expect(s.y).toBeGreaterThanOrEqual(cy * T - 1e-9);
        expect(s.y + s.height).toBeLessThanOrEqual((cy + 1) * T + 1e-9);
        expect(s.x).toBeGreaterThanOrEqual(3 * T);
        expect(s.x + s.width).toBeLessThanOrEqual(4 * T);
        expect(s.height).toBeLessThan(T);
      }
    }
  });

  it('depend only on the column, the world position and time: the cell above agrees with the cell below at their edge', () => {
    // A streak running across the boundary is cut at it: the two halves are the same streak (same x, touching)
    for (let t = 0; t < 2; t += 0.13) {
      const above = fluidFlowStreaks(5, 2, T, t, look);
      const below = fluidFlowStreaks(5, 3, T, t, look);
      for (const a of above) {
        if (Math.abs(a.y + a.height - 3 * T) > 1e-9) continue;
        const b = below.find((s) => Math.abs(s.y - 3 * T) < 1e-9 && s.x === a.x);
        expect(b, `streak continues below at t=${t}`).toBeDefined();
      }
    }
  });

  it('run down over time, repeating every cell', () => {
    const at = (t: number) => fluidFlowStreaks(1, 1, T, t, look).map((s) => s.y + s.height / 2);
    const period = 1 / look.flowSpeed;
    expect(at(0).length).toBeGreaterThan(0);
    const later = fluidFlowStreaks(1, 1, T, 0.1, look).map((s) => s.y).sort((a, b) => a - b);
    const earlier = fluidFlowStreaks(1, 1, T, 0, look).map((s) => s.y).sort((a, b) => a - b);
    expect(later).not.toEqual(earlier);
    const wrapped = fluidFlowStreaks(1, 1, T, period, look).map((s) => Math.round(s.y * 1000)).sort((a, b) => a - b);
    expect(wrapped).toEqual(earlier.map((y) => Math.round(y * 1000)));
  });

  it('are the same in two separate calls (a redraw never restarts them)', () => {
    expect(fluidFlowStreaks(2, 4, T, 1.234, look)).toEqual(fluidFlowStreaks(2, 4, T, 1.234, look));
  });

  it('differ from column to column, and vanish when the fluid does not flow or has no streaks', () => {
    expect(fluidFlowStreaks(2, 4, T, 0, look)[0].x - 2 * T).not.toBe(fluidFlowStreaks(3, 4, T, 0, look)[0].x - 3 * T);
    expect(fluidFlowStreaks(2, 4, T, 0, { ...look, flowSpeed: 0 })).toEqual([]);
    expect(fluidFlowStreaks(2, 4, T, 0, { ...look, flowStreaks: 0 })).toEqual([]);
  });

  it('are cut off above where the fluid starts', () => {
    for (const s of fluidFlowStreaks(2, 4, T, 0.2, look, 4 * T + 40)) expect(s.y).toBeGreaterThanOrEqual(4 * T + 40);
    expect(FLOW_STREAKS_PER_CELL).toBe(3);
  });
});

describe('the flow appearance settings', () => {
  it('have defaults, are filled in for old rows, and are clamped and validated like the rest', () => {
    expect(resolveFluidAppearance({ waveAmplitude: 0.1 }).flowSpeed).toBe(look.flowSpeed);
    expect(resolveFluidAppearance({ flowSpeed: 99, flowStreaks: -1 })).toMatchObject({ flowSpeed: 12, flowStreaks: 0 });
    expect(validateFluidAppearance({ flowSpeed: 3, flowStreaks: 0.5 })).toEqual([]);
    expect(validateFluidAppearance({ flowSpeed: 13 })).toHaveLength(1);
    expect(validateFluidAppearance({ flowStreaks: 2 })).toHaveLength(1);
  });
});
