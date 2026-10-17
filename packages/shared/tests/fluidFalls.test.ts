import { describe, it, expect } from 'vitest';
import { FluidDisplay, FluidField, FluidGrid, FluidLayout, FluidRegistry, fallHurry, toFluidWireCell, type FluidShape } from '../src/index';

/**
 * Water drawn while it flows between cells, through the real simulation and the easing the client does: a pool on the
 * ground spilling over a lip into a one-wide shaft (the owner's screenshot). The fall must be one unbroken jet from the
 * lip down to where it lands, and the spill must join the pool's surface to the jet.
 */
const WATER = { typeKey: 'WATER', density: 1, flowRate: 0.6, minLevel: 0.02, flowThreshold: 0.01 };
const T = 64;
const W = 11;
const H = 17;
const SHAFT = 8;
const GROUND = 6;
const solid = (x: number, y: number) => x < 0 || x >= W || y >= H - 1 || (y >= GROUND && x !== SHAFT);

function* frames(steps: number) {
  const grid = new FluidGrid(W, H, new FluidRegistry([WATER]), solid);
  const display = new FluidDisplay(W, H);
  for (let step = 0; step < steps; step++) {
    if (step < 40) grid.addFluid(2, 3, 1, 0.3);
    grid.step();
    const field = new FluidField(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = grid.getFluidId(x, y);
      if (id) field.apply([toFluidWireCell(x, y, id, grid.getLevel(x, y), grid.getFalling(x, y))]);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) display.setTarget(x, y, field.getFluidId(x, y), field.getLevel(x, y), field.getFalling(x, y));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const quick = fallHurry(field, x, y, solid); if (quick > 0) { display.hurry(x, y, quick); display.hurry(x, y - 1, quick); } }
    for (let f = 0; f < 6; f++) display.step(1 / 60);
    yield { step, grid, layout: new FluidLayout(display, T, solid) };
  }
}

/** Pixel rows of the shaft covered by stream shapes, from the top of the shaft down. */
function streamCoverage(layout: FluidLayout): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let y = GROUND; y < H - 1; y++) {
    for (const s of layout.shapesAt(SHAFT, y)) if (s.stream) spans.push([s.top, s.bottom]);
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

describe('water falling between cells', () => {
  it('a fall down a shaft is one unbroken jet: no gap between cells, the same width and place all the way down', () => {
    let checked = 0;
    for (const { step, grid, layout } of frames(60)) {
      if (step < 30 || grid.getLevel(SHAFT, GROUND + 3) <= 0) continue;
      const spans = streamCoverage(layout);
      expect(spans.length, `step ${step}`).toBeGreaterThan(3);
      for (let i = 1; i < spans.length; i++) expect(spans[i][0] - spans[i - 1][1], `gap at step ${step}`).toBeLessThan(0.5);
      const pieces: FluidShape[] = [];
      for (let y = GROUND; y < H - 1; y++) pieces.push(...layout.shapesAt(SHAFT, y).filter((s) => s.stream));
      expect(new Set(pieces.map((p) => p.width.toFixed(3))).size).toBe(1);
      expect(new Set(pieces.map((p) => p.x.toFixed(3))).size).toBe(1);
      expect(pieces[0].width).toBeGreaterThanOrEqual(0.12 * T); // a trickle is still visible
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('the jet starts right under the lip and runs down the side the water comes over', () => {
    for (const { step, layout } of frames(50)) {
      if (step < 35) continue;
      const first = layout.shapesAt(SHAFT, GROUND).find((s) => s.stream)!;
      expect(first.top).toBeCloseTo(GROUND * T, 0);
      expect(first.x).toBeLessThanOrEqual(SHAFT * T + (T - first.width) / 2 + 0.5); // never pressed to the far side: the pool is on the left
    }
  });

  it('the water at the lip is drawn as a spill joining the pool\'s surface to the jet, never as nothing', () => {
    let checked = 0;
    for (const { step, grid, layout } of frames(60)) {
      if (step < 30 || grid.getLevel(SHAFT, GROUND - 1) <= 0.01) continue;
      const lip = layout.shapesAt(SHAFT, GROUND - 1);
      const spill = lip.find((s) => s.spill);
      expect(spill, `step ${step}`).toBeDefined();
      // It starts at the pool's surface where the pool meets the lip
      const pool = layout.shapesAt(SHAFT - 1, GROUND - 1).find((s) => !s.stream && !s.spill)!;
      expect(Math.abs(spill!.topLeft - pool.topRight), `step ${step}`).toBeLessThan(1);
      // ...and comes down to the bottom of the lip cell, where the jet starts
      const ys = spill!.spill!.filter((_, i) => i % 2 === 1);
      expect(Math.max(...ys)).toBeCloseTo(GROUND * T, 0);
      // Its highlight edge runs from the pool's surface to the jet at the bottom of the lip cell
      const edge = spill!.spillEdge!;
      expect(edge[1]).toBeCloseTo(spill!.topLeft, 3);
      expect(edge[edge.length - 1]).toBeCloseTo(GROUND * T, 0);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('bridges the one-cell beats the simulation hands a fall down in, and reaches the pool it lands in', () => {
    const field = new FluidField(W, H);
    const put = (y: number, level: number) => field.apply([toFluidWireCell(SHAFT, y, 1, level)]);
    put(6, 0.06);
    // row 7 is an empty beat
    put(8, 0.06);
    put(9, 0.06);
    // row 10 is empty right above the pool
    put(11, 1);
    put(12, 1);
    for (let y = 13; y < H - 1; y++) put(y, 1);
    const layout = new FluidLayout(field, T, solid);
    const spans: Array<[number, number]> = [];
    for (let y = 6; y < H - 1; y++) for (const sh of layout.shapesAt(SHAFT, y)) if (sh.stream) spans.push([sh.top, sh.bottom]);
    spans.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0] - spans[i - 1][1]).toBeLessThan(0.5);
    expect(spans[spans.length - 1][1]).toBeGreaterThanOrEqual(11 * T - 0.5); // down to the pool's surface
  });
});
