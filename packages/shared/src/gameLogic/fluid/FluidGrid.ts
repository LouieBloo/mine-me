import { FluidRegistry, NO_FLUID } from './FluidRegistry';

/** Units in a full cell. Fluid is stored as whole units, so a pool is exactly level or one unit off and then stops. */
export const FLUID_UNITS = 16;
/** A full cell, as the fraction every reader of levels uses. */
export const FLUID_FULL_LEVEL = 1;
/** Sideways spreading only happens when two neighbours differ by at least this many units. */
export const FLUID_SPREAD_MIN_DIFF = 2;
/** A lone 1-unit film that nothing deeper holds up evaporates after this many steps (10 s at 10 steps a second). */
export const FLUID_FILM_EVAPORATE_STEPS = 100;
/** The longest a slow fluid is held back between two units of spreading, in steps. */
const MAX_SPREAD_PERIOD = 40;

/** One cell whose contents changed since the last `drainChanges`. fluidId 0 means it is now empty. */
export interface FluidCellChange {
  x: number;
  y: number;
  fluidId: number;
  level: number;
  /** The cell's level while its fluid is falling (the cell below can take more of it), else 0. */
  falling: number;
}

/** A cell of fluid that has just been used up by a reaction and must now become a block. */
export interface FluidReactionResult {
  x: number;
  y: number;
  /** typeKey of the block the cell becomes. */
  becomes: string;
}

/** A reaction with its fluids as the small ids the grid stores. */
interface ReactionRule {
  withId: number;
  becomes: string;
  costPerLevel: number;
  ratePerStep: number;
}

/** Levels of the reacting fluid one cell hardens per step when a reaction does not say (a full cell takes 4 steps). */
export const DEFAULT_REACTION_RATE_PER_STEP = 0.25;

const clampUnit = (v: number) => Math.min(1, Math.max(0, v));

/** Fractions of a cell to whole units (never more than a cell). */
const toUnits = (level: number) => Math.min(FLUID_UNITS, Math.max(0, Math.round(level * FLUID_UNITS)));

/**
 * Cell-based fluid simulation. Each cell holds one fluid and a whole number of units (0 empty .. `FLUID_UNITS` full).
 * A step moves fluid down first, everything that fits at once, then spreads what rests sideways towards lower
 * neighbours. Only "active" cells (those that just changed, and their neighbours) are processed, so a still pool costs
 * nothing.
 *
 * A cell is *falling* while the cell below it can take more fluid (or is itself falling): a fact of the grid that holds
 * for as long as the fall does, so a steady waterfall is falling on every step.
 *
 * Pure and deterministic: the same inputs always give the same result, and there is no clock or
 * randomness. Row 0 is the top; gravity pulls towards higher y. Everything public speaks in fractions of a cell
 * (0 empty .. 1 full); whole units are an internal detail (and `getUnits`).
 */
export class FluidGrid {
  public readonly width: number;
  public readonly height: number;
  private readonly units: Uint8Array;
  private readonly ids: Uint8Array;
  /** 1 while the cell's fluid is falling (see the class comment). */
  private readonly fallingFlags: Uint8Array;
  /** Fire burns fluid away in fractions of a unit: what has been asked for but not yet taken, per cell. */
  private readonly drainDebt: Float32Array;
  /** Reactions harden lava in fractions of a unit too: progress towards the next whole unit, per cell. */
  private readonly reactionCarry: Float32Array;
  /** Cells holding a lone film of fluid, and how many steps each has been one (see `FLUID_FILM_EVAPORATE_STEPS`). */
  private readonly films = new Map<number, number>();
  private active = new Set<number>();
  /** Cells that still have spreading to do but were held back this step (slow fluids): kept awake. */
  private waiting = new Set<number>();
  private readonly changed = new Set<number>();
  private stepCount = 0;
  /** Fluid that disappeared (a thin film, or squeezed out of the world), in cells of fluid. For diagnostics and tests. */
  public evaporatedVolume = 0;
  /** Fluid taken out on purpose with `drainFluid` (burnt away, for example). For diagnostics and tests. */
  public drainedVolume = 0;

