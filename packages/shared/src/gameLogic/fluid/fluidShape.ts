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
/**
 * A falling stream is as wide as the water it carries (a cell's worth falling through a cell fills its width), up to
 * this fraction of a cell.
 */
export const STREAM_MAX_WIDTH = 1;
export const STREAM_WIDTH_PER_LEVEL = 1;
/** A fall this many rows long or shorter, starting and ending in the air, is one falling blob rather than a stream. */
export const BLOB_MAX_ROWS = 2;
/** However little is falling, a stream is drawn at least this wide (a fraction of a cell), so a trickle reads as water. */
export const STREAM_MIN_WIDTH = 0.125;
/** Points along each curve of a spill (the water bending over a lip into the fall below). */
export const SPILL_CURVE_POINTS = 8;
/** How far (in cells) a spill arcs out past the jet before it drops, and the sheet thickness (in cells) that gets the full arc. */
const SPILL_ARC = 0.35;
const SPILL_FULL_ARC = 0.3;
/** A spill arcs out fully once this much is pouring over (a gentler ramp than the rest of it, so a wavering trickle over a lip does not pump the arc in and out). */
const SPILL_FULL_FLOW = 0.08;

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
/**
 * Fluid with fluid beside it but (nearly) nothing under it is spilling over an edge: it is drawn as a spill into the fall
 * below, not packed into a pool far beneath. Fully a spill with this much or less below it, not at all from `DROP_TO` up.
 */
const DROP_FROM = 0.1;
const DROP_TO = 0.3;
/** Less falling than this in a cell (in cells of fluid) is not part of a stream. */
const FLOW_EPS = 0.004;
/** A stream (and a spill) is at full strength once this much is falling in it, and thins away below that. */
const STREAM_FULL_FLOW = 0.02;
/** Two neighbouring surfaces join fully once they overlap vertically by this fraction of a cell (a ramp, so a ledge edge does not flip). */
const JOIN_OVERLAP = 0.15;
/** Two neighbouring surfaces join fully once both hold at least this much fluid. */
const JOIN_AMOUNT = 0.1;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const supportOf = (levelBelow: number) => clamp01((levelBelow - SUPPORT_FROM) / (SUPPORT_FULL - SUPPORT_FROM));
const dropOf = (levelBelow: number) => clamp01((DROP_TO - levelBelow) / (DROP_TO - DROP_FROM));

/**
 * How freely the fluid in a cell is falling, 0 to 1: the share of it that fell in from above this step, times how little
 * holds it up (solid ground or a nearly full cell below holds it). A blob dropping through open air is 1; fluid dropping
 * onto a heap or into a pool it is joining is near 0. A ramp throughout, for the client's easing (`FluidDisplay.hurry`).
 */
export function freeFallShare(levels: FluidLevels, x: number, y: number, solid?: SolidSampler): number {
  const level = levels.getLevel(x, y);
  const falling = levels.getFalling?.(x, y) ?? 0;
  if (!(level > 0) || !(falling > 0)) return 0;
  const belowSolid = y + 1 >= levels.height || (solid ? solid(x, y + 1) : false);
  // Only fluid resting below holds it up: fluid that is falling there too is on its way down
  const restingBelow = levels.getLevel(x, y + 1) - (levels.getFalling?.(x, y + 1) ?? 0);
  const held = belowSolid ? 1 : levels.getFluidId(x, y + 1) !== 0 ? supportOf(restingBelow) : 0;
  return clamp01(falling / level) * (1 - held);
}

/**
 * How much the client should hurry the easing of a cell fluid fell into, and of the cell it fell from (see
 * `FluidDisplay.hurry`), 0 to 1: its free fall (`freeFallShare`) times how much the fall emptied the cell above. A blob
 * dropping through the air leaves the cell above empty, and eased slowly it would be drawn smeared over both cells; a
 * steady stream keeps the cell above as full as before, nothing smears, and it keeps the slow easing that damps the
 * simulation's step-to-step pulsing.
 */
