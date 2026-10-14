import { DEFAULT_FLUID_APPEARANCE, type FluidAppearance } from '../../types/fluid';
import type { FluidLevels } from './FluidDisplay';

/** Says whether a cell is solid terrain. Streams need it to tell falling fluid from fluid in a one-wide shaft. */
export type SolidSampler = (cx: number, cy: number) => boolean;

/** Depth (in cells below the surface) at which depth shading is at full strength. */
export const FLUID_DEPTH_CAP = 6;
/** Horizontal slices a cell is drawn in, so depth shading changes smoothly down a column instead of in cell-sized steps. */
export const FLUID_SHADE_STRIPS = 4;
/** Points sampled across one cell along an animated surface. */
export const FLUID_WAVE_SEGMENTS = 4;
/** A falling stream is never wider than this fraction of a cell, and is this many cells wide per unit of fluid below that. */
export const STREAM_MAX_WIDTH = 0.65;
export const STREAM_WIDTH_PER_LEVEL = 1.5;

/*
 * Every rule below is a ramp, never an on/off switch. The simulation alternates which way it spreads each step
 * and thin films come and go, so any yes/no rule that reads a neighbour (is it a stream, is it covered, is the
 * cell beside it a pool) flips every step and the drawing flickers. With ramps a small change in the fluid is
 * always a small change in the picture.
 */
/** Fluid rests on the cell below once that cell is this full; below `SUPPORT_FROM` it is falling into it. */
const SUPPORT_FROM = 0.75;
const SUPPORT_FULL = 0.95;
/** Fluid beside a falling cell, from 0 up to this level, turns it from a lone stream into part of the body beside it. */
const OPEN_SIDE_LEVEL = 0.25;
/** Fluid above a stream cell, from 0 up to this level, stretches it to the top of its cell (it joins the fluid above). */
const JOIN_ABOVE_LEVEL = 0.1;
/** Two neighbouring surfaces join fully once both hold at least this much fluid. */
const JOIN_AMOUNT = 0.1;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const supportOf = (levelBelow: number) => clamp01((levelBelow - SUPPORT_FROM) / (SUPPORT_FULL - SUPPORT_FROM));

/** One piece of fluid to draw in a cell. All positions are pixels. */
export interface FluidShape {
  cx: number;
  cy: number;
  fluidId: number;
  /** Left edge and width: the whole cell for a body of fluid, narrower for a stream. */
  x: number;
  width: number;
  /** What is drawn is clipped to `top`..`bottom` (the cell, or the length of a stream). */
  top: number;
  bottom: number;
  /** Height of the surface line at the left and right of `x`. It may lie above or below this cell; what is under it, inside the cell, is fluid. */
  topLeft: number;
  topRight: number;
  /** This cell draws its body's waves and surface highlight (exactly one cell per body does). */
  surface: boolean;
  /** 0 to 1: how far the surface continues into the neighbour on each side (waves die out where it does not). */
  waveLeft: number;
  waveRight: number;
  /** The body's surface at the middle of the column (depth is measured from here) and its bottom. */
  surfaceY: number;
  bodyBottom: number;
  /** Cells below the surface at this shape's top. */
  depth: number;
  /** True for fluid falling through open air, drawn as a narrow stream. */
  stream: boolean;
}

/** A flat polygon (x0, y0, x1, y1, ...) and how deep in the fluid it is, in cells. */
export interface FluidBand {
  points: number[];
  depth: number;
}

/**
 * The fluid in one column that rests on the same thing: everything from a floor (solid ground, the top of
 * another fluid, or nothing at all when it is falling) up to the next gap. It is drawn as ONE body whose height
 * is the fluid it holds, packed down onto its floor, so it has exactly one surface however the simulation has
 * spread the fluid between its cells.
 */
interface ColumnBody {
  fluidId: number;
  topRow: number;
  bottomRow: number;
  /** The bottom of the body (its floor), in pixels. */
  base: number;
  /** Fluid resting in the body, in cells. Fluid still falling (a stream) is not counted. */
  amount: number;
  surfaceY: number;
  edges?: { left: number; right: number; waveLeft: number; waveRight: number };
}

interface ColumnLayout {
  bodies: ColumnBody[];
  bodyAt: (ColumnBody | null)[];
  /** Fluid in each cell that is falling on its own, drawn as a stream rather than packed into the body. */
  falling: Float32Array;
}

/**
 * Lays out the fluid for drawing. The shared answer for the game and the admin preview. Make one per redraw:
 * it works a column at a time and remembers what it worked out until it is thrown away.
 *
 *  - Each column's fluid is packed into bodies (see `ColumnBody`): one surface each, never one per cell.
 *  - Fluid in a cell rests on the cell below in proportion to how full that cell is; the rest is falling. Falling
 *    fluid with fluid beside it is part of the body; falling fluid with air on both sides is a stream, narrower
 *    with less fluid, pressed to a wall it runs down, joining the fluid above it and running on into the body
 *    below it. A one-wide shaft with walls on both sides is never a stream.
 *  - Neighbouring surfaces of the same fluid meet at a shared height, the more so the closer they are (a tile
 *    apart, or a wall between them, and they do not).
 *  - Without a terrain sampler nothing is a stream and every empty cell counts as solid ground.
 */
