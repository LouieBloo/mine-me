import { FluidRegistry, NO_FLUID } from './FluidRegistry';

/** A full cell. A cell can hold slightly more when it is squeezed (pressure). */
export const FLUID_FULL_LEVEL = 1;
/** How much extra a squeezed cell may hold, so fluid can climb a U-bend and level out. */
export const FLUID_MAX_COMPRESSION = 0.02;
/** Flows smaller than this are ignored, so a trickle cannot keep a pool awake forever. */
export const FLUID_MIN_FLOW = 0.001;

/** One cell whose contents changed since the last `drainChanges`. fluidId 0 means it is now empty. */
export interface FluidCellChange {
  x: number;
  y: number;
  fluidId: number;
  level: number;
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
}

/** Reacting fluid left in a hardening cell below this is not worth keeping (the cell becomes the block). */
const REACTION_RESIDUE = 1e-3;

/** Amount to keep in the lower of two stacked cells holding `total` between them. */
function stableBottom(total: number): number {
  if (total <= FLUID_FULL_LEVEL) return FLUID_FULL_LEVEL;
  if (total < 2 * FLUID_FULL_LEVEL + FLUID_MAX_COMPRESSION) {
    return (FLUID_FULL_LEVEL * FLUID_FULL_LEVEL + total * FLUID_MAX_COMPRESSION) / (FLUID_FULL_LEVEL + FLUID_MAX_COMPRESSION);
  }
  return (total + FLUID_MAX_COMPRESSION) / 2;
}

/**
 * Cell-based fluid simulation. Each cell holds one fluid and a level (0 empty .. 1 full). A step moves
 * fluid down first, then sideways towards lower neighbours, and squeezed fluid back up. Only "active"
 * cells (those that just changed, and their neighbours) are processed, so a still pool costs nothing.
 *
 * Pure and deterministic: the same inputs always give the same result, and there is no clock or
 * randomness. Row 0 is the top; gravity pulls towards higher y.
 */
export class FluidGrid {
  public readonly width: number;
  public readonly height: number;
  private readonly levels: Float32Array;
  private readonly ids: Uint8Array;
  private active = new Set<number>();
  private readonly changed = new Set<number>();
  private stepCount = 0;
  /** Fluid that disappeared (too thin to keep, or squeezed out of the world). For diagnostics and tests. */
  public evaporatedVolume = 0;
  /** Fluid taken out on purpose with `drainFluid` (burnt away, for example). For diagnostics and tests. */
  public drainedVolume = 0;

  private readonly registry: FluidRegistry;
  private readonly isBlocked: (x: number, y: number) => boolean;
  /** Reactions by the id of the fluid that holds them (e.g. lava's: touched by water, becomes lavarock). */
  private readonly reactionRules = new Map<number, ReactionRule[]>();
  private pendingReactions: FluidReactionResult[] = [];

