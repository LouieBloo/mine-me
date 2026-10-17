import { DEFAULT_FLUID_APPEARANCE, type FluidAppearance } from '../../types/fluid';
import type { FluidLevels } from './FluidDisplay';
import { FLUID_UNITS } from './FluidGrid';
import { isFluidCovered } from './fluidCover';

/** Depth (in cells below the surface) at which depth shading is at full strength. */
export const FLUID_DEPTH_CAP = 6;
/** Horizontal slices a cell is drawn in, so depth shading changes smoothly down a column instead of in cell-sized steps. */
export const FLUID_SHADE_STRIPS = 4;
/** Points sampled across one cell along an animated surface. */
export const FLUID_WAVE_SEGMENTS = 4;
/** A falling cell holding one unit is drawn this strong (a fraction of the fluid's opacity); a thin fall is fainter, never narrower. */
export const FALL_MIN_STRENGTH = 0.4;
/** A falling cell holding this many units or more is drawn at full strength. */
export const FALL_FULL_STRENGTH_UNITS = FLUID_UNITS / 2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** How strongly a falling cell is drawn, 0 to 1, from the units it holds: thin falls are fainter. Resting fluid is always 1. */
export function fallStrength(units: number): number {
  const t = clamp01((units - 1) / (FALL_FULL_STRENGTH_UNITS - 1));
  return FALL_MIN_STRENGTH + (1 - FALL_MIN_STRENGTH) * t;
}

/** One piece of fluid to draw in a cell. All positions are pixels. */
export interface FluidShape {
  cx: number;
  cy: number;
  fluidId: number;
  /** Left edge and width: always the whole cell. */
  x: number;
  width: number;
  /** What is drawn is clipped to `top`..`bottom` (the cell). */
  top: number;
  bottom: number;
  /** Height of the surface line at the left and right edge of the cell. It may lie above or below this cell; what is under it, inside the cell, is fluid. */
  topLeft: number;
  topRight: number;
  /** Height of the surface at the middle of the cell: halfway between the corners (a straight line across the cell). */
  topMid: number;
  /** Nothing of the same fluid is above this cell: its top is a surface (waves and the highlight go here). */
  surface: boolean;
  /** 0 to 1: how far the surface continues into the neighbour on each side (waves die out where it does not). */
  waveLeft: number;
  waveRight: number;
  /** The top surface of the column of fluid this cell is part of (depth is measured from here), and the bottom of the cell. */
  surfaceY: number;
  bodyBottom: number;
  /** Cells below the surface at this shape's top. */
  depth: number;
  /** The cell's fluid is falling (the cell below can take more of it): a full-width column, scrolled when drawn. */
  falling: boolean;
  /** 0 to 1: how strongly it is drawn (a thin fall is fainter). */
  strength: number;
}

/** A flat polygon (x0, y0, x1, y1, ...) and how deep in the fluid it is, in cells. */
export interface FluidBand {
  points: number[];
  depth: number;
}

/**
 * Lays out the fluid for drawing, one cell at a time, from its level and its neighbours (Minecraft's way, in 2D). The
 * shared answer for the game and the admin preview. Make one per redraw: it remembers what it worked out until it is
 * thrown away.
 *
 *  - A cell with the same fluid above it is a full cell tall.
 *  - Any other cell is filled from the bottom to its level. Each top corner is the average of this cell's surface and
 *    its neighbour's on that side when the neighbour holds the same fluid (a neighbour with fluid above it counts as
 *    full), so a neighbouring pair always meet at the same height: no seams, a pool slopes over a ledge into the fall,
 *    and a pool's edge rises to meet a waterfall beside it. Air, a wall or another fluid beside it: its own height.
 *  - A falling cell is drawn like any other cell (a full-width column) and is marked `falling`; a thin fall is fainter.
 *
 * Nothing here needs to know about terrain: a wall and open air beside a cell both mean "no fluid there".
 */
export class FluidLayout {
  private readonly field: FluidLevels;
  private readonly tile: number;
  private readonly surfaces = new Map<number, number>();
  private readonly lifts = new Map<number, number>();

  constructor(field: FluidLevels, tile: number) {
    this.field = field;
    this.tile = tile;
  }

  private inGrid(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.field.width && y < this.field.height;
  }

  private isCovered(x: number, y: number): boolean {
    return this.inGrid(x, y) && isFluidCovered(this.field, x, y);
  }

