import { describe, it, expect } from 'vitest';
import {
  FALL_MIN_STRENGTH, FLUID_UNITS, FluidField, FluidLayout, fallStrength, fluidBodyBands, fluidSurfaceWave, isFluidCovered, layoutFluidShapes,
} from '../src/index';

const T = 64;
const U = (units: number) => units; // readability: levels below are in units of 1/16

/** A field from rows of cells: '.' empty, a digit/letter 1-g is that many units (g = 16), a trailing '^' marks the cell falling. */
function field(rows: string[], id = 1): FluidField {
  const f = new FluidField(rows[0].replace(/\^/g, '').length, rows.length);
  rows.forEach((row, y) => {
    let x = 0;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '^') continue;
      const falling = row[i + 1] === '^';
      if (c !== '.') f.set(x, y, id, parseInt(c, 17), falling ? 1 : 0);
      x++;
    }
  });
  return f;
}

const shapeOf = (f: FluidField, x: number, y: number) => new FluidLayout(f, T).shapesAt(x, y)[0];
/** Where a cell of `units` units has its own surface (a row `row` down): filled from the bottom of its cell. */
const own = (units: number, row = 0) => (row + 1) * T - (units / FLUID_UNITS) * T;

describe('the cover rule', () => {
  it('a cell is covered when the same fluid is directly above it', () => {
    const f = field(['8', '8', '.']);
    expect(isFluidCovered(f, 0, 0)).toBe(false);
    expect(isFluidCovered(f, 0, 1)).toBe(true);
    expect(isFluidCovered(f, 0, 2)).toBe(false);
    const other = new FluidField(1, 2);
    other.set(0, 0, 1, 8);
    other.set(0, 1, 2, 8);
    expect(isFluidCovered(other, 0, 1)).toBe(false);
  });
});

describe('FluidLayout: one shape per cell', () => {
  it('draws nothing for an empty cell or one outside the grid', () => {
    const f = field(['.8.']);
    const layout = new FluidLayout(f, T);
    expect(layout.shapesAt(0, 0)).toEqual([]);
    expect(layout.shapesAt(9, 0)).toEqual([]);
    expect(layout.surfaceAt(0, 0)).toBeNull();
  });

  it('fills a lone cell from the bottom to its level, edge to edge, with a flat top', () => {
    const f = field(['.8.']);
    const s = shapeOf(f, 1, 0);
    expect(s.x).toBe(T);
    expect(s.width).toBe(T);
    expect(s.top).toBe(0);
    expect(s.bottom).toBe(T);
    expect(s.topLeft).toBe(T / 2);
    expect(s.topRight).toBe(T / 2);
    expect(s.topMid).toBe(T / 2);
    expect(s.surface).toBe(true);
    expect(s.falling).toBe(false);
    expect(s.strength).toBe(1);
  });

  it('a flat pool has equal corners everywhere', () => {
    const f = field(['888']);
    for (let x = 0; x < 3; x++) {
      const s = shapeOf(f, x, 0);
      expect(s.topLeft).toBe(T / 2);
      expect(s.topRight).toBe(T / 2);
    }
  });

  it('neighbours at different levels meet at one height: a slope with no seam', () => {
    const f = field(['4g8c2']);
    const shapes = [0, 1, 2, 3, 4].map((x) => shapeOf(f, x, 0));
    for (let x = 0; x < 4; x++) expect(shapes[x].topRight).toBe(shapes[x + 1].topLeft);
    // The meeting height is between the two surfaces
    expect(shapes[0].topRight).toBeCloseTo((own(16) + own(4)) / 2, 9);
    expect(shapes[2].topRight).toBeCloseTo((own(8) + own(12)) / 2, 9);
    // And across the cell the surface is a straight line from corner to corner
    for (const s of shapes) expect(s.topMid).toBeCloseTo((s.topLeft + s.topRight) / 2, 9);
  });

  it('property: on any row of fluid, every pair of neighbours share the corner they meet at', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let trial = 0; trial < 40; trial++) {
      const f = new FluidField(12, 6);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 12; x++) if (rand() < 0.6) f.set(x, y, rand() < 0.8 ? 1 : 2, 1 + Math.floor(rand() * 16), rand() < 0.2 ? 1 : 0);
      const layout = new FluidLayout(f, T);
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 11; x++) {
          const a = layout.shapesAt(x, y)[0];
          const b = layout.shapesAt(x + 1, y)[0];
          if (!a || !b || a.fluidId !== b.fluidId) continue;
          // Covered cells are a full cell tall (nothing to meet); everything else shares its corner
          if (a.surface && b.surface) expect(a.topRight).toBe(b.topLeft);
        }
      }
    }
  });

  it('a pool beside a wall or open air is flat at that edge', () => {
    const f = field(['8']);
    const s = shapeOf(f, 0, 0);
    expect(s.topLeft).toBe(s.topMid);
    expect(s.topRight).toBe(s.topMid);
  });

  it('another fluid beside it is like a wall: the surfaces do not meet', () => {
    const f = new FluidField(2, 1);
    f.set(0, 0, 1, 8);
    f.set(1, 0, 2, 16);
    const layout = new FluidLayout(f, T);
    expect(layout.shapesAt(0, 0)[0].topRight).toBe(T / 2);
    expect(layout.shapesAt(1, 0)[0].topLeft).toBe(0);
  });

  it('a pool beside a waterfall rises to meet it', () => {
    // Column 2 is a waterfall: cells of 8 units falling, with the same fluid above them (so each is drawn a full cell tall)
    const f = field(['..8^', '..8^', '888^']);
    const pool = shapeOf(f, 1, 2);
    const fall = shapeOf(f, 2, 2);
    expect(fall.surface).toBe(false);
    expect(fall.topLeft).toBe(2 * T);
    expect(pool.topRight).toBeLessThan(own(8, 2));
    expect(pool.topRight).toBe((own(8, 2) + 2 * T) / 2);
  });
});

