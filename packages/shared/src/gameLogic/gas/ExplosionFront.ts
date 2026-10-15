import { DEFAULT_EXPLOSION_MIN_CONCENTRATION, type ExplosionSettings } from '../../types/fluid';

/** Explosive gas in a cell: how thick it is, which gas, and how it explodes. */
export interface ExplosiveCell {
  gasId: number;
  concentration: number;
  explosion: ExplosionSettings;
}

/** What a front needs to know about the world it runs through. The server wires this to the gas grid. */
export interface ExplosionWorld {
  /** The explosive gas in a cell, or null if there is none (clear air, inert gas, solid terrain...). */
  explosiveAt(x: number, y: number): ExplosiveCell | null;
  /** Takes the gas out of a cell that has detonated. */
  consume(x: number, y: number): void;
}

/** One cell that detonated. */
export interface DetonatedCell extends ExplosiveCell {
  x: number;
  y: number;
}

/**
 * The front of an explosion in gas. Setting off one cell lights the cells that border it, and so on: each
 * `step` the front moves `frontSpeed` cells through connected explosive gas, so a pocket goes up in a few
 * steps (nearly instant, but a wave you can watch cross it). Every cell detonates once (its gas is consumed
 * as it goes), gas thinner than the gas's `minConcentration` does not burn and does not carry the front,
 * and gas that is not connected to the front is not touched. Pure and deterministic: no dice, no clock.
 */
export class ExplosionFront {
  /** Cells lined up to detonate on the next sub-wave. */
  private cells = new Map<string, [number, number]>();
  private readonly world: ExplosionWorld;

  constructor(world: ExplosionWorld) {
    this.world = world;
  }

  private static key(x: number, y: number): string {
    return `${x},${y}`;
  }

  /** Cells waiting to detonate. A front with none left is finished. */
  public get pendingCount(): number {
    return this.cells.size;
  }

  /** Sets off the gas in a cell. False if there is no gas there that can detonate, or it is already lined up. */
  public ignite(x: number, y: number): boolean {
    const cell = this.world.explosiveAt(x, y);
    if (!cell || cell.concentration < (cell.explosion.minConcentration ?? DEFAULT_EXPLOSION_MIN_CONCENTRATION)) return false;
    const key = ExplosionFront.key(x, y);
    if (this.cells.has(key)) return false;
    this.cells.set(key, [x, y]);
    return true;
  }

  /**
   * Advances the front. Returns the cells that detonated, in the order they went. Does nothing when nothing is
   * lined up.
   */
  public step(): DetonatedCell[] {
    const out: DetonatedCell[] = [];
    if (this.cells.size === 0) return out;
    // The front moves at the speed of the fastest gas in it
    let waves = 1;
    for (const [x, y] of this.cells.values()) {
      const cell = this.world.explosiveAt(x, y);
      if (cell) waves = Math.max(waves, cell.explosion.frontSpeed);
    }
    for (let wave = 0; wave < waves && this.cells.size > 0; wave++) {
      const current = [...this.cells.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      this.cells.clear();
      const detonating: DetonatedCell[] = [];
      for (const [x, y] of current) {
        const cell = this.world.explosiveAt(x, y);
        // Gas that moved away, was blown out or thinned since it was lined up does not go off
        if (!cell || cell.concentration < (cell.explosion.minConcentration ?? DEFAULT_EXPLOSION_MIN_CONCENTRATION)) continue;
        detonating.push({ x, y, ...cell });
      }
      // Take every gas of this wave out first, so a cell cannot be lit twice and the next wave only sees what is left
      for (const cell of detonating) this.world.consume(cell.x, cell.y);
      for (const cell of detonating) {
        out.push(cell);
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) this.ignite(cell.x + dx, cell.y + dy);
      }
    }
    return out;
  }
}
