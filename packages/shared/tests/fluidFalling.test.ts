import { describe, it, expect } from 'vitest';
import { FluidGrid, FluidRegistry } from '../src/index';

/**
 * Fluid falling through open air (the sandbox report: one poured cell turned into three thin columns side by side).
 * Falling is gravity, not flow: a falling cell drops whole, whatever the fluid's flow rate, and a steady stream moves
 * down as one even column.
 */
const WATER = { typeKey: 'WATER', density: 1, flowRate: 0.6, minLevel: 0.02, flowThreshold: 0.01 };
const LAVA = { typeKey: 'LAVA', density: 3, flowRate: 0.06, minLevel: 0.05, flowThreshold: 0.03 };

function sky(fluid: typeof WATER, width = 13, height = 14) {
  const grid = new FluidGrid(width, height, new FluidRegistry([fluid]), (x, y) => y >= height - 1 || x < 0 || x >= width);
  const column = (x: number) => Array.from({ length: height }, (_, y) => grid.getLevel(x, y));
  const cellsWithFluid = () => {
    const out: Array<[number, number]> = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (grid.getLevel(x, y) > 0) out.push([x, y]);
    return out;
  };
  return { grid, column, cellsWithFluid };
}

describe('fluid falling through the air', () => {
  for (const fluid of [WATER, LAVA]) {
    it(`a full cell of ${fluid.typeKey.toLowerCase()} falls whole, one cell a step, without spreading sideways in the air`, () => {
      const { grid, cellsWithFluid } = sky(fluid);
      grid.setCell(6, 1, 1, 1);
      for (let step = 1; step <= 8; step++) {
        grid.step();
        expect(cellsWithFluid(), `step ${step}`).toEqual([[6, 1 + step]]);
        expect(grid.getLevel(6, 1 + step)).toBeCloseTo(1, 6);
      }
    });
  }

  it('a steady pour falls as one even column: every cell of it holds what is poured each step', () => {
    const { grid, column } = sky(WATER);
    for (let step = 0; step < 9; step++) {
      grid.addFluid(6, 0, 1, 0.5);
      grid.step();
    }
    // The falling part, above where it lands (row 12 is the floor row)
    const falling = column(6).slice(1, 9);
    for (const level of falling) expect(level).toBeCloseTo(0.5, 6);
  });

  it('a heavy pour (more than half a cell a step) still falls as one even column and does not spread in the air', () => {
    const { grid, column, cellsWithFluid } = sky(WATER);
    for (let step = 0; step < 9; step++) {
      grid.addFluid(6, 0, 1, 0.75);
      grid.step();
    }
    for (const level of column(6).slice(1, 9)) expect(level).toBeCloseTo(0.75, 6);
    expect(cellsWithFluid().filter(([x, y]) => x !== 6 && y < 10)).toEqual([]);
  });

  it('lands and spreads out on the floor (it only spreads once it has something under it)', () => {
    const { grid, cellsWithFluid } = sky(WATER);
    grid.setCell(6, 1, 1, 1);
    for (let step = 0; step < 15; step++) grid.step();
    const cells = cellsWithFluid();
    expect(cells.every(([, y]) => y === 12)).toBe(true);
    expect(cells.length).toBeGreaterThan(3);
  });
});