describe('FluidLayout: stacks and falls', () => {
  it('fluid under fluid is a full cell tall, whatever its level, with no gap between cells', () => {
    const f = field(['4', '2', '1']);
    const top = shapeOf(f, 0, 0);
    const mid = shapeOf(f, 0, 1);
    const low = shapeOf(f, 0, 2);
    expect(mid.topLeft).toBe(T);
    expect(mid.topRight).toBe(T);
    expect(low.topLeft).toBe(2 * T);
    expect(top.topLeft).toBe(T - 4 * (T / FLUID_UNITS));
  });

  it('marks the surface on exactly the top cell of each column of fluid', () => {
    const f = field(['g.g', 'g.4', 'g.g', '...', 'g..']);
    const layout = new FluidLayout(f, T);
    const surfaces: string[] = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (layout.shapesAt(x, y)[0]?.surface) surfaces.push(`${x},${y}`);
    expect(surfaces).toEqual(['0,0', '2,0', '0,4']);
  });

  it('measures depth from the top of the column', () => {
    const f = field(['8', 'g', 'g']);
    const top = shapeOf(f, 0, 0);
    expect(top.depth).toBe(0);
    expect(shapeOf(f, 0, 1).depth).toBeCloseTo((T - top.surfaceY) / T, 9);
    expect(shapeOf(f, 0, 2).surfaceY).toBe(top.surfaceY);
    expect(shapeOf(f, 0, 2).depth).toBeCloseTo((2 * T - top.surfaceY) / T, 9);
  });

  it('a falling cell is the full width of its cell, and is marked', () => {
    const f = field(['g^', 'g^', 'g^']);
    for (let y = 0; y < 3; y++) {
      const s = shapeOf(f, 0, y);
      expect(s.falling).toBe(true);
      expect(s.width).toBe(T);
      expect(s.x).toBe(0);
    }
  });

  it('a thin fall is fainter, not narrower', () => {
    const thin = shapeOf(field(['1^']), 0, 0);
    const half = shapeOf(field(['8^']), 0, 0);
    const full = shapeOf(field(['g^']), 0, 0);
    expect(thin.width).toBe(T);
    expect(thin.strength).toBeCloseTo(FALL_MIN_STRENGTH, 9);
    expect(half.strength).toBe(1);
    expect(full.strength).toBe(1);
    expect(fallStrength(4)).toBeGreaterThan(fallStrength(2));
    expect(shapeOf(field(['1']), 0, 0).strength).toBe(1);
  });

  it('at the lip of a fall, the top of the falling cell is never above the pool beside it', () => {
    // A pool of 6 units on a ledge, and 3 units pouring off its edge: the falling cell starts level with the pool, not at its cell top
    const f = field(['63^', '...']);
    const pool = shapeOf(f, 0, 0);
    const lip = shapeOf(f, 1, 0);
    expect(lip.falling).toBe(true);
    expect(lip.surface).toBe(true);
    expect(lip.topLeft).toBe(pool.topRight);
    expect(lip.topLeft).toBeGreaterThanOrEqual(Math.min(own(6), own(3)));
    expect(lip.topLeft).toBeGreaterThan(0);
    expect(lip.topRight).toBe(own(3));
  });

  it('a ladder shaft behaves like open air: nothing about terrain changes the picture', () => {
    // The same fluid with or without anything beside it is drawn the same; the layout takes no terrain at all
    const f = field(['g^', 'g^']);
    expect(shapeOf(f, 0, 1).topLeft).toBe(T);
    expect(layoutFluidShapes(f, 0, 1, T)).toHaveLength(1);
  });
});

