import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FLUID_APPEARANCE, FLUID_DEPTH_CAP, FLUID_SHADE_STRIPS, FLUID_WAVE_SEGMENTS, FluidField, FluidLayout, STREAM_MAX_WIDTH, STREAM_MIN_WIDTH, bandBelowLine,
  fluidBodyBands, fluidDepthShade, fluidSurfaceWave, fluidWaveHeight, quantizeFluidLevel, resolveFluidAppearance, validateFluid,
  validateFluidAppearance, parseHexColor, lightenColor, darkenColor, colorToCss, type FluidAppearance, type FluidShape, type SolidSampler,
} from '../src/index';

const T = 64;
const q = quantizeFluidLevel;
const still: FluidAppearance = { ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0 };
const wavy: FluidAppearance = { ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0.1 };

function fieldWith(cells: [number, number, number][], id = 1): FluidField {
  const field = new FluidField(10, 12);
  for (const [x, y, level] of cells) field.set(x, y, id, q(level));
  return field;
}

/** Terrain as rows of text: '#' solid, anything else open. Out of bounds is solid. */
function terrain(rows: string[]): SolidSampler {
  return (x, y) => (rows[y]?.[x] ?? '#') === '#';
}

/** The highest point of a polygon at x (where a vertical line through x first meets it), or NaN if it misses. */
function topAt(points: number[], x: number): number {
  let best = NaN;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    const [ax, ay, bx, by] = [points[i], points[i + 1], points[j], points[j + 1]];
    if (x < Math.min(ax, bx) || x > Math.max(ax, bx) || ax === bx) continue;
    const y = ay + ((by - ay) * (x - ax)) / (bx - ax);
    if (Number.isNaN(best) || y < best) best = y;
  }
  return best;
}

const shapesAt = (field: FluidField, x: number, y: number, solid?: SolidSampler) => new FluidLayout(field, T, solid).shapesAt(x, y);
const body = (field: FluidField, x: number, y: number, solid?: SolidSampler): FluidShape | undefined => shapesAt(field, x, y, solid).find((s) => !s.stream);
const stream = (field: FluidField, x: number, y: number, solid?: SolidSampler): FluidShape | undefined => shapesAt(field, x, y, solid).find((s) => s.stream);
const surfacesIn = (field: FluidField, x: number, solid?: SolidSampler) => {
  const layout = new FluidLayout(field, T, solid);
  const rows: number[] = [];
  for (let y = 0; y < field.height; y++) if (layout.shapesAt(x, y).some((s) => s.surface)) rows.push(y);
  return rows;
};

