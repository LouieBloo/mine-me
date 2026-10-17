import type { FluidAppearance } from '../../types/fluid';

/** Light streaks in each falling cell. */
export const FLOW_STREAKS_PER_CELL = 3;
/** A streak is this long (a fraction of a cell) and starts again every cell, so a column of fall is a steady pattern. */
const STREAK_LENGTH = 0.38;
/** A streak is this wide (a fraction of a cell). */
const STREAK_WIDTH = 0.07;

/** One light streak to draw, in pixels. */
export interface FlowStreak {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A number from 0 to 1 that depends only on the column and the streak (the same every time, so a fall keeps its look). */
function unitHash(column: number, streak: number): number {
  let h = Math.imul(column + 1, 374761393) ^ Math.imul(streak + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Where the light streaks in a falling cell are at a moment in time. Positions depend on the cell's column and on the
 * world position and time only (never on when the cell was drawn), so the streaks run on unbroken from one cell of a
 * fall to the next and a redraw never restarts them. Streaks are clipped to `fromY`..`cellBottom` (the cell's
 * fluid), and run down at `appearance.flowSpeed` cells a second. All pixels.
 */
export function fluidFlowStreaks(cx: number, cy: number, tile: number, timeSec: number, appearance: FluidAppearance, fromY = cy * tile): FlowStreak[] {
  if (appearance.flowSpeed <= 0 || appearance.flowStreaks <= 0) return [];
  const cellTop = cy * tile;
  const cellBottom = cellTop + tile;
  const top = Math.max(cellTop, fromY);
  const scroll = timeSec * appearance.flowSpeed * tile;
  const length = STREAK_LENGTH * tile;
  const out: FlowStreak[] = [];
  for (let k = 0; k < FLOW_STREAKS_PER_CELL; k++) {
    const phase = unitHash(cx, k + 11) * tile;
    const x = cx * tile + (0.12 + 0.76 * unitHash(cx, k)) * tile - (STREAK_WIDTH * tile) / 2;
    // The streaks of this column start at phase + scroll + n * tile; take those that overlap the cell
    const first = Math.ceil((top - length - phase - scroll) / tile);
    for (let n = first; phase + scroll + n * tile < cellBottom; n++) {
      const start = phase + scroll + n * tile;
      const y0 = Math.max(top, start);
      const y1 = Math.min(cellBottom, start + length);
      if (y1 - y0 > 0.25) out.push({ x, y: y0, width: STREAK_WIDTH * tile, height: y1 - y0 });
    }
  }
  return out;
}