export class FluidLayout {
  private readonly field: FluidLevels;
  private readonly tile: number;
  private readonly solid: SolidSampler | undefined;
  private readonly columns = new Map<number, ColumnLayout>();

  constructor(field: FluidLevels, tile: number, solid?: SolidSampler) {
    this.field = field;
    this.tile = tile;
    this.solid = solid;
  }

  private isSolid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.field.width || y >= this.field.height) return true;
    if (this.solid) return this.solid(x, y);
    return this.field.getFluidId(x, y) === 0;
  }

  /** 0 (fluid or walls beside it) to 1 (air on both sides): how much a falling cell is a lone stream. */
  private openness(x: number, y: number): number {
    if (!this.solid) return 0;
    const wallL = this.isSolid(x - 1, y);
    const wallR = this.isSolid(x + 1, y);
    if (wallL && wallR) return 0;
    const beside = Math.max(wallL ? 0 : this.field.getLevel(x - 1, y), wallR ? 0 : this.field.getLevel(x + 1, y));
    return 1 - clamp01(beside / OPEN_SIDE_LEVEL);
  }

  private column(x: number): ColumnLayout {
    const cached = this.columns.get(x);
    if (cached) return cached;
    const { field, tile } = this;
    const bodies: ColumnBody[] = [];
    const bodyAt: (ColumnBody | null)[] = new Array(field.height).fill(null);
    const falling = new Float32Array(field.height);
    let body: ColumnBody | null = null;
    let support = 0;
    for (let y = field.height - 1; y >= 0; y--) {
      const fluidId = field.getFluidId(x, y);
      if (fluidId === 0) {
        body = null;
        continue;
      }
      if (body && body.fluidId === fluidId) {
        // Resting only as much as everything beneath it rests
        support *= supportOf(field.getLevel(x, y + 1));
      } else {
        body = { fluidId, topRow: y, bottomRow: y, base: (y + 1) * tile, amount: 0, surfaceY: 0 };
        bodies.push(body);
        support = field.getFluidId(x, y + 1) !== 0 ? supportOf(field.getLevel(x, y + 1)) : this.isSolid(x, y + 1) ? 1 : 0;
      }
      body.topRow = y;
      const level = Math.min(1, field.getLevel(x, y));
      const packed = level * (1 - (1 - support) * this.openness(x, y));
      body.amount += packed;
      falling[y] = level - packed;
      bodyAt[y] = body;
    }
    for (const b of bodies) b.surfaceY = b.base - b.amount * tile;
    const layout = { bodies, bodyAt, falling };
    this.columns.set(x, layout);
    return layout;
  }

  /** Where a body's surface meets each neighbouring column, and how much it continues there. */
  private edgesOf(x: number, body: ColumnBody): NonNullable<ColumnBody['edges']> {
    if (body.edges) return body.edges;
    const { tile } = this;
    const side = (nx: number) => {
      if (nx < 0 || nx >= this.field.width || body.amount <= 0) return { y: body.surfaceY, k: 0 };
      let best: { y: number; k: number } = { y: body.surfaceY, k: 0 };
      for (const other of this.column(nx).bodies) {
        if (other.fluidId !== body.fluidId || other.amount <= 0) continue;
        const apart = Math.abs(other.surfaceY - body.surfaceY);
        if (apart >= tile) continue;
        const row = Math.floor((other.surfaceY + body.surfaceY) / 2 / tile);
        if (this.solid && (this.isSolid(x, row) || this.isSolid(nx, row))) continue;
        const k = (1 - apart / tile) * clamp01(Math.min(body.amount, other.amount) / JOIN_AMOUNT);
        if (k > best.k) best = { y: body.surfaceY + ((other.surfaceY - body.surfaceY) * k) / 2, k };
      }
      return best;
    };
    const l = side(x - 1);
    const r = side(x + 1);
    body.edges = { left: l.y, right: r.y, waveLeft: l.k, waveRight: r.k };
    return body.edges;
  }

  private streamWidth(amount: number): number {
    return this.tile * Math.min(STREAM_MAX_WIDTH, STREAM_WIDTH_PER_LEVEL * Math.max(0, amount));
  }

  /**
   * Where the fluid in a cell is seen, in pixels: the surface of the body it is packed into (which may be in a cell
   * below this one), or the top of the stream it falls in. Null for an empty cell. Fire uses it to put flames on the
   * fluid as it is drawn.
   */
  public surfaceAt(cx: number, cy: number): number | null {
    if (cx < 0 || cx >= this.field.width || cy < 0 || cy >= this.field.height) return null;
    const body = this.column(cx).bodyAt[cy];
    if (!body) return null;
    if (body.amount > 0) return body.surfaceY;
    const falling = this.shapesAt(cx, cy).find((shape) => shape.stream);
    return falling ? falling.top : (cy + 0.5) * this.tile;
  }

  /** What to draw in one cell: the body's part of it, and a stream if fluid is falling through it. Empty for an empty cell. */
  public shapesAt(cx: number, cy: number): FluidShape[] {
    if (cx < 0 || cx >= this.field.width || cy < 0 || cy >= this.field.height) return [];
    const col = this.column(cx);
    const body = col.bodyAt[cy];
    if (!body) return [];
    const { tile } = this;
    const cellTop = cy * tile;
    const cellBottom = (cy + 1) * tile;
    const shapes: FluidShape[] = [];

    if (body.amount > 0) {
      const edges = this.edgesOf(cx, body);
      if (Math.min(edges.left, edges.right) < cellBottom) {
        const surfaceRow = Math.min(body.bottomRow, Math.floor(body.surfaceY / tile));
        shapes.push({
          cx, cy, fluidId: body.fluidId, x: cx * tile, width: tile, top: cellTop, bottom: cellBottom,
          topLeft: edges.left, topRight: edges.right, surface: cy === surfaceRow,
          waveLeft: edges.waveLeft, waveRight: edges.waveRight,
          surfaceY: body.surfaceY, bodyBottom: body.base, depth: Math.max(0, (cellTop - body.surfaceY) / tile), stream: false,
        });
      }
    }

    // A stream: this cell's own falling fluid, or the stream from the cell above passing on down to the body's surface
    const aboveInBody = cy > 0 && col.bodyAt[cy - 1] === body;
    const width = Math.max(this.streamWidth(col.falling[cy]), aboveInBody ? this.streamWidth(col.falling[cy - 1]) : 0);
    if (width > 0) {
      const bottom = Math.min(cellBottom, Math.max(cellTop, body.surfaceY));
      const aboveLevel = aboveInBody ? this.field.getLevel(cx, cy - 1) : 0;
      // Nothing above: a falling blob sitting low in the cell; fluid above: it reaches up to join it
      const blobTop = Math.max(cellTop, bottom - col.falling[cy] * tile);
      const top = blobTop - (blobTop - cellTop) * clamp01(aboveLevel / JOIN_ABOVE_LEVEL);
      if (bottom - top > 0.01) {
        const wallL = this.solid ? this.isSolid(cx - 1, cy) : false;
        const wallR = this.solid ? this.isSolid(cx + 1, cy) : false;
        const x = wallL ? cx * tile : wallR ? (cx + 1) * tile - width : cx * tile + (tile - width) / 2;
        shapes.push({
          cx, cy, fluidId: body.fluidId, x, width, top, bottom, topLeft: top, topRight: top, surface: false,
          waveLeft: 0, waveRight: 0, surfaceY: top, bodyBottom: bottom, depth: 0, stream: true,
        });
      }
    }
    return shapes;
  }
}

