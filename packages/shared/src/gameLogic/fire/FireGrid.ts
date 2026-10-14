import type { Flammability } from '../../types/fluid';

/**
 * What the fire simulation needs to know about the world it burns in. The server wires this to the fluid
 * grid (and, with ticket 059, to flammable blocks), so the fire rules never name a material.
 */
export interface FireWorld {
  /** What burns in a cell, or null if nothing there can burn. */
  flammabilityAt(x: number, y: number): Flammability | null;
  /** How much fuel is left in a cell (a fluid's level; 1 for a solid material). 0 or less means none. */
  fuelAt(x: number, y: number): number;
  /** Burns away `amount` of a cell's fuel (a fluid's level); a solid material ignores it. */
  consumeFuel(x: number, y: number, amount: number): void;
  /** A cell has burned for its full duration: leave what it burns into behind. */
  spend(x: number, y: number): void;
}

/** One cell whose fire started or stopped since the last `drainChanges`. */
export interface FireCellChange {
  x: number;
  y: number;
  burning: boolean;
}

/** How much more (or less) readily fire spreads in each direction: heat rises, so up is easiest and down hardest. */
export const FIRE_SPREAD_UP = 1.5;
export const FIRE_SPREAD_SIDE = 1;
export const FIRE_SPREAD_DOWN = 0.5;

const NEIGHBOURS: ReadonlyArray<readonly [dx: number, dy: number, factor: number]> = [
  [0, -1, FIRE_SPREAD_UP],
  [-1, 0, FIRE_SPREAD_SIDE],
  [1, 0, FIRE_SPREAD_SIDE],
  [0, 1, FIRE_SPREAD_DOWN],
];

/**
 * Fire as per-cell state: a cell is burning or not, with the seconds it has left. Fire needs fuel, so it
 * only exists in a cell that has something flammable in it. Each step a burning cell:
 *   - goes out if its fuel is gone;
 *   - burns off fuel at a rate that would empty a full cell in the material's burn duration;
 *   - may light each of its four neighbours (chance per second = its spread chance x the direction's factor x the
 *     neighbour's own ignition chance);
 *   - is spent when its burn time runs out (the world leaves whatever it burns into).
 * Pure and deterministic given the dice: `random` is injected.
 */
export class FireGrid {
  public readonly width: number;
  public readonly height: number;
  private readonly world: FireWorld;
  private readonly random: () => number;
  private readonly remaining = new Map<number, number>();
  private readonly changed = new Map<number, boolean>();

  constructor(width: number, height: number, world: FireWorld, random: () => number = Math.random) {
    this.width = width;
    this.height = height;
    this.world = world;
    this.random = random;
  }

  private index(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && Number.isInteger(x) && Number.isInteger(y) ? y * this.width + x : -1;
  }

  public isBurning(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.remaining.has(i);
  }

  public get burningCount(): number {
    return this.remaining.size;
  }

  /** Visits every burning cell, in a fixed order. */
  public forEachBurning(visit: (x: number, y: number, secondsLeft: number) => void): void {
    for (const i of [...this.remaining.keys()].sort((a, b) => a - b)) {
      visit(i % this.width, Math.floor(i / this.width), this.remaining.get(i)!);
    }
  }

  /** Sets a cell alight. False if it cannot burn, has no fuel, or is already burning. */
  public ignite(x: number, y: number): boolean {
    const i = this.index(x, y);
    if (i < 0 || this.remaining.has(i)) return false;
    const flammability = this.world.flammabilityAt(x, y);
    if (!flammability || this.world.fuelAt(x, y) <= 0) return false;
    this.start(i, flammability);
    return true;
  }

  public extinguish(x: number, y: number): boolean {
    const i = this.index(x, y);
    if (i < 0 || !this.remaining.has(i)) return false;
    this.stop(i);
    return true;
  }

  private transitions = 0;

  private start(i: number, flammability: Flammability): void {
    this.remaining.set(i, Math.max(0.001, flammability.burnDuration));
    this.changed.set(i, true);
    this.transitions++;
  }

  private stop(i: number): void {
    this.remaining.delete(i);
    this.changed.set(i, false);
    this.transitions++;
  }

  /** Cells whose fire started or stopped since the last call (their current state), then forgets them. */
  public drainChanges(): FireCellChange[] {
    const out: FireCellChange[] = [];
    for (const [i, burning] of this.changed) out.push({ x: i % this.width, y: Math.floor(i / this.width), burning });
    this.changed.clear();
    return out;
  }

  /** Runs `seconds` of fire. Returns how many cells started or stopped burning. */
  public step(seconds: number): number {
    if (this.remaining.size === 0 || !(seconds > 0)) return 0;
    this.transitions = 0;
    const lit = new Map<number, Flammability>();

    for (const i of [...this.remaining.keys()].sort((a, b) => a - b)) {
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      const flammability = this.world.flammabilityAt(x, y);
      if (!flammability || this.world.fuelAt(x, y) <= 0) {
        this.stop(i);
        continue;
      }

      this.world.consumeFuel(x, y, seconds / flammability.burnDuration);

      for (const [dx, dy, factor] of NEIGHBOURS) {
        const n = this.index(x + dx, y + dy);
        if (n < 0 || this.remaining.has(n) || lit.has(n)) continue;
        const neighbour = this.world.flammabilityAt(x + dx, y + dy);
        if (!neighbour || this.world.fuelAt(x + dx, y + dy) <= 0) continue;
        const chance = Math.min(1, flammability.spreadChance * factor * neighbour.ignitionChance * seconds);
        if (chance > 0 && this.random() < chance) lit.set(n, neighbour);
      }

      const left = this.remaining.get(i)! - seconds;
      if (left <= 0) {
        this.stop(i);
        this.world.spend(x, y);
      } else if (this.world.fuelAt(x, y) <= 0) {
        this.stop(i); // the fuel just ran out
      } else {
        this.remaining.set(i, left);
      }
    }

    for (const [n, flammability] of lit) this.start(n, flammability);
    return this.transitions;
  }
}
