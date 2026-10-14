import type { FluidField } from './fluidWire';

/** Where the fluid in one cell is drawn, in pixels. */
export interface FluidRect {
  x: number;
  y: number;
  width: number;
  height: number;
  fluidId: number;
  /** True for the exposed top of a body of fluid (gets a surface highlight). */
  surface: boolean;
}

/**
 * Where the fluid in one cell is drawn. A cell fills from the bottom up to its level, except that a cell
 * with the same fluid above it is drawn full: fluid flowing down a column is continuous, not a stack of
 * partial cells with gaps. Returns null for an empty cell. Shared so the game and the admin preview draw
 * fluid exactly alike.
 */
export function layoutFluidCell(field: FluidField, cx: number, cy: number, tileSize: number): FluidRect | null {
  const fluidId = field.getFluidId(cx, cy);
  if (fluidId === 0) return null;
  const covered = field.getFluidId(cx, cy - 1) === fluidId;
  const fill = covered ? 1 : Math.min(1, field.getLevel(cx, cy));
  const height = Math.max(1, Math.round(fill * tileSize));
  return {
    x: cx * tileSize,
    y: (cy + 1) * tileSize - height,
    width: tileSize,
    height,
    fluidId,
    surface: !covered,
  };
}