describe('FluidLayout: bodies', () => {
  it('draws nothing in an empty cell', () => {
    expect(shapesAt(fieldWith([]), 2, 2)).toEqual([]);
  });

  it('a lone partial cell fills from the bottom with level edges (nothing to join)', () => {
    const s = body(fieldWith([[2, 2, 0.5]]), 2, 2)!;
    expect(s).toMatchObject({ x: 128, width: 64, top: 128, bottom: 192, topLeft: 160, topRight: 160, surface: true, waveLeft: 0, waveRight: 0, stream: false });
  });

  it('a full cell with fluid above it does not draw a second surface line (one body, one surface)', () => {
    const field = fieldWith([[1, 2, 0.5], [1, 3, 1]]);
    expect(surfacesIn(field, 1)).toEqual([2]);
    expect(body(field, 1, 3)!.surface).toBe(false);
    expect(body(field, 1, 2)!.surfaceY).toBe(4 * T - 1.5 * T);
  });

  it('never draws two surfaces on top of each other, whatever the levels in the column', () => {
    for (const upper of [0.05, 0.2, 0.5, 0.9, 1]) {
      for (const lower of [0.3, 0.6, 0.9, 1]) {
        expect(surfacesIn(fieldWith([[1, 1, upper], [1, 2, upper], [1, 3, lower]]), 1)).toHaveLength(1);
      }
    }
  });

  it('packs a column\'s fluid down onto its floor, wherever the simulation has it', () => {
    // Half a cell above half a cell: one full cell of fluid, resting on the floor
    const field = fieldWith([[1, 2, 0.5], [1, 3, 0.5]]);
    expect(body(field, 1, 3)).toMatchObject({ surface: true, surfaceY: 3 * T });
    expect(body(field, 1, 2)).toBeUndefined();
  });

  it('a thin film coming and going above a pool moves its surface only by the film\'s own amount (it used to snap to full)', () => {
    const bare = body(fieldWith([[1, 3, 0.4]]), 1, 3)!;
    const filmed = new FluidLayout(fieldWith([[1, 2, 0.05], [1, 3, 0.4]]), T).shapesAt(1, 3).find((s) => !s.stream)!;
    expect(bare.surfaceY - filmed.surfaceY).toBeCloseTo(0.05 * T, 0);
  });

  it('the surface moves smoothly as the fluid above a pool grows: never a jump', () => {
    let last = body(fieldWith([[1, 3, 0.4]]), 1, 3)!.surfaceY;
    for (let above = 0.01; above <= 1; above += 0.01) {
      const field = fieldWith([[1, 2, above], [1, 3, 0.4]]);
      const layout = new FluidLayout(field, T);
      const y = [...layout.shapesAt(1, 2), ...layout.shapesAt(1, 3)].find((s) => !s.stream)!.surfaceY;
      expect(Math.abs(y - last)).toBeLessThanOrEqual(0.011 * T + 1);
      last = y;
    }
  });

  it('says where a cell\'s fluid is seen: its body\'s surface, even when that is packed into a cell below', () => {
    const field = fieldWith([[1, 2, 0.5], [1, 3, 0.5]]);
    const layout = new FluidLayout(field, T);
    expect(layout.surfaceAt(1, 2)).toBe(3 * T);
    expect(layout.surfaceAt(1, 3)).toBe(3 * T);
    expect(layout.surfaceAt(4, 4)).toBeNull();
    expect(layout.surfaceAt(-1, 0)).toBeNull();
    // Falling on its own: the top of its stream
    const box = terrain(['#####', '#...#', '#...#', '#...#', '#####']);
    const air = new FluidField(5, 5);
    air.set(2, 1, 1, q(0.3));
    const falling = new FluidLayout(air, T, box);
    expect(falling.surfaceAt(2, 1)).toBe(falling.shapesAt(2, 1)[0].top);
  });

  it('measures depth from the body\'s surface', () => {
    const field = fieldWith([[1, 1, 1], [1, 2, 1], [1, 3, 1]]);
    expect(body(field, 1, 3)!.depth).toBeCloseTo(2);
    expect(body(field, 1, 1)!.depth).toBe(0);
  });
});

describe('FluidLayout: joining neighbours', () => {
  it('neighbours at the same level share their edge exactly, and waves carry across', () => {
    const field = fieldWith([[1, 3, 0.5], [2, 3, 0.5], [3, 3, 0.5]]);
    const mid = body(field, 2, 3)!;
    expect(body(field, 1, 3)!.topRight).toBe(mid.topLeft);
    expect(mid).toMatchObject({ waveLeft: 1, waveRight: 1 });
    expect(body(field, 1, 3)!.waveLeft).toBe(0); // nothing to its left
  });

  it('touching neighbours at different levels meet at one height, so a heap slopes with no riser at the cell edge', () => {
    const lean = (lower: number) => {
      const field = fieldWith([[1, 3, 0.8], [2, 3, lower]]);
      const a = body(field, 1, 3)!;
      return { gap: Math.abs(body(field, 2, 3)!.topLeft - a.topRight), k: a.waveRight, slope: a.topRight - a.topLeft };
    };
    for (const lower of [0.7, 0.5, 0.3, 0.15]) {
      const { gap, k, slope } = lean(lower);
      expect(gap, `lower ${lower}`).toBeLessThan(0.5); // continuous: both sides agree at the shared edge
      expect(k).toBeGreaterThan(0.95);
      expect(slope).toBeGreaterThan(0); // slopes down towards the lower one
    }
  });

  it('a heap more than a tile higher than its neighbour still slopes into it (no vertical riser)', () => {
    const heap = fieldWith([[1, 3, 1], [1, 2, 0.5], [2, 3, 0.4]]);
    const high = body(heap, 1, 3)!;
    const low = body(heap, 2, 3)!;
    expect(Math.abs(low.topLeft - high.topRight)).toBeLessThan(0.5);
    expect(low.waveLeft).toBeGreaterThan(0.99);
  });

  it('a long run of steps draws as one continuous slope: every boundary has the same height on both sides', () => {
    const cells: [number, number, number][] = [];
    const heights = [0.4, 1, 1.6, 2.2, 2.8, 2.2, 1.6, 1, 0.4];
    heights.forEach((h, i) => {
      for (let r = 0; r < Math.ceil(h); r++) cells.push([i + 1, 8 - r, Math.min(1, h - r)]);
    });
    const field = fieldWith(cells);
    const layout = new FluidLayout(field, T);
    const edge = (x: number) => {
      const col = [8, 7, 6, 5, 4].map((y) => layout.shapesAt(x, y).find((s) => !s.stream && s.topLeft < (y + 1) * T)).find(Boolean)!;
      return col;
    };
    for (let x = 1; x < 9; x++) expect(Math.abs(edge(x).topRight - edge(x + 1).topLeft), `edge ${x}|${x + 1}`).toBeLessThan(0.5);
  });

  it('does not join a different fluid, or fluid on a ledge above a pool, or across a wall', () => {
    const mixed = fieldWith([[1, 3, 0.5]]);
    mixed.set(2, 3, 2, q(0.5));
    expect(body(mixed, 1, 3)!.waveRight).toBe(0);
    // Column 2's fluid sits on a ledge at row 3; column 1's pool stops just below the top of the ledge
    const ledge = terrain(['#####', '#...#', '#...#', '#.#.#', '#...#', '#####']);
    const field = new FluidField(5, 6);
    field.set(1, 3, 1, q(0.9));
    field.set(1, 4, 1, q(1));
    field.set(2, 2, 1, q(0.1));
    expect(new FluidLayout(field, T, ledge).shapesAt(2, 2).find((s) => !s.stream)!.waveLeft).toBe(0);
    // A wall between two pools keeps them apart even at the same height
    const walled = terrain(['#####', '#.#.#', '#.#.#', '#####']);
    const pools = new FluidField(5, 4);
    pools.set(1, 2, 1, q(0.5));
    pools.set(3, 2, 1, q(0.5));
    expect(new FluidLayout(pools, T, walled).shapesAt(1, 2).find((s) => !s.stream)!.waveRight).toBe(0);
  });
});