  /**
   * How far (pixels) the fluid in a cell is pushed down: a cell holds one fluid, so a layer of fluid resting on a
   * different fluid below it that fills only part of its cell (oil on a thin puddle) is drawn sitting directly on that
   * fluid's surface, not at the bottom of its own cell with a gap of air under it. The whole run of the fluid above is
   * pushed down together. Zero when what is below is full, solid, empty or the same fluid.
   */
  private lift(x: number, y: number): number {
    const key = y * this.field.width + x;
    const cached = this.lifts.get(key);
    if (cached !== undefined) return cached;
    const id = this.field.getFluidId(x, y);
    let bottom = y;
    while (this.joins(id, x, bottom + 1)) bottom++;
    const belowId = this.inGrid(x, bottom + 1) ? this.field.getFluidId(x, bottom + 1) : 0;
    const resting = belowId !== 0 && belowId !== id && !this.isCovered(x, bottom + 1);
    const value = resting ? (1 - Math.min(1, this.field.getLevel(x, bottom + 1))) * this.tile : 0;
    this.lifts.set(key, value);
    return value;
  }

  /** Where the surface of a cell's own fluid is, in pixels: its top when covered, else the line its level fills up to. */
  private ownSurface(x: number, y: number): number {
    const lift = this.lift(x, y);
    if (this.isCovered(x, y)) return y * this.tile + lift;
    return (y + 1) * this.tile + lift - Math.min(1, this.field.getLevel(x, y)) * this.tile;
  }

  /** Whether a neighbour holds the same fluid as the cell. */
  private joins(fluidId: number, x: number, y: number): boolean {
    return this.inGrid(x, y) && this.field.getFluidId(x, y) === fluidId && this.field.getLevel(x, y) > 0;
  }

  /** The surface at one side of a cell: shared with the neighbour there, so the two always agree. */
  private corner(x: number, y: number, fluidId: number, side: -1 | 1, own: number): number {
    return this.joins(fluidId, x + side, y) ? (own + this.ownSurface(x + side, y)) / 2 : own;
  }

  /** The top surface of the column of fluid a cell is part of (the surface of its topmost cell), cached. */
  private columnSurface(x: number, y: number): number {
    const key = y * this.field.width + x;
    const cached = this.surfaces.get(key);
    if (cached !== undefined) return cached;
    let top = y;
    while (this.isCovered(x, top)) top--;
    const value = this.ownSurface(x, top);
    this.surfaces.set(key, value);
    return value;
  }

  /**
   * Where the fluid in a cell is seen, in pixels: the average of its two top corners (its cell top when it has fluid
   * above it). Null for an empty cell. Fire uses it to put flames on the fluid as it is drawn.
   */
  public surfaceAt(cx: number, cy: number): number | null {
    const shape = this.shapeAt(cx, cy);
    return shape ? (shape.topLeft + shape.topRight) / 2 : null;
  }

  /** What to draw in one cell: one shape, or none for an empty cell. */
  public shapesAt(cx: number, cy: number): FluidShape[] {
    const shape = this.shapeAt(cx, cy);
    return shape ? [shape] : [];
  }

  private shapeAt(cx: number, cy: number): FluidShape | null {
    if (!this.inGrid(cx, cy)) return null;
    const { field, tile } = this;
    const fluidId = field.getFluidId(cx, cy);
    const level = field.getLevel(cx, cy);
    if (fluidId === 0 || !(level > 0)) return null;
    const lift = this.lift(cx, cy);
    const cellTop = cy * tile + lift;
    const cellBottom = (cy + 1) * tile + lift;
    const covered = this.isCovered(cx, cy);
    const falling = field.isFalling?.(cx, cy) ?? false;
    const own = this.ownSurface(cx, cy);
    const topLeft = covered ? cellTop : this.corner(cx, cy, fluidId, -1, own);
    const topRight = covered ? cellTop : this.corner(cx, cy, fluidId, 1, own);
    // Waves run on along a surface that carries on into a neighbour that is a surface too, and stop at a wall, at open
    // air, and where the neighbour is falling or has fluid above it (so a wave never opens a gap at a join)
    const waves = (side: -1 | 1) => {
      if (covered || falling) return 0;
      const nx = cx + side;
      return this.joins(fluidId, nx, cy) && !this.isCovered(nx, cy) && !(field.isFalling?.(nx, cy) ?? false) ? 1 : 0;
    };
    const surfaceY = this.columnSurface(cx, cy);
    return {
      cx, cy, fluidId, x: cx * tile, width: tile, top: cellTop, bottom: cellBottom,
      topLeft, topRight, topMid: (topLeft + topRight) / 2, surface: !covered,
      waveLeft: waves(-1), waveRight: waves(1),
      surfaceY, bodyBottom: cellBottom, depth: Math.max(0, (cellTop - surfaceY) / tile),
      falling, strength: falling ? fallStrength(Math.round(level * FLUID_UNITS)) : 1,
    };
  }
}