  private readonly registry: FluidRegistry;
  private readonly isBlocked: (x: number, y: number) => boolean;
  /** Reactions by the id of the fluid that holds them (e.g. lava's: touched by water, becomes lavarock). */
  private readonly reactionRules = new Map<number, ReactionRule[]>();
  private pendingReactions: FluidReactionResult[] = [];
  /** Cells whose reaction is under way, kept awake so it carries on over the next steps. */
  private readonly reacting = new Set<number>();

  /** `isBlocked` says whether a cell cannot hold fluid (solid terrain). Out-of-bounds is always blocked. */
  constructor(width: number, height: number, registry: FluidRegistry, isBlocked: (x: number, y: number) => boolean) {
    this.width = width;
    this.height = height;
    this.registry = registry;
    this.isBlocked = isBlocked;
    this.units = new Uint8Array(width * height);
    this.ids = new Uint8Array(width * height);
    this.fallingFlags = new Uint8Array(width * height);
    this.drainDebt = new Float32Array(width * height);
    this.reactionCarry = new Float32Array(width * height);
    for (let id = 1; id <= registry.size; id++) {
      const reactions = registry.paramsOf(id)?.reactions;
      if (!reactions) continue;
      const rules: ReactionRule[] = [];
      for (const r of reactions) {
        const withId = registry.idOf(r.with);
        if (withId !== undefined && r.costPerLevel > 0) {
          rules.push({ withId, becomes: r.becomes, costPerLevel: r.costPerLevel, ratePerStep: r.ratePerStep && r.ratePerStep > 0 ? r.ratePerStep : DEFAULT_REACTION_RATE_PER_STEP });
        }
      }
      if (rules.length > 0) this.reactionRules.set(id, rules);
    }
  }

  /** Cells that reacted since the last call, then forgets them. The caller turns each into its block. */
  public takeReactions(): FluidReactionResult[] {
    const out = this.pendingReactions;
    this.pendingReactions = [];
    return out;
  }