export function fallHurry(levels: FluidLevels, x: number, y: number, solid?: SolidSampler): number {
  const free = freeFallShare(levels, x, y, solid);
  if (free <= 0) return 0;
  const above = levels.getFluidId(x, y - 1) === levels.getFluidId(x, y) ? levels.getLevel(x, y - 1) : 0;
  return free * clamp01(1 - above / Math.max(levels.getLevel(x, y), 1e-9));
}

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
  /**
   * Height of the surface at the middle of `x`..`x + width`: a body's own surface. The surface line runs from the left
   * edge through here to the right edge, so the line along a pool passes through every column's real height (joining
   * the edges straight across would cut the top off a column that stands higher than its neighbours).
   */
  topMid: number;
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
  /**
   * Water bending over an edge into the fall below: the outline of the sheet, from the pool's surface at the edge down
   * to the top of the stream (x0, y0, x1, y1, ...). Absent on every other shape.
   */
  spill?: number[];
  /** A spill's outer edge, from the pool's surface over the lip and down to the jet (x0, y0, ...): where its highlight goes. */
  spillEdge?: number[];
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

/** One continuous fall down a column: drawn as one straight jet, the same width and place in every cell it crosses. */
interface StreamSegment {
  fluidId: number;
  /** The row it starts in (a spill's lip cell, or the first falling cell). */
  firstRow: number;
  /** Pixels: where the jet starts and where it lands (a surface below, or the floor). */
  top: number;
  bottom: number;
  x: number;
  width: number;
  /** How much is spilling into it over the lip on the left and on the right of `firstRow`, in cells of fluid. */
  spillLeft: number;
  spillRight: number;
}

interface ColumnLayout {
  bodies: ColumnBody[];
  bodyAt: (ColumnBody | null)[];
  /** Fluid in each cell that is falling through the air (a stream). */
  falling: Float32Array;
  /** Fluid in each cell that is pouring over an edge from the fluid beside it (a spill). */
  spilling: Float32Array;
  /** Fluid in each cell that the server says fell into it from above in the last step: drawn sliding down into it. */
  moving: Float32Array;
  /** The falls in this column, top to bottom. */
  segments: StreamSegment[];
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
 *  - Neighbouring surfaces of the same fluid meet at a shared height when they touch (their bodies overlap
 *    vertically, so a heap slopes smoothly). A wall between them, or a ledge over a lower pool, and they do not.
 *  - Without a terrain sampler nothing is a stream and every empty cell counts as solid ground.
 */
export class FluidLayout {
  private readonly field: FluidLevels;
  private readonly tile: number;
  private readonly solid: SolidSampler | undefined;
  private readonly columns = new Map<number, ColumnLayout>();
  /** Pixels falling fluid is still drawn above the cell it fell into (it slides down to it over a step). */
  private readonly fallOffset: number;

  /**
   * `fallProgress` is how far through the current simulation step the drawing is, 0 (the step has just arrived) to 1
   * (done): fluid the server says is falling is drawn that far along its way down from the cell above. Absent: 1, so
   * everything is drawn in its cell.
   */
  constructor(field: FluidLevels, tile: number, solid?: SolidSampler, options: { fallProgress?: number } = {}) {
    this.field = field;
    this.tile = tile;
    this.solid = solid;
    this.fallOffset = (1 - clamp01(options.fallProgress ?? 1)) * tile;
  }

