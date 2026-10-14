import { describe, it, expect } from 'vitest';
import { FluidDisplay, FluidField, FluidGrid, FluidLayout, FluidRegistry, toFluidWireCell, type FluidLevels } from '../src/index';

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

/** Fluid drawn in a cell, in pixels of height (streams count by their area). */
function drawnHeight(layout: FluidLayout, x: number, y: number): number {
  let h = 0;
  for (const s of layout.shapesAt(x, y)) {
    if (s.stream) h += ((s.bottom - s.top) * s.width) / T;
    else h += s.bottom - Math.min(s.bottom, Math.max(s.top, (s.topLeft + s.topRight) / 2));
  }
  return h;
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
      if (id) received.apply([toFluidWireCell(x, y, id, grid.getLevel(x, y))]);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) display.setTarget(x, y, received.getFluidId(x, y), received.getLevel(x, y));
    for (let frame = 0; frame < 6; frame++) display.step(1 / 60);
    const drawn: FluidLevels = display;
    const layout = new FluidLayout(drawn, T, solid);
    const h: number[] = [];
    const l: number[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      h.push(drawnHeight(layout, x, y));
      l.push(received.getLevel(x, y));
    }
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
        if (a > 0 && b > 0 && c > 0 && swing) flickers++;
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