  /** `isBlocked` says whether a cell cannot hold fluid (solid terrain). Out-of-bounds is always blocked. */
  constructor(width: number, height: number, registry: FluidRegistry, isBlocked: (x: number, y: number) => boolean) {
    this.width = width;
    this.height = height;
    this.registry = registry;
    this.isBlocked = isBlocked;
    this.levels = new Float32Array(width * height);
    this.ids = new Uint8Array(width * height);
    for (let id = 1; id <= registry.size; id++) {
      const reactions = registry.paramsOf(id)?.reactions;
      if (!reactions) continue;
      const rules: ReactionRule[] = [];
      for (const r of reactions) {
        const withId = registry.idOf(r.with);
        if (withId !== undefined && r.costPerLevel > 0) rules.push({ withId, becomes: r.becomes, costPerLevel: r.costPerLevel });
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
   * `costPerLevel` levels of the other are spent. When the reacting fluid in a cell is used up (or what is left is
   * too thin to keep), the cell is emptied and reported through `takeReactions` so it can become a block. When the
   * other fluid runs out first, the reacting fluid is only reduced, so a trickle slowly eats a pool.
   */
  private react(cells: Iterable<number>): void {
    if (this.reactionRules.size === 0) return;
    const w = this.width;
    for (const i of cells) {
      const level = this.levels[i];
      if (level <= 0) continue;
      const rules = this.reactionRules.get(this.ids[i]);
      if (!rules) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      for (const rule of rules) {
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const ni = ny * w + nx;
          const other = this.levels[ni];
          if (other <= 0 || this.ids[ni] !== rule.withId || this.levels[i] <= 0) continue;
          const hardened = Math.min(this.levels[i], other / rule.costPerLevel);
          this.levels[i] -= hardened;
          this.levels[ni] -= hardened * rule.costPerLevel;
          if (this.levels[ni] <= REACTION_RESIDUE) {
            this.levels[ni] = 0;
            this.ids[ni] = NO_FLUID;
          }
          this.changed.add(ni);
          this.changed.add(i);
          this.wakeIndex(ni, nx, ny);
          const minLevel = this.registry.paramsOf(this.ids[i])?.minLevel ?? 0;
          if (this.levels[i] <= Math.max(REACTION_RESIDUE, minLevel)) {
            this.levels[i] = 0;
            this.ids[i] = NO_FLUID;
            this.pendingReactions.push({ x, y, becomes: rule.becomes });
            this.wakeIndex(i, x, y);
            break;
          }
        }
        if (this.levels[i] <= 0) break;
      }
    }
  }

  public inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private blocked(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.isBlocked(x, y);
  }

  public getFluidId(x: number, y: number): number {
    return this.inBounds(x, y) && this.levels[y * this.width + x] > 0 ? this.ids[y * this.width + x] : NO_FLUID;
  }

  public getLevel(x: number, y: number): number {
    return this.inBounds(x, y) ? this.levels[y * this.width + x] : 0;
  }

  /** Calls `visit` for every cell currently holding this fluid. */
  public forEachCellOf(fluidId: number, visit: (x: number, y: number, level: number) => void): void {
    for (let i = 0; i < this.levels.length; i++) {
      if (this.levels[i] > 0 && this.ids[i] === fluidId) visit(i % this.width, Math.floor(i / this.width), this.levels[i]);
    }
  }

  /** Cells currently awake. A settled grid has none. */
  public get activeCount(): number {
    return this.active.size;
  }

  /** Total fluid in the grid, optionally for one fluid id only. */
  public totalVolume(fluidId?: number): number {
    let total = 0;
    for (let i = 0; i < this.levels.length; i++) {
      if (this.levels[i] > 0 && (fluidId === undefined || this.ids[i] === fluidId)) total += this.levels[i];
    }
    return total;
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
    this.levels[i] = level > 0 ? level : 0;
    this.ids[i] = level > 0 ? fluidId : NO_FLUID;
    this.changed.add(i);
    this.wakeIndex(i, x, y);
    return true;
  }

  /** Adds fluid to a cell that is empty or holds the same fluid. Returns false if it could not. */
  public addFluid(x: number, y: number, fluidId: number, amount: number): boolean {
    if (this.blocked(x, y) || amount <= 0 || !this.registry.paramsOf(fluidId)) return false;
    const i = y * this.width + x;
    if (this.levels[i] > 0 && this.ids[i] !== fluidId) return false;
    return this.setCell(x, y, fluidId, this.levels[i] + amount);
  }

  /** Takes up to `amount` out of a cell; returns how much was taken. Neighbours wake so they can flow into the gap. */
  public drainFluid(x: number, y: number, amount: number): number {
    if (!this.inBounds(x, y) || !(amount > 0)) return 0;
    const i = y * this.width + x;
    if (this.levels[i] <= 0) return 0;
    const taken = Math.min(amount, this.levels[i]);
    this.levels[i] -= taken;
    if (this.levels[i] <= 1e-6) {
      this.levels[i] = 0;
      this.ids[i] = NO_FLUID;
    }
    this.drainedVolume += taken;
    this.changed.add(i);
    this.wakeIndex(i, x, y);
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
    if (this.blocked(x, y) && this.levels[i] > 0) {
      const fluidId = this.ids[i];
      let remaining = this.levels[i];
      this.levels[i] = 0;
      this.ids[i] = NO_FLUID;
      this.changed.add(i);
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        if (remaining <= 0) break;
        const nx = x + dx;
        const ny = y + dy;
        if (this.blocked(nx, ny)) continue;
        const ni = ny * this.width + nx;
        if (this.levels[ni] > 0 && this.ids[ni] !== fluidId) continue;
        const room = FLUID_FULL_LEVEL - this.levels[ni];
        if (room <= 0) continue;
        const moved = Math.min(room, remaining);
        this.levels[ni] += moved;
        this.ids[ni] = fluidId;
        this.changed.add(ni);
        remaining -= moved;
      }
      this.evaporatedVolume += remaining;
    }
    this.wakeIndex(i, x, y);
  }

  /** Cells that changed since the last call (their current contents), then forgets them. */
  public drainChanges(): FluidCellChange[] {
    const out: FluidCellChange[] = [];
    for (const i of this.changed) {
      const level = this.levels[i];
      out.push({ x: i % this.width, y: Math.floor(i / this.width), fluidId: level > 0 ? this.ids[i] : NO_FLUID, level });
    }
    this.changed.clear();
    return out;
  }

  /** Runs one simulation step. Returns how many cells changed. */
  public step(): number {
    this.stepCount++;
    if (this.active.size === 0) return 0;
    const w = this.width;
    const leftFirst = this.stepCount % 2 === 0;

    // Bottom rows first; left-to-right order alternates each step so nothing leans one way.
    const order = [...this.active].sort((a, b) => {
      const ay = Math.floor(a / w);
      const by = Math.floor(b / w);
      if (ay !== by) return by - ay;
      return leftFirst ? (a % w) - (b % w) : (b % w) - (a % w);
    });

    // Denser fluid sinks through lighter fluid: swap the two cells before anything flows.
    const swapped = new Set<number>();
    for (const i of order) {
      const below = i + w;
      if (swapped.has(i) || below >= this.levels.length) continue;
      if (this.levels[i] <= 0 || this.levels[below] <= 0 || this.ids[i] === this.ids[below]) continue;
      if (this.blocked(i % w, Math.floor(i / w)) || this.blocked(below % w, Math.floor(below / w))) continue;
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

    for (const i of order) {
      const fluidId = this.ids[i];
      const level = this.levels[i];
      if (swapped.has(i) || level <= 0) continue;
      const params = this.registry.paramsOf(fluidId);
      if (!params) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      let remaining = level;

      // Whether this fluid may flow into a neighbour: free terrain that is empty or already this fluid.
      const canEnter = (nx: number, ny: number): boolean => {
        if (this.blocked(nx, ny)) return false;
        const ni = ny * w + nx;
        if (this.levels[ni] > 0) return this.ids[ni] === fluidId;
        const claimed = claim.get(ni);
        return claimed === undefined || claimed === fluidId;
      };
      const send = (ni: number, amount: number) => {
        add(i, -amount);
        add(ni, amount);
        if (this.levels[ni] <= 0) claim.set(ni, fluidId);
        remaining -= amount;
      };

      // 1. Down
      if (canEnter(x, y + 1)) {
        const ni = i + w;
        const flow = (stableBottom(remaining + this.levels[ni]) - this.levels[ni]) * params.flowRate;
        if (flow > FLUID_MIN_FLOW) send(ni, Math.min(flow, remaining));
      }

      // 2. Sideways, towards the lower neighbour
      const sides = leftFirst ? [-1, 1] : [1, -1];
      for (const dx of sides) {
        if (remaining <= 0 || !canEnter(x + dx, y)) continue;
        const ni = i + dx;
        const diff = remaining - this.levels[ni];
        if (diff <= params.flowThreshold) continue;
        let flow = (diff / 2) * params.flowRate;
        // Never hand a neighbour less than the minimum: it would evaporate on arrival and a spreading
        // pool would leak away at its edge. Give it the minimum instead, if that still leaves the donor
        // at least as deep as the receiver; otherwise hold back.
        const receiverAfter = this.levels[ni] + flow;
        if (receiverAfter < params.minLevel) {
          flow = params.minLevel - this.levels[ni];
          if (remaining - flow < this.levels[ni] + flow) continue;
        }
        if (flow > FLUID_MIN_FLOW) send(ni, Math.min(flow, remaining));
      }

      // 3. Up, only when squeezed past full
      if (remaining > FLUID_FULL_LEVEL && canEnter(x, y - 1)) {
        const ni = i - w;
        const flow = (remaining - stableBottom(remaining + this.levels[ni])) * params.flowRate;
        // Pressure only lifts fluid when it can lift at least the minimum; less would evaporate on arrival
        if (flow > FLUID_MIN_FLOW && this.levels[ni] + flow >= params.minLevel) send(ni, Math.min(flow, remaining));
      }
    }

    // Apply the flows, drop what is too thin to keep, and wake what moved.
    const nextActive = new Set<number>();
    let changedCount = 0;
    for (const [i, change] of delta) {
      const wasEmpty = this.levels[i] <= 0;
      if (wasEmpty) {
        const claimed = claim.get(i);
        if (claimed !== undefined) this.ids[i] = claimed;
      }
      this.levels[i] = Math.max(0, this.levels[i] + change);
      if (Math.abs(change) > 0) {
        changedCount++;
        this.changed.add(i);
        const x = i % w;
        const y = Math.floor(i / w);
        nextActive.add(i);
        if (x > 0) nextActive.add(i - 1);
        if (x < w - 1) nextActive.add(i + 1);
        if (y > 0) nextActive.add(i - w);
        if (y < this.height - 1) nextActive.add(i + w);
      }
    }
    for (const i of order) {
      if (this.levels[i] > 0) {
        const params = this.registry.paramsOf(this.ids[i]);
        if (!params || this.levels[i] < params.minLevel) {
          this.evaporatedVolume += this.levels[i];
          this.levels[i] = 0;
          this.ids[i] = NO_FLUID;
          this.changed.add(i);
          changedCount++;
        }
      }
    }
    for (const i of swapped) {
      nextActive.add(i);
      if (i >= w) nextActive.add(i - w);
      if (i + w < this.levels.length) nextActive.add(i + w);
    }
    // Fluids that react do so where they now touch
    this.react(new Set([...order, ...nextActive]));
    this.active = nextActive;
    return changedCount;
  }
}