/** The shapes in one cell, for a one-off look (drawing many cells should share one `FluidLayout`). */
export function layoutFluidShapes(field: FluidLevels, cx: number, cy: number, tile: number, solid?: SolidSampler): FluidShape[] {
  return new FluidLayout(field, tile, solid).shapesAt(cx, cy);
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
  const yL = shape.topLeft + waveRoom(shape, tile, appearance, shape.topLeft, shape.waveLeft);
  const yR = shape.topRight + waveRoom(shape, tile, appearance, shape.topRight, shape.waveRight);
  const x1 = shape.x + shape.width;
  const cellTop = shape.cy * tile;
  const stripHeight = tile / FLUID_SHADE_STRIPS;
  const bands: FluidBand[] = [];
  for (let k = 0; k < FLUID_SHADE_STRIPS; k++) {
    const s0 = Math.max(shape.top, Math.round(cellTop + k * stripHeight));
    const s1 = Math.min(shape.bottom, Math.round(cellTop + (k + 1) * stripHeight));
    if (s1 <= s0) continue;
    const l = Math.min(s1, Math.max(s0, yL));
    const r = Math.min(s1, Math.max(s0, yR));
    if (l >= s1 && r >= s1) continue;
    const middle = (Math.min(l, r) + s1) / 2;
    bands.push({ points: [shape.x, l, x1, r, x1, s1, shape.x, s1], depth: Math.max(0, (middle - shape.surfaceY) / tile) });
  }
  return bands;
}

/** How far a wave may move a body's surface at one edge, in pixels: never more than half the fluid there. */
function waveRoom(shape: FluidShape, tile: number, appearance: FluidAppearance, top: number, weight: number): number {
  if (shape.stream || !(weight > 0) || appearance.waveAmplitude <= 0) return 0;
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
    const baseY = shape.topLeft + (shape.topRight - shape.topLeft) * u;
    const room = roomL + (roomR - roomL) * u;
    line.push(x, baseY + (room > 0 ? fluidWaveHeight(x, timeSec, appearance, tile) * room : 0));
    base.push(x, baseY + room);
  }
  if (roomL === 0 && roomR === 0) return { line, fill: [] };
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
