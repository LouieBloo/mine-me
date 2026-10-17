import { describe, it, expect } from 'vitest';
import { DEFAULT_FLUID_APPEARANCE, FluidDisplay, FluidField, FluidGrid, FluidLayout, FluidRegistry, fallHurry, fluidBodyBands, toFluidWireCell, type FluidLevels } from '../src/index';

const STILL = { ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0 };

/**
 * Pours real fluid (the shared simulation, with Oil's settings) through the shapes the game draws, frame by frame,
 * and checks the two things the owner saw go wrong: two surface lines stacked in one column, and cells whose drawn
 * height flickers up and down from one step to the next while the fluid itself does not.
 */
const OIL = { typeKey: 'OIL', density: 0.8, flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02 };
const T = 64;

const SCENES: Record<string, { rows: string[]; spout: [number, number]; pourSteps: number; open?: { at: number; cells: [number, number][] } }> = {
  'a tank with a shelf under the spout and a gate': {
    rows: [
      '########################',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#....#####..#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '########################',
    ],
    spout: [6, 1], pourSteps: 30, open: { at: 45, cells: [[12, 8], [12, 9], [12, 10]] },
  },
  'a staircase of ledges': {
    rows: [
      '##################',
      '#................#',
      '#................#',
      '#####............#',
      '#................#',
      '#######..........#',
      '#................#',
      '#########........#',
      '#................#',
      '###########......#',
      '#................#',
      '##################',
    ],
    spout: [2, 2], pourSteps: 60,
  },
  'two basins joined by opening a wall': {
    rows: [
      '####################',
      '#..................#',
      '#..................#',
      '#........#.........#',
      '#........#.........#',
      '#........#.........#',
      '#........#.........#',
      '####################',
    ],
    spout: [3, 1], pourSteps: 25, open: { at: 30, cells: [[9, 6], [9, 5]] },
  },
};

function polygonArea(points: number[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    a += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return Math.abs(a) / 2;
}

/** A polygon cut down to an axis-aligned rectangle (Sutherland-Hodgman). */
function clipToRect(points: number[], x0: number, y0: number, x1: number, y1: number): number[] {
  let poly: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i += 2) poly.push([points[i], points[i + 1]]);
  const edges: Array<[(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]]> = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  for (const [inside, cross] of edges) {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
    poly = out;
    if (poly.length === 0) break;
  }
  return poly.flat();
}

/**
 * Fluid drawn inside each cell's square, in pixels of height (area / tile): every polygon that is drawn (body strips,
 * jets, spills), cut to the cell. A shape can reach past the cell that owns it (a spill starts at the pool's surface),
 * so this measures what is seen, not who drew it.
 */
function drawnHeights(layout: FluidLayout, W: number, H: number): number[] {
  const polygons: number[][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (const s of layout.shapesAt(x, y)) {
      if (s.stream) polygons.push([s.x, s.top, s.x + s.width, s.top, s.x + s.width, s.bottom, s.x, s.bottom]);
      else for (const band of fluidBodyBands(s, T, STILL)) polygons.push(band.points);
    }
  }
  const out = new Array(W * H).fill(0);
  for (const poly of polygons) {
    const xs = poly.filter((_, i) => i % 2 === 0);
    const ys = poly.filter((_, i) => i % 2 === 1);
    for (let cy = Math.max(0, Math.floor(Math.min(...ys) / T)); cy <= Math.min(H - 1, Math.floor(Math.max(...ys) / T)); cy++) {
      for (let cx = Math.max(0, Math.floor(Math.min(...xs) / T)); cx <= Math.min(W - 1, Math.floor(Math.max(...xs) / T)); cx++) {
        const piece = clipToRect(poly, cx * T, cy * T, (cx + 1) * T, (cy + 1) * T);
        if (piece.length >= 6) out[cy * W + cx] += polygonArea(piece) / T;
      }
    }
  }
  return out;
}

function pour(name: string) {
  const sc = SCENES[name];
  const solidRows = sc.rows.map((r) => r.split('').map((c) => c === '#'));
  const W = sc.rows[0].length;
  const H = sc.rows.length;
  const solid = (x: number, y: number) => solidRows[y]?.[x] ?? true;
  const grid = new FluidGrid(W, H, new FluidRegistry([OIL]), solid);
  const display = new FluidDisplay(W, H);
  const heights: number[][] = [];
  const levels: number[][] = [];
  let stackedSurfaces = 0;
  let flickers = 0;
  for (let step = 0; step < 120; step++) {
    if (step < sc.pourSteps) grid.addFluid(sc.spout[0], sc.spout[1], 1, 0.5);
    if (sc.open && step === sc.open.at) for (const [x, y] of sc.open.cells) { solidRows[y][x] = false; grid.onTileChanged(x, y); }
    grid.step();
    // What the client receives, then what it draws: eased at 60 frames a second, 10 steps a second
    const received = new FluidField(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = grid.getFluidId(x, y);
      if (id) received.apply([toFluidWireCell(x, y, id, grid.getLevel(x, y), grid.getFalling(x, y))]);
    }
    // As the client does: falling fluid snaps into the cell it fell into (and out of the one it left) and slides
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) display.setTarget(x, y, received.getFluidId(x, y), received.getLevel(x, y), received.getFalling(x, y));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const quick = fallHurry(received, x, y, solid); if (quick > 0) { display.hurry(x, y, quick); display.hurry(x, y - 1, quick); } }
    for (let frame = 0; frame < 6; frame++) display.step(1 / 60);
    const drawn: FluidLevels = display;
    const layout = new FluidLayout(drawn, T, solid);
    const h = drawnHeights(layout, W, H);
    const l: number[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) l.push(received.getLevel(x, y));
    for (let x = 0; x < W; x++) {
      for (let y = 1; y < H; y++) {
        const here = layout.shapesAt(x, y).some((s) => s.surface);
        const above = layout.shapesAt(x, y - 1).some((s) => s.surface);
        if (here && above && drawn.getFluidId(x, y) === drawn.getFluidId(x, y - 1)) stackedSurfaces++;
      }
    }
    heights.push(h);
    levels.push(l);
    if (step >= 2) {
      for (let i = 0; i < h.length; i++) {
        const [a, b, c] = [heights[step - 2][i], heights[step - 1][i], h[i]];
        const swing = Math.abs(a - b) > 6 && Math.abs(b - c) > 6 && Math.sign(b - a) !== Math.sign(c - b);
        if (a > 0 && b > 0 && c > 0 && swing) { flickers++; if (process.env.FLICKER_DEBUG) process.stderr.write(`FLICKER ${name} step ${step} cell ${i % W},${Math.floor(i / W)} ${a.toFixed(1)} ${b.toFixed(1)} ${c.toFixed(1)}\n`); }
      }
    }
  }
  return { stackedSurfaces, flickers };
}

describe('pouring real fluid through what the game draws', () => {
  for (const name of Object.keys(SCENES)) {
    it(`${name}: one surface per body, and nothing flickers`, () => {
      expect(pour(name)).toEqual({ stackedSurfaces: 0, flickers: 0 });
    });
  }
});
