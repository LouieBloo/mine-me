import {
  DEFAULT_EXPLOSION_MIN_CONCENTRATION,
  ExplosionFront,
  MINING_CONFIG,
  blastDamageAt,
  knockbackAway,
  type DamageEvent,
  type DamageTarget,
  type DetonatedCell,
  type ExplosionWorld,
  type Flammability,
  type GasExplosionCell,
  type Vector2D,
} from '@mine-me/shared';
import type { MiningWorld } from '../MiningWorld';

/** Heat of a detonating cell, as a multiplier on what it lights: the ignition chance of whatever burns nearby, as is. */
const DETONATION_IGNITION_STRENGTH = 1;
/** Radius (tiles) around a detonating cell in which flammable fluids and blocks are set alight. */
const DETONATION_IGNITION_RADIUS = 1.01;

/**
 * Explosive gas going off. Anything that ignites reports it here (see `MiningIgnitionSubsystem`); the gas that
 * is lit goes up as a front that moves a few cells every gas step (`ExplosionFront`), so a pocket detonates
 * nearly at once but as a wave you can watch. Each cell that goes off consumes its gas, hurts the players and
 * mobs within its blast radius (more for thicker gas, less with distance) through the one damage pipeline, and
 * sets alight any flammable fluid or block beside it. It breaks no blocks: damage to the terrain is left for
 * later. Which gas explodes, how hard and how fast is data (the gas's `flammability.explosion`).
 */
export class MiningGasExplosionSubsystem {
  private readonly front: ExplosionFront;
  private detonated: GasExplosionCell[] = [];
  private nextExplosionId = 1;

  constructor(private readonly world: MiningWorld) {
    this.front = new ExplosionFront(this.buildWorld());
  }

  private buildWorld(): ExplosionWorld {
    return {
      explosiveAt: (x, y) => this.explosiveAt(x, y),
      consume: (x, y) => {
        this.world.gases.grid.drainGas(x, y, 1);
      },
    };
  }

  /** The explosive gas in a cell (null for clear air, inert gas, or anything that cannot explode). */
  public explosiveAt(x: number, y: number) {
    const grid = this.world.gases.grid;
    const gasId = grid.getGasId(x, y);
    if (gasId === 0) return null;
    const key = this.world.gases.registry.keyOf(gasId);
    const explosion = key ? this.world.data.getGas(key)?.flammability?.explosion : null;
    return explosion ? { gasId, concentration: grid.getConcentration(x, y), explosion } : null;
  }

  /** How the explosive gas in a cell burns (its ignition chance...), or null if the gas there cannot explode. */
  public flammabilityAt(x: number, y: number): Flammability | null {
    if (!this.explosiveAt(x, y)) return null;
    const key = this.world.gases.registry.keyOf(this.world.gases.grid.getGasId(x, y));
    return (key && this.world.data.getGas(key)?.flammability) || null;
  }

  /** Whether the gas in a cell could be set off (it explodes, and is thick enough). */
  public canIgnite(x: number, y: number): boolean {
    const cell = this.explosiveAt(x, y);
    return !!cell && cell.concentration >= (cell.explosion.minConcentration ?? DEFAULT_EXPLOSION_MIN_CONCENTRATION);
  }

  /** Sets off the gas in a cell. False if there is nothing there that can go off. */
  public ignite(x: number, y: number): boolean {
    const gasId = this.world.gases.grid.getGasId(x, y);
    const lined = this.front.ignite(x, y);
    // The spark that starts an explosion makes a sound (the front lighting its own neighbours does not go through here)
    if (lined) this.world.gases.pushEvent({ kind: 'ignite', gasId, x: x + 0.5, y: y + 0.5 });
    return lined;
  }

  /** Cells lined up to go off on the next step. */
  public get pendingCount(): number {
    return this.front.pendingCount;
  }

  /** Runs once per tick; steps the explosions on every Nth tick (the gas beat). */
  public update(): void {
    if (this.world.tick % MINING_CONFIG.EXPLOSION_STEP_TICKS !== 0) return;
    this.step();
  }

  /** One step of every explosion in the room, on the gas beat (the sandbox drives this itself). */
  public step(): void {
    if (this.front.pendingCount === 0) return;
    const cells = this.front.step();
    if (cells.length === 0) return;
    const id = `gas-explosion-${this.nextExplosionId++}`;
    this.hurt(cells, id);
    for (const cell of cells) {
      this.detonated.push([cell.x, cell.y, cell.gasId]);
      // The heat of the blast lights whatever else can burn beside it
      this.world.ignition.emit(cell.x + 0.5, cell.y + 0.5, DETONATION_IGNITION_RADIUS, DETONATION_IGNITION_STRENGTH);
    }
  }

  /**
   * Hurts everyone in reach of this step's cells. A body takes the sum of the blasts of every cell that reached it
   * (thicker gas and nearer cells hurt more, so a big dense pocket is far worse than a wisp), as one hit.
   */
  private hurt(cells: readonly DetonatedCell[], id: string): void {
    const centre: Vector2D = {
      x: cells.reduce((sum, c) => sum + c.x + 0.5, 0) / cells.length,
      y: cells.reduce((sum, c) => sum + c.y + 0.5, 0) / cells.length,
    };
    const blastAt = (position: Vector2D): number => {
      let total = 0;
      for (const cell of cells) {
        const distance = Math.hypot(position.x - (cell.x + 0.5), position.y - (cell.y + 0.5));
        total += blastDamageAt(distance, cell.explosion.blastRadius, cell.explosion.damage * cell.concentration);
      }
      return total;
    };
    const source: DamageEvent['source'] = { kind: 'explosion', id, position: centre };
    const hit = (target: DamageTarget, position: Vector2D) => {
      const raw = blastAt(position);
      const amount = Math.round(raw);
      if (amount <= 0) return;
      const event: DamageEvent = {
        amount,
        type: 'explosive',
        source,
        knockback: knockbackAway(centre.x, position.x, { x: MINING_CONFIG.EXPLOSION_KNOCKBACK_X, y: MINING_CONFIG.EXPLOSION_KNOCKBACK_Y }),
        // The front passes over several steps; each one must hurt, not just the first
        ignoreInvulnerability: true,
      };
      this.world.damage.applyDamage(target, event);
    };
    for (const mob of Array.from(this.world.mobs.activeMobs.values())) {
      if (mob.health > 0) hit({ kind: 'mob', id: mob.id }, mob.mobBody.position);
    }
    for (const session of Array.from(this.world.players.values())) {
      if (!session.isDead) hit({ kind: 'player', id: session.characterId }, session.playerBody.position);
    }
    for (const target of this.world.doodads.hurtableTargets()) hit({ kind: 'doodad', id: target.id }, { x: target.x, y: target.y });
  }

  /** The cells that detonated since the last call, then forgets them (all of them; see `takeVisibleDetonations`). */
  public takeDetonations(): GasExplosionCell[] {
    const out = this.detonated;
    this.detonated = [];
    return out;
  }

  /** What to tell clients this tick: the cells that detonated in tiles the fog of war has revealed. */
  public takeVisibleDetonations(): GasExplosionCell[] {
    return this.takeDetonations().filter(([x, y]) => this.world.grid[y]?.[x]?.revealed === true);
  }
}