describe('FluidLayout: streams', () => {
  const box = terrain(['#####', '#...#', '#...#', '#...#', '#####']);
  const make = (cells: [number, number, number][]) => {
    const field = new FluidField(5, 5);
    for (const [x, y, level] of cells) field.set(x, y, 1, q(level));
    return field;
  };

  it('one cell of fluid falling through open air is one compact blob of its own size, centred, and none of it is a body', () => {
    const field = make([[2, 1, 0.3]]);
    const s = stream(field, 2, 1, box)!;
    const level = field.getLevel(2, 1);
    expect(s.width * (s.bottom - s.top)).toBeCloseTo(level * T * T, 0); // drawn the size of the water it is
    expect(s.width).toBeCloseTo(Math.sqrt(level) * T, 0); // a square lump, not a thin bar
    expect(s.x).toBeCloseTo(2 * T + (T - s.width) / 2);
    expect(body(field, 2, 1, box)).toBeUndefined();
  });

  it('a falling blob handed from one cell to the next keeps its size and moves smoothly between them', () => {
    // The client eases a falling cell's level out of one cell and into the next
    const sizes: number[] = [];
    const centres: number[] = [];
    for (let t = 0; t <= 1.0001; t += 0.25) {
      const field = make([[2, 1, 1 - t], [2, 2, t]].filter(([, , l]) => l > 0) as [number, number, number][]);
      const pieces = [1, 2].flatMap((y) => new FluidLayout(field, T, box).shapesAt(2, y).filter((sh) => sh.stream));
      const top = Math.min(...pieces.map((p) => p.top));
      const bottom = Math.max(...pieces.map((p) => p.bottom));
      sizes.push(pieces[0].width * (bottom - top));
      centres.push((top + bottom) / 2);
    }
    for (const size of sizes) expect(size).toBeCloseTo(T * T, -1);
    for (let i = 1; i < centres.length; i++) expect(centres[i] - centres[i - 1]).toBeCloseTo(0.25 * T, 0);
  });

  it('a stream widens with more fluid (to a limit) and thins to nothing as it runs out', () => {
    const width = (level: number) => stream(make([[2, 1, level]]), 2, 1, box)?.width ?? 0;
    expect(width(1)).toBeCloseTo(STREAM_MAX_WIDTH * T, 0);
    expect(width(0.2)).toBeGreaterThan(width(0.1));
    // A trickle is still clearly visible; only the last drops thin away to nothing
    expect(width(0.03)).toBeGreaterThanOrEqual(STREAM_MIN_WIDTH * T - 1e-6);
    expect(width(0.006)).toBeLessThan(0.05 * T);
  });

  it('nothing is a stream without a terrain sampler', () => {
    expect(stream(make([[2, 1, 0.3]]), 2, 1)).toBeUndefined();
  });

  it('fluid falling down a one-wide shaft (walls both sides) is a stream, centred, so it can be seen all the way down', () => {
    const shaft = terrain(['###', '#.#', '#.#', '###']);
    const field = new FluidField(3, 4);
    field.set(1, 1, 1, q(0.5));
    const s = stream(field, 1, 1, shaft)!;
    expect(s).toBeDefined();
    expect(s.x).toBeCloseTo(T + (T - s.width) / 2);
  });

  it('a column of thin water falling through a shaft is drawn in every cell it is in, not squashed onto the bottom', () => {
    const rows = ['#.#', '#.#', '#.#', '#.#', '#.#', '#.#', '###'];
    const shaft = terrain(rows);
    const field = new FluidField(3, 7);
    for (let y = 0; y <= 4; y++) field.set(1, y, 1, q(0.4));
    const layout = new FluidLayout(field, T, shaft);
    for (let y = 0; y <= 4; y++) expect(layout.shapesAt(1, y).some((sh) => sh.stream), `row ${y}`).toBe(true);
  });

  it('a shaft that has filled up is a body again: full cells rest on the floor and are not streams', () => {
    const shaft = terrain(['###', '#.#', '#.#', '#.#', '###']);
    const field = new FluidField(3, 5);
    for (let y = 1; y <= 3; y++) field.set(1, y, 1, q(1));
    for (let y = 1; y <= 3; y++) expect(stream(field, 1, y, shaft)).toBeUndefined();
    expect(body(field, 1, 3, shaft)).toBeDefined();
  });

  it('fluid resting on the floor is a puddle', () => {
    const field = make([[2, 3, 0.2]]);
    expect(stream(field, 2, 3, box)).toBeUndefined();
    expect(body(field, 2, 3, box)!.surface).toBe(true);
  });

  it('fluid at the lip of a ledge turns smoothly into a spill as the pool beside it fills: nothing appears or vanishes in one go', () => {
    // A ledge under the left cell (the pool's floor), a drop under the lip cell
    const lip = terrain(['#####', '#...#', '##..#', '#...#', '#####']);
    const area = (points: number[]) => {
      let sum = 0;
      for (let i = 0; i < points.length; i += 2) {
        const j = (i + 2) % points.length;
        sum += points[i] * points[j + 1] - points[j] * points[i + 1];
      }
      return Math.abs(sum) / 2;
    };
    const drawnIn = (field: FluidField) => new FluidLayout(field, T, lip).shapesAt(2, 1)
      .reduce((sum, sh) => sum + (sh.spill ? area(sh.spill) : sh.stream ? (sh.bottom - sh.top) * sh.width : 0), 0) / T;
    let last: number | null = null;
    let spills = 0;
    for (let beside = 0; beside <= 0.3; beside += 0.02) {
      const field = make([[2, 1, 0.3], ...(beside > 0 ? ([[1, 1, beside]] as [number, number, number][]) : [])]);
      const now = drawnIn(field);
      if (last !== null) expect(Math.abs(now - last), `beside ${beside.toFixed(2)}`).toBeLessThan(0.15 * T);
      if (new FluidLayout(field, T, lip).shapesAt(2, 1).some((sh) => sh.spill)) spills++;
      last = now;
    }
    expect(spills).toBeGreaterThan(5); // it does become a spill
  });

  it('fluid beside a column of fluid with no ground under it (the side of a heap) is not a spill', () => {
    const field = make([[1, 1, 1], [1, 2, 1], [1, 3, 1], [2, 1, 0.3]]);
    expect(new FluidLayout(field, T, box).shapesAt(2, 1).some((sh) => sh.spill)).toBe(false);
  });

  it('presses to the wall it runs down', () => {
    const wall = terrain(['##..', '#...', '#...', '####']);
    const field = new FluidField(4, 4);
    field.set(1, 1, 1, q(0.4));
    expect(stream(field, 1, 1, wall)!.x).toBe(T);
  });

  it('runs on into the pool it lands in, and the pool shows only the fluid resting in it', () => {
    const field = make([[2, 2, 0.3], [2, 3, 0.4]]);
    const pool = body(field, 2, 3, box)!;
    expect(pool.surfaceY).toBeCloseTo(4 * T - 0.4 * T, 0);
    const pieces = [...shapesAt(field, 2, 2, box), ...shapesAt(field, 2, 3, box)].filter((s) => s.stream);
    expect(Math.max(...pieces.map((s) => s.bottom))).toBeCloseTo(pool.surfaceY, 0);
    expect(Math.min(...pieces.map((s) => s.top))).toBeLessThan(3 * T);
  });
});

