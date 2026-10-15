import { GasRegistry, NO_GAS } from './GasRegistry';

/** A full cell. Unlike fluid, a gas cell never holds more than this. */
export const GAS_FULL_CONCENTRATION = 1;
/** Flows smaller than this are ignored, so a trickle cannot keep a cloud awake forever. */
export const GAS_MIN_FLOW = 0.001;
/** Gas only diffuses to a neighbour when the concentration difference is above this. */
export const GAS_DIFFUSION_THRESHOLD = 0.01;
/** Levels live in 32-bit floats, so a cell "at the minimum" may read back a hair under it; this much slack keeps it from being dropped. */
const GAS_LEVEL_EPSILON = 1e-5;
/** Seconds one simulation step stands for when the grid is not told (10 Hz). */
export const DEFAULT_GAS_STEP_SECONDS = 0.1;

/** One cell whose contents changed since the last `drainChanges`. gasId 0 means it is now empty. */
export interface GasCellChange {
  x: number;
  y: number;
  gasId: number;
  concentration: number;
}

export interface GasGridOptions {
  /** Seconds of game time one `step` stands for. Open-air gas fades over a gas's `ventLifetime` measured in these. */
  stepSeconds?: number;
  /** Whether a cell holds fluid. Fluid wins a cell: gas is never put in one and is pushed out of one. */
  hasFluid?: (x: number, y: number) => boolean;
}

/** How much a gas is pushed up (positive) or down (negative) by its density relative to air = 1, -1 to 1. */
export function gasBuoyancy(density: number): number {
  return Math.max(-1, Math.min(1, 1 - density));
}

/**
 * Cell-based gas simulation. Each cell holds one gas and a concentration (0 empty .. 1 full). A step
 * moves gas up (light gases) or down (heavy gases) by buoyancy, spreads it to neighbours by diffusion
 * (sideways always, vertically in proportion to how little buoyancy the gas has), lets a denser gas
 * sink through a lighter one, and fades gas that sits in open air. Only "active" cells (those that
 * just changed, and their neighbours) are processed, so a still cloud costs nothing.
 *
 * Open air: a cell is open to the sky when it and every cell above it up to row 0 are free of solid
 * terrain. Gas there keeps rising but dies away over its `ventLifetime`.
 *
 * Pure and deterministic: the same inputs always give the same result, and there is no clock or
 * randomness. Row 0 is the top; "up" is towards lower y.
 */
export class GasGrid {
  public readonly width: number;
  public readonly height: number;
  private readonly levels: Float32Array;
  private readonly ids: Uint8Array;
  private readonly sky: Uint8Array;
  private active = new Set<number>();
  private readonly changed = new Set<number>();
  private stepCount = 0;
  private readonly stepSeconds: number;

  /** Gas that disappeared because a cell was too thin to keep. For diagnostics and tests. */
  public droppedVolume = 0;
  /** Gas that faded away in open air. For diagnostics and tests. */
  public ventedVolume = 0;
  /** Gas that was squeezed out of the world (a tile closed on it, or fluid filled its cell and nothing had room). */
  public lostVolume = 0;
  /** Gas taken out on purpose with `drainGas` (burnt, for example). */
  public drainedVolume = 0;

  private readonly registry: GasRegistry;
  private readonly isBlocked: (x: number, y: number) => boolean;
  private readonly hasFluid: (x: number, y: number) => boolean;

  /** `isBlocked` says whether a cell cannot hold gas (solid terrain). Out-of-bounds is always blocked. */
  constructor(width: number, height: number, registry: GasRegistry, isBlocked: (x: number, y: number) => boolean, options: GasGridOptions = {}) {
    this.width = width;
    this.height = height;
    this.registry = registry;
    this.isBlocked = isBlocked;
    this.hasFluid = options.hasFluid ?? (() => false);
    this.stepSeconds = options.stepSeconds ?? DEFAULT_GAS_STEP_SECONDS;
    this.levels = new Float32Array(width * height);
    this.ids = new Uint8Array(width * height);
    this.sky = new Uint8Array(width * height);
    this.refreshSky();
  }

  public inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private blocked(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.isBlocked(x, y);
  }