describe('FluidLayout: surfaceAt', () => {
  it('is where the fluid is seen: the average of the corners, or the cell top under fluid', () => {
    const f = field(['4g', 'g.']);
    const layout = new FluidLayout(f, T);
    const a = layout.shapesAt(0, 0)[0];
    expect(layout.surfaceAt(0, 0)).toBe((a.topLeft + a.topRight) / 2);
    expect(layout.surfaceAt(0, 1)).toBe(T);
    expect(layout.surfaceAt(1, 1)).toBeNull();
  });
});

describe('FluidLayout: one fluid resting on another', () => {
  const two = (rows: Array<Array<[number, number]>>) => {
    // rows of [fluidId, units] per cell, one column each; [0, 0] is empty
    const f = new FluidField(rows[0].length, rows.length);
    rows.forEach((row, y) => row.forEach(([id, u], x) => u > 0 && f.set(x, y, id, u)));
    return f;
  };

  it('oil on a thin layer of water sits right on the water, with no gap of air between them', () => {
    const f = two([[[2, 3]], [[1, 5]]]); // 3 units of oil above 5 units of water
    const oil = shapeOf(f, 0, 0);
    const water = shapeOf(f, 0, 1);
    expect(water.topLeft).toBe(own(5, 1));
    expect(oil.bottom).toBeCloseTo(own(5, 1), 9);
    expect(oil.topLeft).toBeCloseTo(own(5, 1) - (3 / FLUID_UNITS) * T, 9);
    // The oil is pushed down into the water's cell; its own thickness is still 3 units
    expect(oil.bottom - oil.topLeft).toBeCloseTo((3 / FLUID_UNITS) * T, 9);
  });

  it('a whole stack of oil is pushed down together, and water that is full pushes nothing', () => {
    const stack = two([[[2, 16]], [[2, 4]], [[1, 8]]]);
    expect(shapeOf(stack, 0, 1).bottom).toBeCloseTo(own(8, 2), 9);
    expect(shapeOf(stack, 0, 0).bottom).toBeCloseTo(shapeOf(stack, 0, 1).top, 9);
    const full = two([[[2, 4]], [[1, 16]]]);
    expect(shapeOf(full, 0, 0).bottom).toBe(T);
    expect(shapeOf(full, 0, 0).topLeft).toBe(own(4));
  });

  it('is not pushed down by the same fluid, by rock or by nothing below it', () => {
    expect(shapeOf(field(['8', '8']), 0, 0).bottom).toBe(T);
    expect(shapeOf(field(['8', '.']), 0, 0).bottom).toBe(T);
    expect(shapeOf(field(['8']), 0, 0).bottom).toBe(T);
  });

  it('neighbouring oil cells still share their corners when only one rests on water', () => {
    const f = two([[[2, 6], [2, 6]], [[1, 4], [0, 0]]]);
    const a = shapeOf(f, 0, 0);
    const b = shapeOf(f, 1, 0);
    expect(a.topRight).toBe(b.topLeft);
  });
});

describe('waves and bands read the shape', () => {
  it('a surface wave stops where the surface meets a falling cell or the end of the pool', () => {
    const f = field(['88g^']);
    const pool = shapeOf(f, 1, 0);
    expect(pool.waveLeft).toBe(1);
    expect(pool.waveRight).toBe(0);
    expect(shapeOf(f, 0, 0).waveLeft).toBe(0);
    const appearance = { waveAmplitude: 0.1, waveSpeed: 1, highlight: 0.5, depthDarkening: 0.2, depthOpacity: 0.2 };
    const wave = fluidSurfaceWave(pool, T, 0.3, appearance as any)!;
    // The right edge of the wave is the shape's own corner, unmoved
    expect(wave.line[wave.line.length - 1]).toBeCloseTo(pool.topRight, 9);
  });

  it('a falling cell has no waves and does not draw a surface wave line room', () => {
    const s = shapeOf(field(['g^']), 0, 0);
    const wave = fluidSurfaceWave(s, T, 0.3, { waveAmplitude: 0.1, waveSpeed: 1, highlight: 0.5, depthDarkening: 0.2, depthOpacity: 0.2 } as any)!;
    expect(wave.fill).toEqual([]);
  });

  it('bands cover the cell below its surface and stay inside it', () => {
    const f = field(['8']);
    const s = shapeOf(f, 0, 0);
    const bands = fluidBodyBands(s, T);
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) for (let i = 0; i < band.points.length; i += 2) {
      expect(band.points[i]).toBeGreaterThanOrEqual(0);
      expect(band.points[i]).toBeLessThanOrEqual(T);
      expect(band.points[i + 1]).toBeGreaterThanOrEqual(s.topMid - 1e-6);
      expect(band.points[i + 1]).toBeLessThanOrEqual(T);
    }
  });
});