describe('fluidBodyBands', () => {
  it('splits a full cell into shaded strips that tile it exactly', () => {
    const field = fieldWith([[1, 1, 1], [1, 2, 1]]);
    const bands = fluidBodyBands(body(field, 1, 2)!, T, still);
    expect(bands).toHaveLength(FLUID_SHADE_STRIPS);
    const topOf = (b: { points: number[] }) => Math.min(...b.points.filter((_, i) => i % 2 === 1));
    const bottomOf = (b: { points: number[] }) => Math.max(...b.points.filter((_, i) => i % 2 === 1));
    for (let i = 1; i < bands.length; i++) expect(topOf(bands[i])).toBe(bottomOf(bands[i - 1]));
    expect(topOf(bands[0])).toBe(2 * T);
    expect(bottomOf(bands[bands.length - 1])).toBe(3 * T);
    expect(bands[0].depth).toBeLessThan(bands[1].depth);
  });

  it('clips to a sloped surface', () => {
    const field = fieldWith([[1, 2, 0.4], [2, 2, 0.7]]);
    const shape = body(field, 1, 2)!;
    const bands = fluidBodyBands(shape, T, still);
    const surface = (x: number) => Math.min(...bands.map((b) => topAt(b.points, x)).filter((y) => !Number.isNaN(y)));
    // lower on the left, rising to the deeper neighbour
    expect(surface(shape.x + 1)).toBeGreaterThan(surface(shape.x + shape.width - 1));
  });

  it('follows a steep surface exactly through every strip: the bands fill the area under it with no wedge cut out', () => {
    const area = (points: number[]) => {
      let sum = 0;
      for (let i = 0; i < points.length; i += 2) {
        const j = (i + 2) % points.length;
        sum += points[i] * points[j + 1] - points[j] * points[i + 1];
      }
      return Math.abs(sum) / 2;
    };
    // A surface falling 40 px across one cell crosses two strip boundaries part way across
    const shape: FluidShape = {
      cx: 1, cy: 2, fluidId: 1, x: T, width: T, top: 2 * T, bottom: 3 * T, topLeft: 2 * T + 6, topRight: 2 * T + 46, topMid: 2 * T + 26,
      surface: false, waveLeft: 0, waveRight: 0, surfaceY: 2 * T + 26, bodyBottom: 3 * T, depth: 0, stream: false,
    };
    const bands = fluidBodyBands(shape, T, still);
    const drawn = bands.reduce((sum, band) => sum + area(band.points), 0);
    const expected = T * (3 * T - (shape.topLeft + shape.topRight) / 2); // a trapezoid under the line
    expect(drawn).toBeCloseTo(expected, 0);
    // No band runs along its own bottom edge and back (a zero-area sliver that draws as a hairline)
    for (const band of bands) {
      const ys = band.points.filter((_, i) => i % 2 === 1);
      const bottom = Math.max(...ys);
      expect(ys.filter((y) => y >= bottom).length, JSON.stringify(band.points)).toBeLessThanOrEqual(2);
    }
    // Where it is matters, not just how much: each strip's top edge is the surface line held inside the strip
    const line = (x: number) => shape.topLeft + ((shape.topRight - shape.topLeft) * (x - shape.x)) / shape.width;
    for (const band of bands) {
      const ys = band.points.filter((_, i) => i % 2 === 1);
      const s1 = Math.max(...ys);
      const s0 = s1 - T / 4;
      for (let x = shape.x + 1; x < shape.x + shape.width; x += 3) {
        const expectedTop = line(x) >= s1 ? NaN : Math.max(s0, line(x));
        const drawnTop = topAt(band.points, x);
        if (Number.isNaN(expectedTop)) expect(Number.isNaN(drawnTop) || drawnTop >= s1 - 0.5, `x ${x}`).toBe(true);
        else expect(drawnTop, `x ${x}`).toBeCloseTo(expectedTop, 0);
      }
    }
  });

  it('cuts the body short of the surface by the wave room, only where the surface carries on', () => {
    const shape = body(fieldWith([[1, 2, 0.5], [2, 2, 0.5]]), 1, 2)!;
    const surfaceAt = (a: FluidAppearance, x: number) => Math.min(...fluidBodyBands(shape, T, a).map((b) => topAt(b.points, x)).filter((y) => !Number.isNaN(y)));
    const left = shape.x + 0.01;
    const right = shape.x + shape.width - 0.01;
    expect(surfaceAt(wavy, left)).toBeCloseTo(surfaceAt(still, left), 1); // the free left edge
    expect(surfaceAt(wavy, right) - surfaceAt(still, right)).toBeCloseTo(0.1 * T, 1);
  });
});