/** The shapes in one cell, for a one-off look (drawing many cells should share one `FluidLayout`). */
export function layoutFluidShapes(field: FluidLevels, cx: number, cy: number, tile: number): FluidShape[] {
  return new FluidLayout(field, tile).shapesAt(cx, cy);
}

/** How dark and opaque fluid is at a depth (in cells below its surface). `darken` is 0-1 towards black. */
export function fluidDepthShade(baseOpacity: number, appearance: FluidAppearance, depth: number): { darken: number; opacity: number } {
  const t = Math.min(1, Math.max(0, depth / FLUID_DEPTH_CAP));
  return {
    darken: appearance.depthDarkening * t,
    opacity: baseOpacity + (1 - baseOpacity) * appearance.depthOpacity * t,
  };
}

/**
 * A shape as horizontal bands, each with its own depth, clipped to its surface line. A body is cut `waveRoom`
 * below its surface so the animated wave layer fits exactly in the gap (nothing overlaps, so a see-through
 * fluid never double-draws). Bands line up with the cell grid, so cells drawn separately meet without seams.
 */
export function fluidBodyBands(shape: FluidShape, tile: number, appearance: FluidAppearance = DEFAULT_FLUID_APPEARANCE): FluidBand[] {
  const roomL = waveRoom(shape, tile, appearance, shape.topLeft, shape.waveLeft);
  const roomR = waveRoom(shape, tile, appearance, shape.topRight, shape.waveRight);
  const yL = shape.topLeft + roomL;
  const yR = shape.topRight + roomR;
  const yM = shape.topMid + (roomL + roomR) / 2;
  const x1 = shape.x + shape.width;
  const xM = shape.x + shape.width / 2;
  const cellTop = shape.top;
  const stripHeight = tile / FLUID_SHADE_STRIPS;
  const bands: FluidBand[] = [];
  for (let k = 0; k < FLUID_SHADE_STRIPS; k++) {
    const s0 = Math.max(shape.top, Math.round(cellTop + k * stripHeight));
    const s1 = Math.min(shape.bottom, Math.round(cellTop + (k + 1) * stripHeight));
    if (s1 <= s0) continue;
    // The surface is two straight pieces (left edge to middle, middle to right edge), each held inside the strip
    const left = clipLineToStrip(shape.x, yL, xM, yM, s0, s1, true);
    const right = clipLineToStrip(xM, yM, x1, yR, s0, s1, true);
    const top = [...left!, ...right!.slice(2)];
    if (top.every((v, i) => i % 2 === 0 || v >= s1)) continue; // the surface is below this whole strip
    const highest = Math.min(...top.filter((_, i) => i % 2 === 1));
    const middle = (highest + s1) / 2;
    bands.push({ points: closeOnStripBottom(top, shape.x, x1, s1), depth: Math.max(0, (middle - shape.surfaceY) / tile) });
  }
  return bands;
}

/**
 * A strip's polygon from its top edge: where the edge has come down onto the strip's bottom it stops there, so the
 * outline never runs along the bottom and back again (a sliver with no area that anti-aliasing still draws as a
 * hairline beside a steep surface).
 */
function closeOnStripBottom(top: number[], x0: number, x1: number, s1: number): number[] {
  let start = 0;
  while (start + 3 < top.length && top[start + 1] >= s1 && top[start + 3] >= s1) start += 2;
  let end = top.length;
  while (end - 4 >= start && top[end - 1] >= s1 && top[end - 3] >= s1) end -= 2;
  const points = top.slice(start, end);
  if (points[points.length - 1] < s1) points.push(x1, s1);
  if (points[1] < s1) points.push(x0, s1);
  return points;
}

/**
 * The top edge of the fluid inside one horizontal strip: the surface line from (x0, y0) to (x1, y1) held between the
 * strip's top `s0` and bottom `s1`, with a corner wherever the line crosses either, so a steep surface that passes
 * through a strip part way across a cell is followed exactly (clamping only the two ends would cut a wedge out of it).
 * Null when the line lies below the whole strip (no fluid in it), unless `always` (one piece of a longer line: the
 * caller decides).
 */