  private isSolid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.field.width || y >= this.field.height) return true;
    if (this.solid) return this.solid(x, y);
    return this.field.getFluidId(x, y) === 0;
  }

  /**
   * 0 (fluid beside it) to 1 (nothing but air or wall beside it): how much a falling cell is a lone stream. Walls count
   * as nothing, so fluid falling down a one-wide shaft is a stream too; it only packs into the body below once the
   * cells under it are full (see `supportOf`), otherwise all of the falling water would be drawn squashed onto the
   * bottom and the shaft above it would look empty.
   */
  private openness(x: number, y: number): number {
    if (!this.solid) return 0;
    const wallL = this.isSolid(x - 1, y);
    const wallR = this.isSolid(x + 1, y);
    const beside = Math.max(wallL ? 0 : this.field.getLevel(x - 1, y), wallR ? 0 : this.field.getLevel(x + 1, y));
    return 1 - clamp01(beside / OPEN_SIDE_LEVEL);
  }

  /**
   * How much of the fluid beside a cell sits on solid ground at that row, 0 to 1 (weighted by how much fluid is on each
   * side): where it does, the cell is the lip of a drop the fluid can pour over. Terrain, so it does not change from
   * step to step.
   */
  private lipShare(x: number, y: number, fluidId: number): number {
    let weight = 0;
    let onGround = 0;
    for (const nx of [x - 1, x + 1]) {
      if (this.isSolid(nx, y) || this.field.getFluidId(nx, y) !== fluidId) continue;
      const level = this.field.getLevel(nx, y);
      weight += level;
      if (this.isSolid(nx, y + 1)) onGround += level;
    }
    return weight > 0 ? onGround / weight : 0;
  }

  private column(x: number): ColumnLayout {
    const cached = this.columns.get(x);
    if (cached) return cached;
    const { field, tile } = this;
    const bodies: ColumnBody[] = [];
    const bodyAt: (ColumnBody | null)[] = new Array(field.height).fill(null);
    const falling = new Float32Array(field.height);
    const spilling = new Float32Array(field.height);
    const moving = new Float32Array(field.height);
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
      const full = Math.min(1, field.getLevel(x, y));
      // What the server says is falling freely through open air is drawn moving down (below); the rest can rest, spill or
      // hang in the air. Fluid dropping onto something that holds it up (a heap, a pool), or falling right beside fluid it
      // is joining, is drawn where it is: the server's falling value pulses step to step there, and the drawing must not.
      moving[y] = this.solid ? full * freeFallShare(field, x, y, (cx, cy) => this.isSolid(cx, cy)) * this.openness(x, y) : 0;
      const level = full - moving[y];
      // What is not resting is either part of the fluid beside it or falling on its own
      const unsupported = level * (1 - support);
      const beside = 1 - this.openness(x, y);
      // Fluid beside it over a drop is spilling over the edge, when the fluid beside it sits on the ground there (the
      // corner it pours over); over fluid that is filling up, or down the side of a heap, it is part of that fluid
      // (falling fluid below does not fill the drop: it is on its way down, so only what rests there counts)
      const restingBelow = field.getLevel(x, y + 1) - (field.getFalling?.(x, y + 1) ?? 0);
      const drop = this.solid && !this.isSolid(x, y + 1) ? dropOf(restingBelow) * this.lipShare(x, y, fluidId) : 0;
      body.amount += level * support + unsupported * beside * (1 - drop);
      spilling[y] = unsupported * beside * drop;
      falling[y] = unsupported * (1 - beside);
      bodyAt[y] = body;
    }
    for (const b of bodies) b.surfaceY = b.base - b.amount * tile;
    const layout: ColumnLayout = { bodies, bodyAt, falling, spilling, moving, segments: [] };
    this.columns.set(x, layout);
    layout.segments = this.segmentsOf(x, layout);
    return layout;
  }

  /**
   * The falls in a column. A fall is a run of cells with fluid falling or spilling in them, read top to bottom. The
   * simulation hands a falling stream down in beats, so a single gap in the run (an empty or resting cell between two
   * falling ones) does not break it. It lands on the drawn surface of the fluid it falls into, or on the floor. Its
   * width comes from how much is falling over the whole run, never from one cell, so it is straight and steady.
   */
  private segmentsOf(x: number, col: ColumnLayout): StreamSegment[] {
    if (!this.solid) return [];
    const { field, tile } = this;
    const flow = (y: number) => col.falling[y] + col.spilling[y] + col.moving[y];
    // How much of a cell's falling fluid is on its way down from the cell above (drawn `fallOffset` higher)
    const movingShare = (y: number) => clamp01(col.moving[y] / Math.max(flow(y), 1e-9));
    const segments: StreamSegment[] = [];
    let y = 0;
    while (y < field.height) {
      if (flow(y) <= FLOW_EPS) {
        y++;
        continue;
      }
      const fluidId = field.getFluidId(x, y);
      const first = y;
      let last = y;
      // How much is falling, how many cells' worth of it is falling (each cell weighted by how much of it falls, so a
      // cell that is mostly resting in the pool it lands in barely counts), and where its weight is
      let total = 0;
      let falling = 0;
      let massY = 0;
      let spillSum = 0;
      let spillRowsFlow = 0;
      let besideLeft = 0;
      let besideRight = 0;
      const besideLevel = (nx: number, row: number) => (this.isSolid(nx, row) || field.getFluidId(nx, row) !== fluidId ? 0 : field.getLevel(nx, row));
      const take = (row: number) => {
        const f = flow(row);
        total += f;
        spillSum += col.spilling[row];
        if (col.spilling[row] > 0) {
          spillRowsFlow += f;
          besideLeft += besideLevel(x - 1, row) * col.spilling[row];
          besideRight += besideLevel(x + 1, row) * col.spilling[row];
        }
        falling += f / Math.max(f, Math.min(1, field.getLevel(x, row)));
        massY += f * (row + 0.5) * tile - col.moving[row] * this.fallOffset;
      };
      take(y);
      let rows = 1;
      let next = y + 1;
      while (next < field.height) {
        if (field.getFluidId(x, next) === fluidId && flow(next) > FLOW_EPS) {
          last = next;
          take(next);
          rows++;
          next++;
          continue;
        }
        // Bridge one beat: a gap that is not rock, with the fall carrying on under it...
        const gapId = field.getFluidId(x, next);
        const gapOpen = next + 1 < field.height && !this.isSolid(x, next);
        if (gapOpen && (gapId === 0 || gapId === fluidId) && field.getFluidId(x, next + 1) === fluidId && flow(next + 1) > FLOW_EPS) {
          last = next + 1;
          take(next + 1);
          rows += 2;
          next += 2;
          continue;
        }
        // ...or with the pool it is about to land in right under it (a drip reaches the surface on every beat, not every
        // other one). Only when nothing is falling under the gap, or two falls would be drawn over each other.
        const pool = col.bodyAt[next + 1];
        if (gapOpen && gapId === 0 && pool && pool.fluidId === fluidId && pool.amount > 0) {
          last = next;
          rows++;
          break;
        }
        break;
      }
      y = last + 1;

      // Where it lands: the surface of the pool it runs into (in this column), or the bottom of its last cell
      let bottom = (last + 1) * tile;
      const landing = col.bodyAt[last + 1] ?? col.bodyAt[last];
      const landsInPool = Boolean(landing && landing.fluidId === fluidId && landing.amount > 0 && landing.base >= bottom);
      if (landsInPool) bottom = landing!.surfaceY;
      const landsOnFloor = this.isSolid(x, last + 1);
      // A front still in the air is on its way down too
      if (!landsInPool && !landsOnFloor) bottom -= this.fallOffset * movingShare(last);

      // Where it starts: as a blob in its first cell, joined up to fluid above it, or (the more of it is spilling over
      // a lip) at the bottom of the lip cell, where the spill hands over to it. Blended, so it never jumps.
      // Fluid pouring over a lip into this fall, over all of it (which row the lip is in can change from step to step as
      // a thin film comes and goes above it; what is drawn should not)
      const spill = spillSum;
      // How much of the fluid in the rows where it spills is spilling (the rest of it falls on its own)
      const spillShare = clamp01(spill / Math.max(FLOW_EPS, spillRowsFlow));
      const fromLeft = besideLeft + besideRight > 0 ? besideLeft / (besideLeft + besideRight) : 0.5;
      const spillLeft = spill * fromLeft;
      const spillRight = spill * (1 - fromLeft);
      const fedFromAbove = first > 0 && field.getFluidId(x, first - 1) === fluidId;
      let startTop = fedFromAbove ? first * tile : first * tile + tile * (1 - clamp01(flow(first) / JOIN_ABOVE_LEVEL)) * 0.5;
      // Its head, if it fell into this cell, is still coming down from the cell above
      if (!fedFromAbove) startTop += (first * tile - this.fallOffset - startTop) * movingShare(first);
      // Fed over a lip, the jet starts where the spill hands over to it: the corner of the lip (the pool's floor there)
      const lipFloor = spill > 0 ? this.lipOf(x, first, fromLeft >= 0.5 ? -1 : 1, fluidId, spill).floor : startTop;
      const top = startTop + (lipFloor - startTop) * spillShare;
      if (bottom - top <= 0.5 && spill <= FLOW_EPS) continue;

      const strength = clamp01(total / STREAM_FULL_FLOW);
      const joinedAbove = fedFromAbove;
      // A short fall in mid-air, not fed from anything and not landing yet, is a falling blob (one poured cell, a drop):
      // drawn as one compact lump of its own size at its centre of weight. The client eases each cell's level from step
      // to step, which hands a falling blob from one cell to the next; drawn cell by cell (or as a jet over both cells)
      // it would stretch and shrink every step, while its centre of weight moves smoothly.
      const blob = rows <= BLOB_MAX_ROWS && !joinedAbove && !landsInPool && !landsOnFloor && spill <= FLOW_EPS;
      let width: number;
      let blobTop = top;
      let blobBottom = bottom;
      if (blob) {
        const side = Math.min(STREAM_MAX_WIDTH, Math.max(STREAM_MIN_WIDTH, Math.sqrt(total)));
        width = tile * side * strength;
        const height = (total / side) * tile;
        const centre = massY / Math.max(total, 1e-9);
        blobTop = centre - height / 2;
        blobBottom = centre + height / 2;
      } else {
        // A stream is as wide as the water falling through each cell of it
        const perCell = total / Math.max(falling, 1e-9);
        width = tile * Math.min(STREAM_MAX_WIDTH, Math.max(STREAM_MIN_WIDTH, STREAM_WIDTH_PER_LEVEL * perCell)) * strength;
      }
      if (width <= 0.01) continue;
      // It runs down the side it pours over from; otherwise down the wall it is beside; otherwise in the middle
      const wallL = this.isSolid(x - 1, first);
      const wallR = this.isSolid(x + 1, first);
      const wallBias = wallL && !wallR ? -1 : wallR && !wallL ? 1 : 0;
      const spillBias = 1 - 2 * fromLeft;
      const bias = wallBias + (spillBias - wallBias) * spillShare;
      const sx = x * tile + ((tile - width) / 2) * (1 + bias);
      segments.push({ fluidId, firstRow: first, top: blobTop, bottom: Math.max(blobTop, blobBottom), x: sx, width, spillLeft, spillRight });
    }
    return segments;
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
        // Two bodies are one connected surface when they overlap vertically (fluid sits beside fluid), however
        // different their heights: a heap slopes from column to column instead of ending in a riser at each cell
        // edge. A ledge over a lower pool does not overlap, so the two stay apart.
        const overlapTop = Math.max(body.surfaceY, other.surfaceY);
        const overlapBottom = Math.min(body.base, other.base);
        const overlap = overlapBottom - overlapTop;
        if (overlap <= 0) continue;
        // They only meet if the two columns are open to each other on some row of that shared stretch (a wall, or the
        // corner of a ledge, between them keeps them apart). Asking about the whole stretch, not one row picked from
        // the surface heights, keeps the answer from flipping as the surfaces move past a cell boundary.
        if (this.solid) {
          let open = false;
          for (let row = Math.floor(overlapTop / tile); row <= Math.floor((overlapBottom - 1e-6) / tile); row++) {
            if (!this.isSolid(x, row) && !this.isSolid(nx, row)) {
              open = true;
              break;
            }
          }
          if (!open) continue;
        }
        const k = clamp01(overlap / (JOIN_OVERLAP * tile)) * clamp01(Math.min(body.amount, other.amount) / JOIN_AMOUNT);
        if (k > best.k) best = { y: body.surfaceY + ((other.surfaceY - body.surfaceY) * k) / 2, k };
      }
      return best;
    };
    const l = side(x - 1);
    const r = side(x + 1);
    body.edges = { left: l.y, right: r.y, waveLeft: l.k, waveRight: r.k };
    return body.edges;
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
    const falling = this.shapesAt(cx, cy).find((shape) => shape.stream || shape.spill);
    return falling ? (falling.spill ? falling.topLeft : falling.top) : (cy + 0.5) * this.tile;
  }

  /** What to draw in one cell: the body's part of it, and a stream if fluid is falling through it. Empty for an empty cell. */
  public shapesAt(cx: number, cy: number): FluidShape[] {
    if (cx < 0 || cx >= this.field.width || cy < 0 || cy >= this.field.height) return [];
    const col = this.column(cx);
    const body = col.bodyAt[cy];
    const { tile } = this;
    const cellTop = cy * tile;
    const cellBottom = (cy + 1) * tile;
    const shapes: FluidShape[] = [];

    // An empty cell can still have a fall passing through it (a beat in the stream), drawn below
    if (body && body.amount > 0) {
      const edges = this.edgesOf(cx, body);
      if (Math.min(edges.left, edges.right, body.surfaceY) < cellBottom) {
        const surfaceRow = Math.min(body.bottomRow, Math.floor(body.surfaceY / tile));
        shapes.push({
          cx, cy, fluidId: body.fluidId, x: cx * tile, width: tile, top: cellTop, bottom: cellBottom,
          topLeft: edges.left, topRight: edges.right, topMid: body.surfaceY, surface: cy === surfaceRow,
          waveLeft: edges.waveLeft, waveRight: edges.waveRight,
          surfaceY: body.surfaceY, bodyBottom: body.base, depth: Math.max(0, (cellTop - body.surfaceY) / tile), stream: false,
        });
      }
    }

    for (const segment of col.segments) {
      // The jet's part of this cell
      const top = Math.max(cellTop, segment.top);
      const bottom = Math.min(cellBottom, segment.bottom);
      if (bottom - top > 0.01) {
        shapes.push({
          cx, cy, fluidId: segment.fluidId, x: segment.x, width: segment.width, top, bottom, topLeft: top, topRight: top, topMid: top, surface: false,
          waveLeft: 0, waveRight: 0, surfaceY: top, bodyBottom: bottom, depth: 0, stream: true,
        });
      }
      if (segment.firstRow === cy) {
        if (segment.spillLeft > FLOW_EPS) shapes.push(this.spillShape(cx, cy, segment, -1, segment.spillLeft));
        if (segment.spillRight > FLOW_EPS) shapes.push(this.spillShape(cx, cy, segment, 1, segment.spillRight));
      }
    }
    return shapes;
  }

  /**
   * The sheet of water bending over the lip of a drop: from the surface of the pool beside it, at the shared edge, round
   * in a curve to the outer side of the jet at the bottom of the lip cell; the inner side runs from the edge of the
   * pool's floor down to the jet. The more is spilling, the closer it starts to the pool's own surface; a last drop
   * thins away to nothing at the floor, so it never pops.
   */
  /**
   * The lip fluid pours over on one side of a fall: where the pool beside it has its surface at the shared edge, and its
   * floor there (the corner of the lip). Taken from the pool, not the row the fall starts in, so it stays put while a
   * thin film comes and goes in the cell above the lip. With no pool beside it: a sheet as thick as what is spilling.
   */
  private lipOf(cx: number, cy: number, side: -1 | 1, fluidId: number, amount: number): { edgeX: number; surface: number; floor: number; sheetTop: number } {
    const { tile } = this;
    const edgeX = side < 0 ? cx * tile : (cx + 1) * tile;
    const nx = cx + side;
    const neighbour = nx >= 0 && nx < this.field.width ? this.column(nx).bodyAt[cy] : null;
    let floor = (cy + 1) * tile;
    let surface = floor - Math.min(1, amount) * tile;
    if (neighbour && neighbour.fluidId === fluidId && neighbour.amount > 0) {
      const edges = this.edgesOf(nx, neighbour);
      floor = neighbour.base;
      surface = side < 0 ? edges.right : edges.left;
    }
    surface = Math.min(floor, surface);
    const sheetTop = floor - (floor - surface) * clamp01(amount / STREAM_FULL_FLOW);
    return { edgeX, surface, floor, sheetTop };
  }

  /**
   * The sheet of water bending over the lip of a drop: from the surface of the pool beside it, at the shared edge, round
   * in a curve over the lip and down to the outer side of the jet at the corner of the lip, where the jet takes over. The
   * more is spilling, the closer it starts to the pool's own surface and the further it arcs out; a last drop thins away
   * to nothing at the floor, so it never pops.
   */
  private spillShape(cx: number, cy: number, segment: StreamSegment, side: -1 | 1, amount: number): FluidShape {
    const { tile } = this;
    const { edgeX, floor, sheetTop } = this.lipOf(cx, cy, side, segment.fluidId, amount);
    // Outer side of the jet (away from the lip) and inner side (against it)
    const outerX = side < 0 ? segment.x + segment.width : segment.x;
    const innerX = side < 0 ? segment.x : segment.x + segment.width;
    const points: number[] = [];
    // Outer curve: leaves the pool level, arcs out over the lip (further the thicker the sheet, never past the cell)
    // and comes down straight onto the outer side of the jet
    const away = -side;
    const thickness = clamp01((floor - sheetTop) / (SPILL_FULL_ARC * tile)) * clamp01(amount / SPILL_FULL_FLOW);
    const arcX = outerX + away * Math.min(SPILL_ARC * tile * thickness, Math.max(0, away > 0 ? (cx + 1) * tile - outerX : outerX - cx * tile));
    for (let i = 0; i <= SPILL_CURVE_POINTS; i++) {
      const t = i / SPILL_CURVE_POINTS;
      points.push(cubic(edgeX, arcX, outerX, outerX, t), cubic(sheetTop, sheetTop, sheetTop + (floor - sheetTop) * 0.6, floor, t));
    }
    // Inner side: along the bottom of the jet back to the corner of the lip
    points.push(innerX, floor);
    if (Math.abs(innerX - edgeX) >= 0.5) points.push(edgeX, floor);
    return {
      cx, cy, fluidId: segment.fluidId, x: Math.min(edgeX, segment.x), width: Math.abs(outerX - edgeX), top: sheetTop, bottom: floor,
      topLeft: sheetTop, topRight: sheetTop, topMid: sheetTop, surface: false, waveLeft: 0, waveRight: 0, surfaceY: sheetTop, bodyBottom: floor,
      depth: 0, stream: false, spill: points, spillEdge: points.slice(0, (SPILL_CURVE_POINTS + 1) * 2),
    };
  }
}

/** A point on a cubic curve from a through controls b and c to d. */
function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
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
  if (shape.spill) return [{ points: shape.spill, depth: 0 }];
  const roomL = waveRoom(shape, tile, appearance, shape.topLeft, shape.waveLeft);
  const roomR = waveRoom(shape, tile, appearance, shape.topRight, shape.waveRight);
  const yL = shape.topLeft + roomL;
  const yR = shape.topRight + roomR;
  const yM = shape.topMid + (roomL + roomR) / 2;
  const x1 = shape.x + shape.width;
  const xM = shape.x + shape.width / 2;
  const cellTop = shape.cy * tile;
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