  /** Whether gas cannot be in a cell right now: solid terrain or fluid. */
  private unavailable(x: number, y: number): boolean {
    return this.blocked(x, y) || this.hasFluid(x, y);
  }

  public getGasId(x: number, y: number): number {
    return this.inBounds(x, y) && this.levels[y * this.width + x] > 0 ? this.ids[y * this.width + x] : NO_GAS;
  }

  public getConcentration(x: number, y: number): number {
    return this.inBounds(x, y) ? this.levels[y * this.width + x] : 0;
  }

  /** Cells currently awake. A settled grid has none. */
  public get activeCount(): number {
    return this.active.size;
  }

  /** Total gas in the grid, optionally for one gas id only. */
  public totalVolume(gasId?: number): number {
    let total = 0;
    for (let i = 0; i < this.levels.length; i++) {
      if (this.levels[i] > 0 && (gasId === undefined || this.ids[i] === gasId)) total += this.levels[i];
    }
    return total;
  }

  // ---------------------------------------------------------------------------------------------
  // Open air
  // ---------------------------------------------------------------------------------------------

  /** Whether a cell is open to the sky: it and every cell above it are free of solid terrain. */
  public isOpenToSky(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.sky[y * this.width + x] === 1;
  }

  /** Recomputes which cells are open to the sky for one column. */
  private refreshSkyColumn(x: number): void {
    let open = true;
    for (let y = 0; y < this.height; y++) {
      if (open && this.isBlocked(x, y)) open = false;
      this.sky[y * this.width + x] = open ? 1 : 0;
    }
  }