function clipLineToStrip(x0: number, y0: number, x1: number, y1: number, s0: number, s1: number, always = false): number[] | null {
  if (y0 >= s1 && y1 >= s1 && !always) return null;
  const at = (y: number) => x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  const clampY = (y: number) => Math.min(s1, Math.max(s0, y));
  const points: number[] = [x0, clampY(y0)];
  // Where the line crosses the strip's top or bottom, placed exactly on that edge
  const crossings: Array<[number, number]> = [];
  if (y0 !== y1) {
    for (const edge of [s0, s1]) {
      if ((y0 - edge) * (y1 - edge) < 0) crossings.push([at(edge), edge]);
    }
  }
  crossings.sort((a, b) => a[0] - b[0]);
  for (const [cx, cy] of crossings) points.push(cx, cy);
  points.push(x1, clampY(y1));
  return points;
}

/** How far a wave may move a body's surface at one edge, in pixels: never more than half the fluid there. */
function waveRoom(shape: FluidShape, tile: number, appearance: FluidAppearance, top: number, weight: number): number {
  if (shape.falling || !(weight > 0) || appearance.waveAmplitude <= 0) return 0;
  return weight * Math.min(appearance.waveAmplitude * tile, Math.max(0, shape.bodyBottom - top) / 2);
}

/**
 * Wave height at a world x, -1 to 1. Two sines of different length and speed so it does not look like a
 * single repeating ripple. Depends only on x and time, so neighbouring cells agree where they meet.
 */
export function fluidWaveHeight(worldX: number, timeSec: number, appearance: FluidAppearance, tile: number): number {
  const phase = timeSec * appearance.waveSpeed;
  const a = Math.sin(2 * Math.PI * (worldX / (2.2 * tile) - phase));
  const b = Math.sin(2 * Math.PI * (worldX / (1.3 * tile) + 0.7 * phase + 0.35));
  return (a + 0.5 * b) / 1.5;
}

/** The animated top of a surface cell. */
export interface FluidSurfaceWave {
  /** The wave line, left to right (x0, y0, x1, y1, ...). The highlight follows it. */
  line: number[];
  /** The fluid between the wave line and the top of the static body (same layout as `FluidBand.points`). Empty when still. */
  fill: number[];
}

/** The wave line and the gap-filling polygon for a surface cell at a moment in time. Null if the cell has no surface. */
export function fluidSurfaceWave(shape: FluidShape, tile: number, timeSec: number, appearance: FluidAppearance = DEFAULT_FLUID_APPEARANCE): FluidSurfaceWave | null {
  if (!shape.surface) return null;
  const roomL = waveRoom(shape, tile, appearance, shape.topLeft, shape.waveLeft);
  const roomR = waveRoom(shape, tile, appearance, shape.topRight, shape.waveRight);
  const line: number[] = [];
  const base: number[] = [];
  for (let i = 0; i <= FLUID_WAVE_SEGMENTS; i++) {
    const u = i / FLUID_WAVE_SEGMENTS;
    const x = shape.x + shape.width * u;
    const baseY = u <= 0.5 ? shape.topLeft + (shape.topMid - shape.topLeft) * u * 2 : shape.topMid + (shape.topRight - shape.topMid) * (u - 0.5) * 2;
    const room = roomL + (roomR - roomL) * u;
    line.push(x, baseY + (room > 0 ? fluidWaveHeight(x, timeSec, appearance, tile) * room : 0));
    base.push(x, baseY + room);
  }
  // No room (or less than half a pixel, which would only draw as a hairline): just the line
  if (Math.max(roomL, roomR) < 0.5) return { line, fill: [] };
  const fill = [...line];
  for (let i = base.length - 2; i >= 0; i -= 2) fill.push(base[i], base[i + 1]);
  return { line, fill };
}

/** A strip of the fluid hanging `depthPx` below a polyline (never past `bottom`, pass the shape's `bodyBottom`), for the soft glow under the surface. */
export function bandBelowLine(line: number[], depthPx: number, bottom: number): number[] {
  const out = [...line];
  for (let i = line.length - 2; i >= 0; i -= 2) out.push(line[i], Math.min(bottom, line[i + 1] + depthPx));
  return out;
}