describe('fluidSurfaceWave', () => {
  const field = fieldWith([[1, 2, 0.5], [2, 2, 0.5], [3, 2, 0.5]]);
  const middle = body(field, 2, 2)!;
  const edge = body(field, 1, 2)!;

  it('only the surface cell of a body has a wave, and streams have none', () => {
    const stacked = fieldWith([[1, 1, 1], [1, 2, 1]]);
    expect(fluidSurfaceWave(body(stacked, 1, 2)!, T, 0, wavy)).toBeNull();
    const box = terrain(['#####', '#...#', '#...#', '#####']);
    const falling = new FluidField(5, 4);
    falling.set(2, 1, 1, q(0.3));
    expect(fluidSurfaceWave(stream(falling, 2, 1, box)!, T, 0, wavy)).toBeNull();
  });

  it('is a flat line with nothing to fill when the fluid is still', () => {
    const wave = fluidSurfaceWave(middle, T, 1.3, still)!;
    expect(wave.fill).toEqual([]);
    expect(new Set(wave.line.filter((_, i) => i % 2 === 1)).size).toBe(1);
    expect(wave.line).toHaveLength((FLUID_WAVE_SEGMENTS + 1) * 2);
  });

  it('moves with time and stays within the wave room', () => {
    const ys = new Set<number>();
    for (let t = 0; t < 3; t += 0.1) {
      const line = fluidSurfaceWave(middle, T, t, wavy)!.line;
      for (let i = 1; i < line.length; i += 2) {
        expect(Math.abs(line[i] - middle.topLeft)).toBeLessThanOrEqual(0.1 * T + 1e-6);
        ys.add(Math.round(line[i] * 100));
      }
    }
    expect(ys.size).toBeGreaterThan(5);
  });

  it('does not wave at an edge with nothing to continue into (no gap can open)', () => {
    for (let t = 0; t < 3; t += 0.2) expect(fluidSurfaceWave(edge, T, t, wavy)!.line[1]).toBe(edge.topLeft);
  });

  it('agrees with its neighbour where they meet', () => {
    const a = fluidSurfaceWave(edge, T, 0.7, wavy)!.line;
    const b = fluidSurfaceWave(middle, T, 0.7, wavy)!.line;
    expect(a[a.length - 2]).toBe(b[0]);
    expect(a[a.length - 1]).toBeCloseTo(b[1]);
  });

  it('the fill closes the gap between the wave line and the body', () => {
    const wave = fluidSurfaceWave(middle, T, 0.4, wavy)!;
    const top = fluidBodyBands(middle, T, wavy)[0].points;
    const back = wave.fill.slice((FLUID_WAVE_SEGMENTS + 1) * 2);
    expect(back.slice(0, 2)).toEqual([middle.x + middle.width, expect.closeTo(top[3])]);
    expect(back.slice(-2)).toEqual([middle.x, expect.closeTo(top[1])]);
  });

  it('keeps waves inside shallow fluid', () => {
    const shallow = body(fieldWith([[1, 2, 0.06], [2, 2, 0.06]]), 1, 2)!;
    for (let t = 0; t < 2; t += 0.1) {
      const line = fluidSurfaceWave(shallow, T, t, { ...wavy, waveAmplitude: 0.3 })!.line;
      for (let i = 1; i < line.length; i += 2) expect(line[i]).toBeLessThanOrEqual(shallow.bodyBottom);
    }
  });
});