  /** Recomputes which cells are open to the sky everywhere (after the terrain was changed in bulk). */
  public refreshSky(): void {
    for (let x = 0; x < this.width; x++) this.refreshSkyColumn(x);
    // Gas in cells that just became open air must start fading
    for (let i = 0; i < this.levels.length; i++) {
      if (this.levels[i] > 0 && this.sky[i] === 1) this.active.add(i);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Contents
  // ---------------------------------------------------------------------------------------------

  /** Wakes a cell and its four neighbours. */
  public wake(x: number, y: number): void {
    this.wakeIndex(y * this.width + x, x, y);
  }

  private wakeIndex(index: number, x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    this.active.add(index);
    if (x > 0) this.active.add(index - 1);
    if (x < this.width - 1) this.active.add(index + 1);
    if (y > 0) this.active.add(index - this.width);
    if (y < this.height - 1) this.active.add(index + this.width);
  }

  /** Sets a cell's contents outright (concentration 0 empties it; above 1 is capped). Refused (false) for blocked or fluid cells and unknown gases. */
  public setCell(x: number, y: number, gasId: number, concentration: number): boolean {
    if (this.unavailable(x, y)) return false;
    if (concentration > 0 && !this.registry.paramsOf(gasId)) return false;
    const i = y * this.width + x;
    const level = concentration > 0 ? Math.min(GAS_FULL_CONCENTRATION, concentration) : 0;
    this.levels[i] = level;
    this.ids[i] = level > 0 ? gasId : NO_GAS;
    this.changed.add(i);
    this.wakeIndex(i, x, y);
    return true;
  }

  /**
   * Adds gas to a cell that is empty or holds the same gas, up to a full cell. Returns how much was
   * actually added (0 when the cell is blocked, holds fluid or another gas, is full, or the gas is unknown).
   */
  public addGas(x: number, y: number, gasId: number, amount: number): number {
    if (this.unavailable(x, y) || !(amount > 0) || !this.registry.paramsOf(gasId)) return 0;
    const i = y * this.width + x;
    if (this.levels[i] > 0 && this.ids[i] !== gasId) return 0;
    const accepted = Math.min(amount, GAS_FULL_CONCENTRATION - this.levels[i]);
    if (accepted <= 0) return 0;
    this.setCell(x, y, gasId, this.levels[i] + accepted);
    return accepted;
  }

  /** Takes up to `amount` out of a cell; returns how much was taken. Neighbours wake so gas can move into the gap. */
  public drainGas(x: number, y: number, amount: number): number {
    if (!this.inBounds(x, y) || !(amount > 0)) return 0;
    const i = y * this.width + x;
    if (this.levels[i] <= 0) return 0;
    const taken = Math.min(amount, this.levels[i]);
    this.levels[i] -= taken;
    if (this.levels[i] <= 1e-6) {
      this.levels[i] = 0;
      this.ids[i] = NO_GAS;
    }
    this.drainedVolume += taken;
    this.changed.add(i);
    this.wakeIndex(i, x, y);
    return taken;
  }

  /**
   * Pushes the gas out of a cell that can no longer hold it into free room next to it (up, sideways,
   * then down). Whatever does not fit is lost.
   */
  private displace(i: number): void {
    const x = i % this.width;
    const y = Math.floor(i / this.width);
    const gasId = this.ids[i];
    let remaining = this.levels[i];
    this.levels[i] = 0;
    this.ids[i] = NO_GAS;
    this.changed.add(i);
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      if (remaining <= 0) break;
      const nx = x + dx;
      const ny = y + dy;
      if (this.unavailable(nx, ny)) continue;
      const ni = ny * this.width + nx;
      if (this.levels[ni] > 0 && this.ids[ni] !== gasId) continue;
      const room = GAS_FULL_CONCENTRATION - this.levels[ni];
      if (room <= 0) continue;
      const moved = Math.min(room, remaining);
      this.levels[ni] += moved;
      this.ids[ni] = gasId;
      this.changed.add(ni);
      remaining -= moved;
    }
    this.lostVolume += remaining;
    this.wakeIndex(i, x, y);
  }

  /**
   * Tells the grid a tile changed. Gas in a cell that became solid is pushed into free room next to
   * it and any left over is lost; open-air cells are worked out again for the column; neighbours
   * wake, so gas next to a freshly opened cell starts to move (or a sealed pocket starts to leak out).
   */
  public onTileChanged(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    this.refreshSkyColumn(x);
    const i = y * this.width + x;
    if (this.blocked(x, y) && this.levels[i] > 0) this.displace(i);
    this.wakeIndex(i, x, y);
    // The cells below in this column may have gained or lost open sky; their gas must start or stop fading
    for (let yy = y; yy < this.height; yy++) {
      const ci = yy * this.width + x;
      if (this.levels[ci] > 0) this.active.add(ci);
    }
  }

  /** Pushes gas out of every cell that now holds fluid. Call after the fluid has moved. Returns how many cells were cleared. */
  public evictFromFluid(): number {
    let cleared = 0;
    for (let i = 0; i < this.levels.length; i++) {
      if (this.levels[i] <= 0) continue;
      if (this.hasFluid(i % this.width, Math.floor(i / this.width))) {
        this.displace(i);
        cleared++;
      }
    }
    return cleared;
  }

  /** Cells that changed since the last call (their current contents), then forgets them. */
  public drainChanges(): GasCellChange[] {
    const out: GasCellChange[] = [];
    for (const i of this.changed) {
      const concentration = this.levels[i];
      out.push({ x: i % this.width, y: Math.floor(i / this.width), gasId: concentration > 0 ? this.ids[i] : NO_GAS, concentration });
    }
    this.changed.clear();
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------------------------

  /** Runs one simulation step. Returns how many cells changed. */
  public step(): number {
    this.stepCount++;
    if (this.active.size === 0) return 0;
    const w = this.width;
    const h = this.height;
    const leftFirst = this.stepCount % 2 === 0;
    const x = (i: number) => i % w;
    const y = (i: number) => Math.floor(i / w);

    // Cells holding gas, in an order that lets a whole stack shift in one step: rising gas top row first,
    // sinking gas bottom row first. Left-to-right order alternates each step so nothing leans one way.
    const buoyancyOf = (i: number): number => {
      const params = this.registry.paramsOf(this.ids[i]);
      return params ? gasBuoyancy(params.density) : 0;
    };
    const rising: number[] = [];
    const sinking: number[] = [];
    const neutral: number[] = [];
    for (const i of this.active) {
      if (this.levels[i] <= 0) continue;
      const b = buoyancyOf(i);
      (b > 0 ? rising : b < 0 ? sinking : neutral).push(i);
    }
    const byColumn = (a: number, b: number) => (leftFirst ? x(a) - x(b) : x(b) - x(a));
    rising.sort((a, b) => y(a) - y(b) || byColumn(a, b));
    sinking.sort((a, b) => y(b) - y(a) || byColumn(a, b));
    neutral.sort((a, b) => y(a) - y(b) || byColumn(a, b));
    const order = [...rising, ...sinking, ...neutral];

    // A denser gas sinks through a lighter one: swap the two cells before anything flows.
    const swapped = new Set<number>();
    for (const i of order) {
      const below = i + w;
      if (swapped.has(i) || below >= this.levels.length) continue;
      if (this.levels[i] <= 0 || this.levels[below] <= 0 || this.ids[i] === this.ids[below]) continue;
      if (swapped.has(below) || this.unavailable(x(i), y(i)) || this.unavailable(x(below), y(below))) continue;
      const top = this.registry.paramsOf(this.ids[i]);
      const bottom = this.registry.paramsOf(this.ids[below]);
      if (!top || !bottom || top.density <= bottom.density) continue;
      [this.ids[i], this.ids[below]] = [this.ids[below], this.ids[i]];
      [this.levels[i], this.levels[below]] = [this.levels[below], this.levels[i]];
      swapped.add(i);
      swapped.add(below);
      this.changed.add(i);
      this.changed.add(below);
    }

    const delta = new Map<number, number>();
    const claim = new Map<number, number>();
    const add = (i: number, amount: number) => delta.set(i, (delta.get(i) ?? 0) + amount);
    /** What a cell will hold once the flows decided so far are applied. */
    const projected = (i: number) => this.levels[i] + (delta.get(i) ?? 0);

    for (const i of order) {
      const gasId = this.ids[i];
      const level = this.levels[i];
      if (swapped.has(i) || level <= 0) continue;
      const params = this.registry.paramsOf(gasId);
      if (!params) continue;
      const cx = x(i);
      const cy = y(i);
      const b = gasBuoyancy(params.density);
      let remaining = level;

      // Whether this gas may flow into a neighbour: free terrain, no fluid, and empty or already this gas.
      const canEnter = (nx: number, ny: number): boolean => {
        if (this.unavailable(nx, ny)) return false;
        const ni = ny * w + nx;
        if (this.levels[ni] > 0) return this.ids[ni] === gasId;
        const claimed = claim.get(ni);
        return claimed === undefined || claimed === gasId;
      };
      const send = (ni: number, amount: number) => {
        add(i, -amount);
        add(ni, amount);
        if (this.levels[ni] <= 0) claim.set(ni, gasId);
        remaining -= amount;
      };

      // Never hand a neighbour less than the minimum: it would be dropped on arrival and a spreading cloud
      // would leak away at its edge. Give it the minimum instead, if the donor can spare it; otherwise hold back.
      // `keepAhead` also requires the donor to stay at least as full as the receiver (diffusion only).
      const arrival = (flow: number, ni: number, keepAhead: boolean): number => {
        const receiver = projected(ni);
        if (receiver + flow >= params.minConcentration) return flow;
        const topUp = params.minConcentration - receiver;
        if (topUp > remaining || topUp > GAS_FULL_CONCENTRATION - receiver) return 0;
        if (keepAhead && remaining - topUp < receiver + topUp) return 0;
        return topUp;
      };

      // A donor must not be left holding a trace below the minimum (it would be dropped): it keeps the minimum,
      // or, when everything fits next door and is itself at least the minimum, hands over the lot.
      const withoutResidue = (flow: number, ni: number): number => {
        if (flow <= 0) return 0;
        const residue = remaining - flow;
        if (residue <= 1e-9 || residue >= params.minConcentration) return flow;
        const fitsAll = remaining <= GAS_FULL_CONCENTRATION - projected(ni) + 1e-9;
        if (fitsAll && remaining >= params.minConcentration) return remaining;
        return Math.max(0, remaining - params.minConcentration);
      };

      // Vertical neighbours are handled as one net flow per pair, so buoyancy and diffusion cannot fight
      // each other forever. Towards the side the gas prefers (up for a light gas, down for a heavy one) the
      // pull is `alpha`; back against it only diffusion pushes, `beta`. A pair is still when alpha * (what is
      // on the preferred side's source) matches beta * (what is on the other), so a light gas packs against the
      // ceiling and a slightly heavy one settles in layers, thicker lower down.
      const share = (params.diffusionRate / 4) * (1 - Math.abs(b));
      const alpha = Math.abs(b) + share;
      const beta = share;
      const preferred = b > 0 ? -1 : 1;
      const vertical: Array<[number, number]> = b === 0 ? [[-1, share], [1, share]] : [[preferred, alpha], [-preferred, beta]];
      for (const [dy, pull] of vertical) {
        if (remaining <= 0 || !canEnter(cx, cy + dy)) continue;
        const ni = (cy + dy) * w + cx;
        // What the neighbour pushes back with: the opposite pair's coefficient
        const push = b === 0 ? share : dy === preferred ? beta : alpha;
        const room = GAS_FULL_CONCENTRATION - projected(ni);
        const net = pull * level - push * projected(ni);
        if (net <= GAS_MIN_FLOW) continue;
        const flow = withoutResidue(arrival(Math.min(net, remaining, room), ni, false), ni);
        if (flow > GAS_MIN_FLOW) send(ni, Math.min(flow, remaining));
      }

      // Sideways: diffusion towards neighbours that hold less
      const sides = leftFirst ? [-1, 1] : [1, -1];
      for (const dx of sides) {
        if (remaining <= 0 || !canEnter(cx + dx, cy)) continue;
        const ni = cy * w + (cx + dx);
        const diff = level - projected(ni);
        if (diff <= GAS_DIFFUSION_THRESHOLD) continue;
        const room = GAS_FULL_CONCENTRATION - projected(ni);
        const flow = withoutResidue(arrival(Math.min((diff / 4) * params.diffusionRate, remaining, room), ni, true), ni);
        if (flow > GAS_MIN_FLOW) send(ni, Math.min(flow, remaining));
      }
    }

    // Apply the flows and wake what moved.
    const nextActive = new Set<number>();
    const touched = new Set<number>(order);
    let changedCount = 0;
    for (const [i, change] of delta) {
      touched.add(i);
      if (this.levels[i] <= 0) {
        const claimed = claim.get(i);
        if (claimed !== undefined) this.ids[i] = claimed;
      }
      this.levels[i] = Math.max(0, this.levels[i] + change);
      if (Math.abs(change) > 0) {
        changedCount++;
        this.changed.add(i);
        nextActive.add(i);
        if (x(i) > 0) nextActive.add(i - 1);
        if (x(i) < w - 1) nextActive.add(i + 1);
        if (y(i) > 0) nextActive.add(i - w);
        if (y(i) < h - 1) nextActive.add(i + w);
      }
    }

    // Gas in open air fades over its vent lifetime; gas too thin to keep is dropped.
    for (const i of touched) {
      if (this.levels[i] <= 0) continue;
      const params = this.registry.paramsOf(this.ids[i]);
      if (!params) continue;
      if (this.sky[i] === 1) {
        // Proportional decay, tuned so a full cell takes exactly `ventLifetime` seconds to fall to the minimum
        // (a cloud thins at the same pace however many cells it covers)
        const keep = Math.exp((-this.stepSeconds * Math.log(1 / Math.max(params.minConcentration, 1e-3))) / params.ventLifetime);
        const fade = this.levels[i] * (1 - keep);
        this.levels[i] -= fade;
        this.ventedVolume += fade;
        this.changed.add(i);
        changedCount++;
        // Open-air gas stays awake until it has gone (a cell that thins to the minimum is dropped just below)
        if (this.levels[i] > 0) nextActive.add(i);
      }
      if (this.levels[i] > 0 && this.levels[i] < params.minConcentration - GAS_LEVEL_EPSILON) {
        if (this.sky[i] === 1) this.ventedVolume += this.levels[i];
        else this.droppedVolume += this.levels[i];
        this.levels[i] = 0;
        this.changed.add(i);
        changedCount++;
      }
      if (this.levels[i] <= 1e-6) {
        this.levels[i] = 0;
        this.ids[i] = NO_GAS;
      }
    }
    for (const i of swapped) {
      nextActive.add(i);
      if (i >= w) nextActive.add(i - w);
      if (i + w < this.levels.length) nextActive.add(i + w);
    }
    this.active = nextActive;
    return changedCount;
  }
}