  /**
   * Fluids that react (lava next to water) use each other up: for every level of the reacting fluid hardened,
   * `costPerLevel` levels of the other are spent, and a cell hardens at most `ratePerStep` per step. It runs at the
   * START of a step, on the fluid as the last step left it (which is what clients were last shown), so water is seen
   * to reach the lava, and sits against it while it cools, before anything is used up.
   * Whole units only: the other fluid is spent unit by unit and the reacting fluid is reduced as that adds up to whole
   * units (`reactionCarry`), so a cost of 2 water per lava hardens one lava unit for every two water units.
   * When the reacting fluid in a cell is used up the cell is emptied and reported through `takeReactions` so it can
   * become a block. When the other fluid runs out first, the reacting fluid is only reduced, so a trickle slowly eats a pool.
   */
  private react(cells: Iterable<number>): void {
    if (this.reactionRules.size === 0) return;
    const w = this.width;
    for (const i of cells) {
      if (this.units[i] <= 0) continue;
      const rules = this.reactionRules.get(this.ids[i]);
      if (!rules) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      for (const rule of rules) {
        const perStep = Math.max(1, Math.round(rule.ratePerStep * FLUID_UNITS));
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const ni = ny * w + nx;
          const other = this.units[ni];
          if (other <= 0 || this.ids[ni] !== rule.withId || this.units[i] <= 0) continue;
          const wanted = Math.min(perStep, this.units[i]);
          const waterNeeded = Math.max(1, Math.ceil((wanted - this.reactionCarry[i]) * rule.costPerLevel - 1e-9));
          const spent = Math.min(other, waterNeeded);
          this.reactionCarry[i] += spent / rule.costPerLevel;
          const hardened = Math.min(this.units[i], Math.floor(this.reactionCarry[i] + 1e-9));
          this.reactionCarry[i] -= hardened;
          this.setUnits(i, this.units[i] - hardened);
          this.setUnits(ni, other - spent);
          this.changed.add(ni);
          this.changed.add(i);
          this.reacting.add(ni);
          this.reacting.add(i);
          this.wakeIndex(ni, nx, ny);
          if (this.units[i] <= 0) {
            this.pendingReactions.push({ x, y, becomes: rule.becomes });
            this.wakeIndex(i, x, y);
            break;
          }
        }
        if (this.units[i] <= 0) break;
      }
    }
  }

  /** Sets a cell's units, clearing everything tied to the fluid when the cell is emptied. */
  private setUnits(i: number, units: number): void {
    this.units[i] = units;
    if (units <= 0) {
      this.ids[i] = NO_FLUID;
      this.drainDebt[i] = 0;
      this.reactionCarry[i] = 0;
    }
  }

  public inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private blocked(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.isBlocked(x, y);
  }

  public getFluidId(x: number, y: number): number {
    return this.inBounds(x, y) && this.units[y * this.width + x] > 0 ? this.ids[y * this.width + x] : NO_FLUID;
  }

  /** How full a cell is, 0 (empty) to 1 (full). */
  public getLevel(x: number, y: number): number {
    return this.inBounds(x, y) ? this.units[y * this.width + x] / FLUID_UNITS : 0;
  }

  /** The cell's whole units, 0 to `FLUID_UNITS`. */
  public getUnits(x: number, y: number): number {
    return this.inBounds(x, y) ? this.units[y * this.width + x] : 0;
  }

  /** Calls `visit` for every cell currently holding this fluid. */
  public forEachCellOf(fluidId: number, visit: (x: number, y: number, level: number) => void): void {
    for (let i = 0; i < this.units.length; i++) {
      if (this.units[i] > 0 && this.ids[i] === fluidId) visit(i % this.width, Math.floor(i / this.width), this.units[i] / FLUID_UNITS);
    }
  }

  /** Cells currently awake. A settled grid has none (a lone film waiting to evaporate is not awake: see `filmCount`). */
  public get activeCount(): number {
    return this.active.size;
  }

  /** Lone films of fluid that are still waiting to evaporate (see `FLUID_FILM_EVAPORATE_STEPS`). */
  public get filmCount(): number {
    return this.films.size;
  }

  /** Total fluid in the grid, in cells of fluid, optionally for one fluid id only. */
  public totalVolume(fluidId?: number): number {
    let total = 0;
    for (let i = 0; i < this.units.length; i++) {
      if (this.units[i] > 0 && (fluidId === undefined || this.ids[i] === fluidId)) total += this.units[i];
    }
    return total / FLUID_UNITS;
  }

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

  /** Sets a cell's contents outright (level 0 empties it). Refused (false) for blocked cells or unknown fluids. */
  public setCell(x: number, y: number, fluidId: number, level: number): boolean {
    if (this.blocked(x, y)) return false;
    if (level > 0 && !this.registry.paramsOf(fluidId)) return false;
    const i = y * this.width + x;
    const units = toUnits(level);
    this.units[i] = units;
    this.ids[i] = units > 0 ? fluidId : NO_FLUID;
    this.drainDebt[i] = 0;
    this.reactionCarry[i] = 0;
    this.changed.add(i);
    this.wakeIndex(i, x, y);
    this.refreshFalling(i);
    return true;
  }

  /** Works out `falling` for a cell something outside the step changed, and the cell above it. */
  private refreshFalling(i: number): void {
    this.updateFalling(new Set(i >= this.width ? [i, i - this.width] : [i]));
  }

  /**
   * Adds fluid to a cell that is empty or holds the same fluid, up to a full cell. Returns false if it could not
   * (a blocked cell, another fluid, nothing to add, or no room).
   */
  public addFluid(x: number, y: number, fluidId: number, amount: number): boolean {
    if (this.blocked(x, y) || !(amount > 0) || !this.registry.paramsOf(fluidId)) return false;
    const i = y * this.width + x;
    if (this.units[i] > 0 && this.ids[i] !== fluidId) return false;
    const add = Math.min(toUnits(amount), FLUID_UNITS - this.units[i]);
    if (add <= 0) return false;
    this.ids[i] = fluidId;
    this.units[i] += add;
    this.changed.add(i);
    this.wakeIndex(i, x, y);
    this.refreshFalling(i);
    return true;
  }

  /**
   * Takes up to `amount` (a fraction of a cell) out of a cell; returns how much was taken. Neighbours wake so they can
   * flow into the gap. Amounts smaller than a unit (fire burns fluid in tiny pieces) add up per cell until a whole unit
   * is due.
   */
  public drainFluid(x: number, y: number, amount: number): number {
    if (!this.inBounds(x, y) || !(amount > 0)) return 0;
    const i = y * this.width + x;
    if (this.units[i] <= 0) return 0;
    const taken = Math.min(amount, this.units[i] / FLUID_UNITS);
    this.drainDebt[i] += taken * FLUID_UNITS;
    const due = Math.min(this.units[i], Math.floor(this.drainDebt[i] + 1e-6));
    if (due <= 0) return taken;
    this.drainDebt[i] -= due;
    this.setUnits(i, this.units[i] - due);
    this.drainedVolume += due / FLUID_UNITS;
    this.changed.add(i);
    this.wakeIndex(i, x, y);
    this.refreshFalling(i);
    return taken;
  }

  /**
   * Tells the grid a tile changed. Fluid in a cell that became blocked is pushed into free room
   * next to it (up, sideways, then down) and any left over is lost. Neighbours wake, so fluid next
   * to a freshly opened cell starts to flow.
   */
  public onTileChanged(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    if (this.blocked(x, y) && this.units[i] > 0) {
      const fluidId = this.ids[i];
      let remaining = this.units[i];
      this.setUnits(i, 0);
      this.changed.add(i);
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        if (remaining <= 0) break;
        const nx = x + dx;
        const ny = y + dy;
        if (this.blocked(nx, ny)) continue;
        const ni = ny * this.width + nx;
        if (this.units[ni] > 0 && this.ids[ni] !== fluidId) continue;
        const room = FLUID_UNITS - this.units[ni];
        if (room <= 0) continue;
        const moved = Math.min(room, remaining);
        this.units[ni] += moved;
        this.ids[ni] = fluidId;
        this.changed.add(ni);
        remaining -= moved;
      }
      this.evaporatedVolume += remaining / FLUID_UNITS;
    }
    this.wakeIndex(i, x, y);
    this.refreshFalling(i);
  }

  /** Whether a cell's fluid is falling: the cell below can take more of it, or its fluid is falling too. */
  public isFalling(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.units[y * this.width + x] > 0 && this.fallingFlags[y * this.width + x] === 1;
  }

  /** The cell's level while its fluid is falling, 0 when it is not (the clients are told the same). */
  public getFalling(x: number, y: number): number {
    return this.isFalling(x, y) ? this.units[y * this.width + x] / FLUID_UNITS : 0;
  }

  /** Cells that changed since the last call (their current contents), then forgets them. */
  public drainChanges(): FluidCellChange[] {
    const out: FluidCellChange[] = [];
    for (const i of this.changed) {
      const units = this.units[i];
      out.push({
        x: i % this.width, y: Math.floor(i / this.width), fluidId: units > 0 ? this.ids[i] : NO_FLUID, level: units / FLUID_UNITS,
        falling: units > 0 && this.fallingFlags[i] === 1 ? units / FLUID_UNITS : 0,
      });
    }
    this.changed.clear();
    return out;
  }

  /** Whether this fluid in `ni` can take fluid from cell `i` (free terrain that is empty or already this fluid). */
  private canEnter(fluidId: number, nx: number, ny: number, claim: Map<number, number>): boolean {
    if (this.blocked(nx, ny)) return false;
    const ni = ny * this.width + nx;
    if (this.units[ni] > 0) return this.ids[ni] === fluidId;
    const claimed = claim.get(ni);
    return claimed === undefined || claimed === fluidId;
  }

  /** Whether a lone film at `i` is held up by nothing: it is one unit and no neighbour of its fluid (left, right, below) holds more than one. */
  private isFilm(i: number): boolean {
    if (this.units[i] !== 1 || this.fallingFlags[i] === 1) return false;
    const id = this.ids[i];
    const w = this.width;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = ny * w + nx;
      if (this.ids[ni] === id && this.units[ni] >= 2) return false;
    }
    return true;
  }

  /** Runs one simulation step. Returns how many cells changed. */
  public step(): number {
    this.stepCount++;
    // Fluids that react do so where they touched at the end of the last step
    this.react([...this.active]);
    if (this.active.size === 0 && this.waiting.size === 0 && this.films.size === 0) return 0;
    const w = this.width;
    const leftFirst = this.stepCount % 2 === 0;
    const cells = new Set([...this.active, ...this.waiting]);
    this.waiting = new Set();

    // Bottom rows first; left-to-right order alternates each step so nothing leans one way.
    const order = [...cells].sort((a, b) => {
      const ay = Math.floor(a / w);
      const by = Math.floor(b / w);
      if (ay !== by) return by - ay;
      return leftFirst ? (a % w) - (b % w) : (b % w) - (a % w);
    });

    // Denser fluid sinks through lighter fluid: swap the two cells before anything flows.
    const swapped = new Set<number>();
    for (const i of order) {
      const below = i + w;
      if (swapped.has(i) || below >= this.units.length) continue;
      if (this.units[i] <= 0 || this.units[below] <= 0 || this.ids[i] === this.ids[below]) continue;
      if (this.blocked(i % w, Math.floor(i / w)) || this.blocked(below % w, Math.floor(below / w))) continue;
      const top = this.registry.paramsOf(this.ids[i]);
      const bottom = this.registry.paramsOf(this.ids[below]);
      if (!top || !bottom || top.density <= bottom.density) continue;
      [this.ids[i], this.ids[below]] = [this.ids[below], this.ids[i]];
      [this.units[i], this.units[below]] = [this.units[below], this.units[i]];
      swapped.add(i);
      swapped.add(below);
      this.changed.add(i);
      this.changed.add(below);
    }

    // Every cell fluid moved out of or into this step, even if its units end up the same (a cell in a steady stream
    // passes on exactly what it receives): it is still flowing, so it must stay awake
    const flowed = new Set<number>();
    let changedCount = 0;
    const touch = (i: number) => {
      flowed.add(i);
      this.changed.add(i);
    };

    // 1. Down. Falling into room below is gravity, not flow: everything that fits drops at once, whatever the fluid's
    // flow rate (which only slows spreading). Rows are done bottom first, so the cell below has already moved: fall into
    // the room it has now, not the room it had, or a falling column jams up behind itself. Moves apply as they are made.
    const claim = new Map<number, number>();
    for (const i of order) {
      if (swapped.has(i) || this.units[i] <= 0) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      const fluidId = this.ids[i];
      if (!this.canEnter(fluidId, x, y + 1, claim)) continue;
      const ni = i + w;
      const amount = Math.min(this.units[i], FLUID_UNITS - this.units[ni]);
      if (amount <= 0) continue;
      this.move(i, ni, amount, fluidId);
      touch(i);
      touch(ni);
    }

    // 2. Sideways, towards the lower neighbours, for fluid that rests (fluid with room below it falls on instead, it
    // does not fan out in mid-air). Fluid that has just landed spreads in the same step. Both sides are worked out from
    // the same amount, so the side going first does not take the bigger share.
    const sideways: Array<[number, number, number]> = [];
    const dxs = leftFirst ? [-1, 1] : [1, -1];
    const settled = new Set(order);
    for (const i of flowed) settled.add(i);
    const spreaders = [...settled].sort((a, b) => {
      const ay = Math.floor(a / w);
      const by = Math.floor(b / w);
      if (ay !== by) return by - ay;
      return leftFirst ? (a % w) - (b % w) : (b % w) - (a % w);
    });
    const pending = new Map<number, number>();
    const planned = (ni: number) => this.units[ni] + (pending.get(ni) ?? 0);
    for (const i of spreaders) {
      const base = this.units[i];
      if (base < FLUID_SPREAD_MIN_DIFF || swapped.has(i)) continue;
      const fluidId = this.ids[i];
      const params = this.registry.paramsOf(fluidId);
      if (!params) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      // Fluid that can still fall does not spread
      if (this.canEnter(fluidId, x, y + 1, claim) && this.units[i + w] < FLUID_UNITS) continue;
      const lower: Array<{ ni: number; diff: number; roomUnder: number }> = [];
      for (const dx of dxs) {
        if (!this.canEnter(fluidId, x + dx, y, claim)) continue;
        const ni = i + dx;
        const diff = base - this.units[ni];
        if (diff < FLUID_SPREAD_MIN_DIFF) continue;
        const roomUnder = this.blocked(x + dx, y + 1) ? 0 : clampUnit((FLUID_UNITS - planned(ni + w)) / FLUID_UNITS);
        lower.push({ ni, diff, roomUnder });
      }
      if (lower.length === 0) continue;
      const wants: Array<[number, number]> = [];
      for (const { ni, diff, roomUnder } of lower) {
        // Levelling out with its neighbours, a cell hands each its share of the difference (so the cells end level).
        // Towards a neighbour with room under it, fluid is not levelling but pouring off an edge (it falls on from
        // there), so all of the difference moves at the flow rate.
        const levelShare = 1 / (lower.length + 1);
        const effective = diff * (levelShare + (1 - levelShare) * roomUnder) * params.flowRate;
        let flow = Math.floor(effective + 1e-9);
        if (flow < 1) {
          // A slow fluid (lava) moves one unit every few steps, and stays awake until its turn comes
          const period = Math.min(MAX_SPREAD_PERIOD, Math.ceil(1 / Math.max(effective, 1e-6)));
          if (this.stepCount % period !== 0) {
            this.waiting.add(i);
            continue;
          }
          flow = 1;
        }
        flow = Math.min(flow, FLUID_UNITS - planned(ni));
        if (flow > 0) wants.push([ni, flow]);
      }
      let asked = wants.reduce((sum, [, flow]) => sum + flow, 0);
      // More asked than there is: trim from the last side first (the order alternates every step)
      for (let k = wants.length - 1; asked > base && k >= 0; k--) {
        const cut = Math.min(wants[k][1], asked - base);
        wants[k][1] -= cut;
        asked -= cut;
      }
      for (const [ni, flow] of wants) {
        if (flow <= 0) continue;
        sideways.push([i, ni, flow]);
        pending.set(ni, (pending.get(ni) ?? 0) + flow);
        pending.set(i, (pending.get(i) ?? 0) - flow);
        if (this.units[ni] <= 0) claim.set(ni, fluidId);
      }
    }
    for (const [i, ni, flow] of sideways) {
      this.move(i, ni, flow, this.ids[i]);
      touch(i);
      touch(ni);
    }

    // Cells that moved wake their neighbours for the next step
    const nextActive = new Set<number>();
    for (const i of flowed) {
      changedCount++;
      const x = i % w;
      const y = Math.floor(i / w);
      nextActive.add(i);
      if (x > 0) nextActive.add(i - 1);
      if (x < w - 1) nextActive.add(i + 1);
      if (y > 0) nextActive.add(i - w);
      if (y < this.height - 1) nextActive.add(i + w);
    }
    for (const i of swapped) {
      nextActive.add(i);
      if (i >= w) nextActive.add(i - w);
      if (i + w < this.units.length) nextActive.add(i + w);
    }
    // A reaction under way carries on next step
    for (const i of this.reacting) nextActive.add(i);
    this.reacting.clear();
    for (const i of this.waiting) nextActive.add(i);

    const touched = new Set([...cells, ...nextActive]);
    this.updateFalling(touched);
    this.levelQuietRows(cells, flowed, nextActive);
    this.ageFilms(touched);
    this.active = nextActive;
    return changedCount;
  }

  /** Moves `amount` units from one cell to another (which is empty or holds the same fluid). */
  private move(from: number, to: number, amount: number, fluidId: number): void {
    this.units[from] -= amount;
    this.units[to] += amount;
    this.ids[to] = fluidId;
    if (this.units[from] <= 0) this.setUnits(from, 0);
  }

  /**
   * Works out which cells are falling, from the bottom up: a cell is falling when the cell below is open and can take
   * more of its fluid, or is itself falling. Only the cells that might have changed are looked at (and the cells above
   * one whose answer changed).
   */
  private updateFalling(candidates: Set<number>): void {
    const w = this.width;
    const rows = new Map<number, Set<number>>();
    const add = (i: number) => {
      const y = Math.floor(i / w);
      let row = rows.get(y);
      if (!row) rows.set(y, (row = new Set()));
      row.add(i);
    };
    for (const i of candidates) add(i);
    for (let y = this.height - 1; y >= 0; y--) {
      const row = rows.get(y);
      if (!row) continue;
      for (const i of row) {
        let falling = 0;
        if (this.units[i] > 0 && y + 1 < this.height) {
          const below = i + w;
          const open = !this.blocked(i % w, y + 1);
          if (open) {
            const empty = this.units[below] <= 0;
            const same = this.ids[below] === this.ids[i];
            if ((empty || (same && this.units[below] < FLUID_UNITS)) || (same && this.fallingFlags[below] === 1)) falling = 1;
          }
        }
        if (this.fallingFlags[i] !== falling) {
          this.fallingFlags[i] = falling;
          this.changed.add(i);
          if (y > 0) add(i - w);
        }
      }
    }
  }

  /**
   * Spreading stops once neighbours differ by a single unit, which can leave a pool as a gentle staircase of one unit
   * a cell. When a resting row of one fluid has gone quiet (nothing in it moved this step and nothing is held back),
   * its fluid is dealt out evenly so the cells differ by one unit at most: a flat pool is flat. Cells keep their
   * order (the fuller ones keep the extra units), so nothing is shuffled sideways.
   */
  private levelQuietRows(cells: Set<number>, flowed: Set<number>, nextActive: Set<number>): void {
    const w = this.width;
    const resting = (j: number) => this.units[j] > 0 && this.fallingFlags[j] === 0;
    const visited = new Set<number>();
    for (const i of cells) {
      if (visited.has(i) || !resting(i)) continue;
      visited.add(i);
      const id = this.ids[i];
      const row = Math.floor(i / w);
      const run = [i];
      let quiet = !flowed.has(i) && !this.waiting.has(i);
      for (const dir of [-1, 1]) {
        for (let j = i + dir; Math.floor(j / w) === row && j >= 0 && j < this.units.length; j += dir) {
          if (this.ids[j] !== id || !resting(j)) break;
          visited.add(j);
          run.push(j);
          if (flowed.has(j) || this.waiting.has(j)) quiet = false;
        }
      }
      if (!quiet || run.length < 2) continue;
      let total = 0;
      let lo = FLUID_UNITS;
      let hi = 0;
      for (const j of run) {
        total += this.units[j];
        lo = Math.min(lo, this.units[j]);
        hi = Math.max(hi, this.units[j]);
      }
      if (hi - lo <= 1) continue;
      const base = Math.floor(total / run.length);
      let extra = total - base * run.length;
      const byFullness = [...run].sort((a, b) => this.units[b] - this.units[a] || a - b);
      const next = new Map<number, number>();
      for (const j of byFullness) next.set(j, base + (extra-- > 0 ? 1 : 0));
      for (const j of run) {
        if (this.units[j] === next.get(j)) continue;
        this.units[j] = next.get(j)!;
        this.changed.add(j);
        nextActive.add(j);
      }
      const left = Math.min(...run);
      const right = Math.max(...run);
      if (left % w > 0) nextActive.add(left - 1);
      if (right % w < w - 1) nextActive.add(right + 1);
    }
  }

  /** Lone 1-unit films that nothing holds up age, and evaporate when they are old; a cell that stops being a film is forgotten. */
  private ageFilms(candidates: Set<number>): void {
    for (const i of candidates) {
      if (!this.films.has(i) && this.isFilm(i)) this.films.set(i, 0);
    }
    for (const [i, age] of [...this.films]) {
      if (!this.isFilm(i)) {
        this.films.delete(i);
        continue;
      }
      if (age + 1 < FLUID_FILM_EVAPORATE_STEPS) {
        this.films.set(i, age + 1);
        continue;
      }
      this.films.delete(i);
      this.setUnits(i, 0);
      this.evaporatedVolume += 1 / FLUID_UNITS;
      this.changed.add(i);
      this.wakeIndex(i, i % this.width, Math.floor(i / this.width));
    }
  }
}