describe('wave and depth helpers', () => {
  it('wave height stays within -1..1 and depends on x and time', () => {
    let min = 1, max = -1;
    for (let x = 0; x < 400; x += 7) for (let t = 0; t < 4; t += 0.3) {
      const h = fluidWaveHeight(x, t, DEFAULT_FLUID_APPEARANCE, T);
      min = Math.min(min, h); max = Math.max(max, h);
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(max - min).toBeGreaterThan(1);
    expect(fluidWaveHeight(10, 0, DEFAULT_FLUID_APPEARANCE, T)).not.toBe(fluidWaveHeight(10, 1.1, DEFAULT_FLUID_APPEARANCE, T));
  });

  it('a stopped wave stays put', () => {
    const a: FluidAppearance = { ...wavy, waveSpeed: 0 };
    expect(fluidWaveHeight(33, 0, a, T)).toBe(fluidWaveHeight(33, 9, a, T));
  });

  it('depth shading darkens and thickens with depth, up to the cap, by the fluid\'s own strengths', () => {
    const a: FluidAppearance = { ...DEFAULT_FLUID_APPEARANCE, depthDarkening: 0.5, depthOpacity: 0.5 };
    expect(fluidDepthShade(0.6, a, 0)).toEqual({ darken: 0, opacity: 0.6 });
    const deep = fluidDepthShade(0.6, a, FLUID_DEPTH_CAP);
    expect(deep.darken).toBeCloseTo(0.5);
    expect(deep.opacity).toBeCloseTo(0.8);
    expect(fluidDepthShade(0.6, a, FLUID_DEPTH_CAP * 3)).toEqual(deep);
    expect(fluidDepthShade(0.6, { ...a, depthDarkening: 0, depthOpacity: 0 }, 5)).toEqual({ darken: 0, opacity: 0.6 });
  });

  it('bandBelowLine hangs a strip under a line without passing the bottom', () => {
    expect(bandBelowLine([0, 10, 10, 12], 5, 100)).toEqual([0, 10, 10, 12, 10, 17, 0, 15]);
    expect(bandBelowLine([0, 10, 10, 12], 5, 14)).toEqual([0, 10, 10, 12, 10, 14, 0, 14]);
  });
});

describe('FluidAppearance data', () => {
  it('fills in whatever is missing or unusable with the defaults, and clamps', () => {
    expect(resolveFluidAppearance(null)).toEqual(DEFAULT_FLUID_APPEARANCE);
    expect(resolveFluidAppearance({ waveAmplitude: 0.1, highlight: 'x', waveSpeed: 99 })).toEqual({ ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0.1, waveSpeed: 4 });
    expect(resolveFluidAppearance([1, 2])).toEqual(DEFAULT_FLUID_APPEARANCE);
  });

  it('validates ranges and shape', () => {
    expect(validateFluidAppearance(null)).toEqual([]);
    expect(validateFluidAppearance({ waveAmplitude: 0.1 })).toEqual([]);
    expect(validateFluidAppearance({ waveAmplitude: 0.9 })).toHaveLength(1);
    expect(validateFluidAppearance({ highlight: -1, depthOpacity: 2 })).toHaveLength(2);
    expect(validateFluidAppearance('x')).toHaveLength(1);
  });

  it('is part of validating a fluid', () => {
    const base = { typeKey: 'OIL', name: 'Oil', color: '#000000', opacity: 0.9, density: 1, viscosity: 0.5, flowRate: 0.5, minLevel: 0.05, flowThreshold: 0.02 };
    expect(validateFluid(base)).toEqual([]);
    expect(validateFluid({ ...base, appearance: { waveSpeed: 10 } })).toHaveLength(1);
  });
});

describe('fluid colour helpers', () => {
  it('parses #rrggbb and falls back to black', () => {
    expect(parseHexColor('#ff8800')).toBe(0xff8800);
    expect(parseHexColor('orange')).toBe(0);
    expect(parseHexColor('#fff')).toBe(0);
  });

  it('lightens towards white and darkens towards black', () => {
    expect(lightenColor(0x102030, 0.5)).toBe(0x889098);
    expect(lightenColor(0x000000, 1)).toBe(0xffffff);
    expect(darkenColor(0x806040, 0.5)).toBe(0x403020);
    expect(darkenColor(0x806040, 7)).toBe(0x000000);
  });

  it('writes a CSS colour', () => {
    expect(colorToCss(0xff8040, 0.5)).toBe('rgba(255, 128, 64, 0.5)');
  });
});
