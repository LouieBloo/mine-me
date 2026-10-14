import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FLUID_APPEARANCE, FLUID_DEPTH_CAP, FLUID_SHADE_STRIPS, FLUID_WAVE_SEGMENTS, FluidField, FluidLayout, STREAM_MAX_WIDTH, bandBelowLine,
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

  it('neighbours at different levels lean towards each other, the more the closer they are', () => {
    const lean = (lower: number) => {
      const field = fieldWith([[1, 3, 0.8], [2, 3, lower]]);
      const a = body(field, 1, 3)!;
      return { gap: body(field, 2, 3)!.topLeft - a.topRight, k: a.waveRight, slope: a.topRight - a.topLeft };
    };
    const near = lean(0.7);
    const far = lean(0.3);
    expect(near.k).toBeGreaterThan(far.k);
    expect(near.gap).toBeLessThan(0.1 * T); // nearly continuous
    expect(far.slope).toBeGreaterThan(0); // still slopes down towards the lower one
    let lastK = 0;
    for (let lower = 0.05; lower <= 0.8; lower += 0.05) {
      const { k } = lean(lower);
      expect(k).toBeGreaterThanOrEqual(lastK - 1e-9);
      lastK = k;
    }
  });

  it('does not join across a tile or more (a cliff stays vertical), a different fluid, or a ledge in between', () => {
    const cliff = fieldWith([[1, 3, 1], [1, 2, 0.5], [2, 3, 0.4]]);
    expect(body(cliff, 2, 3)!.waveLeft).toBe(0);
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
  });
});

describe('FluidLayout: streams', () => {
  const box = terrain(['#####', '#...#', '#...#', '#...#', '#####']);
  const make = (cells: [number, number, number][]) => {
    const field = new FluidField(5, 5);
    for (const [x, y, level] of cells) field.set(x, y, 1, q(level));
    return field;
  };

  it('fluid falling with air on both sides is a narrow stream, centred, and none of it is a body', () => {
    const field = make([[2, 1, 0.3]]);
    const s = stream(field, 2, 1, box)!;
    expect(s.width).toBeCloseTo(0.45 * T, 0);
    expect(s.x).toBeCloseTo(2 * T + (T - s.width) / 2);
    expect(body(field, 2, 1, box)).toBeUndefined();
  });

  it('a stream widens with more fluid (to a limit) and thins to nothing as it runs out', () => {
    const width = (level: number) => stream(make([[2, 1, level]]), 2, 1, box)?.width ?? 0;
    expect(width(1)).toBeCloseTo(STREAM_MAX_WIDTH * T, 0);
    expect(width(0.2)).toBeGreaterThan(width(0.1));
    expect(width(0.02)).toBeLessThan(0.05 * T);
  });

  it('nothing is a stream without a terrain sampler', () => {
    expect(stream(make([[2, 1, 0.3]]), 2, 1)).toBeUndefined();
  });

  it('fluid in a one-wide shaft (walls both sides) is never a stream', () => {
    const shaft = terrain(['###', '#.#', '#.#', '###']);
    const field = new FluidField(3, 4);
    field.set(1, 1, 1, q(0.5));
    expect(stream(field, 1, 1, shaft)).toBeUndefined();
  });

  it('fluid resting on the floor is a puddle', () => {
    const field = make([[2, 3, 0.2]]);
    expect(stream(field, 2, 3, box)).toBeUndefined();
    expect(body(field, 2, 3, box)!.surface).toBe(true);
  });

  it('falling fluid joins the fluid beside it smoothly: the more beside it, the less of it is a stream', () => {
    let lastWidth = Infinity;
    const widths = new Set<number>();
    for (let beside = 0; beside <= 0.3; beside += 0.02) {
      const field = make([[2, 1, 0.3], ...(beside > 0 ? ([[1, 1, beside]] as [number, number, number][]) : [])]);
      const w = stream(field, 2, 1, box)?.width ?? 0;
      expect(w).toBeLessThanOrEqual(lastWidth + 1e-9);
      // A thin film appearing beside it must not make the stream vanish in one go
      expect(lastWidth === Infinity ? 0 : lastWidth - w).toBeLessThan(0.15 * T);
      widths.add(Math.round(w));
      lastWidth = w;
    }
    expect(lastWidth).toBe(0);
    expect(widths.size).toBeGreaterThan(4);
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
    for (let i = 1; i < bands.length; i++) expect(bands[i].points[1]).toBe(bands[i - 1].points[5]);
    expect(bands[0].points[1]).toBe(2 * T);
    expect(bands[bands.length - 1].points[5]).toBe(3 * T);
    expect(bands[0].depth).toBeLessThan(bands[1].depth);
  });

  it('clips to a sloped surface', () => {
    const field = fieldWith([[1, 2, 0.4], [2, 2, 0.7]]);
    const [first] = fluidBodyBands(body(field, 1, 2)!, T, still);
    expect(first.points[1]).toBeGreaterThan(first.points[3]); // lower on the left, rising to the deeper neighbour
  });

  it('cuts the body short of the surface by the wave room, only where the surface carries on', () => {
    const shape = body(fieldWith([[1, 2, 0.5], [2, 2, 0.5]]), 1, 2)!;
    const first = (a: FluidAppearance) => fluidBodyBands(shape, T, a)[0].points;
    expect(first(wavy)[1]).toBe(first(still)[1]); // the free left edge
    expect(first(wavy)[3] - first(still)[3]).toBeCloseTo(0.1 * T);
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
