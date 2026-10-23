import { BLOCK_SCALE } from '@mine-me/shared';
import { bodyTouchesCell, distanceToCell, heatDamageRate, sampleFluidContact, type BodyBox, type FireDamageRule, type FluidDefinition } from '@mine-me/shared';
import { fireDamageRule } from '../environmentalDamage';
import type { MiningWorld } from '../MiningWorld';

/** Seconds between burn and heat damage hits (the damage in between is added up, so each hit is a whole number). */
export const BURN_TICK_SECONDS = 0.5;
/** Sparks a burning body gives off, as a multiplier on a material's ignition chance (1 = the material's own). */
export const BURNING_BODY_IGNITION_STRENGTH = 1;

type EntityKind = 'player' | 'mob';

interface BurnState {
  /** Seconds of burning left; 0 when only heat is hurting. */
  remaining: number;
  /** Seconds since the last damage hit. */
  sinceHit: number;
  /** Damage earned since the last hit that has not been dealt yet. */
  pending: number;
  /** Name of the fluid that hurt the body since the last hit (the hit is named after it), or null for fire. */
  fluidSource: string | null;
}

/**
 * Fire hurting people and mobs. Two things, both from the fire in the room:
 *   - **Burning:** touching a burning cell sets a body alight for `burnSeconds` (touching again starts the
 *     count over). Burning hurts `burnDamagePerSecond` and sets flammable cells the body is in alight, then
 *     goes out by itself.
 *   - **Heat:** within `heatRadius` of a fire it hurts by that fire's heat, fading with distance (the hottest
 *     fire in reach counts, so a big blaze doesn't add up to instant death).
 *   - **Fluids:** a fluid's `contact` data (lava: damage per second and ignites; water: extinguishes) acts on a
 *     body in it, scaled by how submerged it is. Damage joins the same pending total, so it is dealt in the same hits.
 * The damage is dealt twice a second as one whole-number hit through the damage pipeline, ignoring a player's
 * hit protection (like fall damage) and never stunning a mob. Players and mobs are treated the same.
 */
export class MiningBurningSubsystem {
  private readonly states = new Map<string, BurnState>();

  constructor(private readonly world: MiningWorld) {}

  private static key(kind: EntityKind, id: string): string {
    return `${kind}:${id}`;
  }

  /** Whether this body is on fire right now. */
  public isBurning(kind: EntityKind, id: string): boolean {
    return (this.states.get(MiningBurningSubsystem.key(kind, id))?.remaining ?? 0) > 0;
  }

  /** Sets a body alight (fire contact does this itself; other sources can call it directly). */
  public ignite(kind: EntityKind, id: string): void {
    const rule = fireDamageRule(this.world.mapConfig);
    if (rule.burnSeconds <= 0) return;
    this.state(MiningBurningSubsystem.key(kind, id)).remaining = rule.burnSeconds;
  }

  private state(key: string): BurnState {
    let state = this.states.get(key);
    if (!state) {
      state = { remaining: 0, sinceHit: 0, pending: 0, fluidSource: null };
      this.states.set(key, state);
    }
    return state;
  }

  /** Runs every tick for every body in the room. */
  public update(dt: number): void {
    const rule = fireDamageRule(this.world.mapConfig);
    const live = new Set<string>();

    for (const session of this.world.players.values()) {
      const key = MiningBurningSubsystem.key('player', session.characterId);
      if (session.isDead) {
        this.states.delete(key);
        session.burning = false;
        continue;
      }
      live.add(key);
      const body = session.playerBody;
      session.burning = this.tickBody(key, 'player', session.characterId, boxOf(body), dt, rule);
    }

    for (const mob of this.world.mobs.activeMobs.values()) {
      const key = MiningBurningSubsystem.key('mob', mob.id);
      if (mob.health <= 0 || mob.animationState === 'death') {
        this.states.delete(key);
        mob.burning = false;
        continue;
      }
      live.add(key);
      mob.burning = this.tickBody(key, 'mob', mob.id, boxOf(mob.mobBody), dt, rule);
    }

    // Bodies that left the room take their burning with them
    for (const key of [...this.states.keys()]) if (!live.has(key)) this.states.delete(key);
  }

  /** One tick for one body. Returns whether it is burning afterwards. */
  private tickBody(key: string, kind: EntityKind, id: string, box: BodyBox, dt: number, rule: FireDamageRule): boolean {
    const fire = this.world.fire.grid;
    const hasFire = fire.burningCount > 0;
    let state = this.states.get(key);

    const wet = this.fluidContactOf(box);
    const effects = wet?.definition.contact ?? null;
    const extinguished = effects?.extinguishes === true;
    const fluidDamage = (effects?.damagePerSecond ?? 0) * (wet?.submerged ?? 0);

    if (extinguished) {
      // Water puts a burning body out, and nothing can set it alight while it is in the water
      if (state) state.remaining = 0;
    } else if (rule.burnSeconds > 0) {
      const lit = (hasFire && this.touchesFire(box)) || ((effects?.ignites ?? 0) > 0 && (wet?.submerged ?? 0) > 0);
      if (lit) {
        state = this.state(key);
        state.remaining = rule.burnSeconds;
      }
    }

    const burning = (state?.remaining ?? 0) > 0;
    const heat = hasFire ? this.heatRateAt(box, rule) : 0;
    if (!burning && heat <= 0 && fluidDamage <= 0 && (state?.pending ?? 0) <= 0) {
      if (state) this.states.delete(key);
      return false;
    }

    state = this.state(key);
    state.pending += ((burning ? rule.burnDamagePerSecond : 0) + heat + fluidDamage) * dt;
    if (fluidDamage > 0 && wet) state.fluidSource = wet.definition.name;
    state.sinceHit += dt;
    // (a hair under, because a half second of 1/30 s ticks adds up to just short of 0.5)
    if (state.sinceHit >= BURN_TICK_SECONDS - 1e-6) {
      state.sinceHit = 0;
      const amount = Math.floor(state.pending);
      if (amount >= 1) {
        state.pending -= amount;
        this.hurt(kind, id, amount, state.fluidSource ?? 'Fire');
      }
      state.fluidSource = null;
    }

    if (burning) {
      // A body on fire sets alight what it is standing in
      this.world.ignition.emit(box.x, box.y, Math.max(box.halfWidth, box.halfHeight) + 0.2 * BLOCK_SCALE, BURNING_BODY_IGNITION_STRENGTH);
      state.remaining = Math.max(0, state.remaining - dt);
    }
    return state.remaining > 0;
  }

  /**
   * How much damage per second a box takes from its surroundings right now: standing in fire, the heat of a fire nearby, and
   * a harmful fluid it is in. For things that are hurt like a body but are not one (the conveyor belt).
   */
  public hazardRate(box: BodyBox): number {
    const rule = fireDamageRule(this.world.mapConfig);
    const hasFire = this.world.fire.grid.burningCount > 0;
    const wet = this.fluidContactOf(box);
    const fluid = (wet?.definition.contact?.damagePerSecond ?? 0) * (wet?.submerged ?? 0);
    const direct = hasFire && this.touchesFire(box) ? rule.burnDamagePerSecond : 0;
    const heat = hasFire ? this.heatRateAt(box, rule) : 0;
    return direct + heat + fluid;
  }

  /** The fluid a body is standing in (the deepest one) with its definition, or null when dry. */
  private fluidContactOf(box: BodyBox): { definition: FluidDefinition; submerged: number } | null {
    const fluids = this.world.fluids;
    const contact = sampleFluidContact(fluids.grid, box.x, box.y, box.halfWidth, box.halfHeight);
    if (!contact) return null;
    const key = fluids.registry.keyOf(contact.fluidId);
    const definition = key ? this.world.data.getFluid(key) : undefined;
    return definition ? { definition, submerged: contact.submerged } : null;
  }

  private touchesFire(box: BodyBox): boolean {
    const fire = this.world.fire.grid;
    const x0 = Math.floor(box.x - box.halfWidth);
    const x1 = Math.floor(box.x + box.halfWidth);
    const y0 = Math.floor(box.y - box.halfHeight);
    const y1 = Math.floor(box.y + box.halfHeight);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (fire.isBurning(x, y) && bodyTouchesCell(box, x, y)) return true;
      }
    }
    return false;
  }

  /** Heat damage per second at a body: the hottest fire within the heat radius. */
  private heatRateAt(box: BodyBox, rule: FireDamageRule): number {
    if (!(rule.heatRadius > 0) || !(rule.heatDamagePerSecond > 0)) return 0;
    const fire = this.world.fire.grid;
    const reach = Math.ceil(rule.heatRadius);
    let best = 0;
    for (let y = Math.floor(box.y - box.halfHeight) - reach; y <= Math.floor(box.y + box.halfHeight) + reach; y++) {
      for (let x = Math.floor(box.x - box.halfWidth) - reach; x <= Math.floor(box.x + box.halfWidth) + reach; x++) {
        if (!fire.isBurning(x, y)) continue;
        const heat = this.world.ignition.flammabilityAt(x, y)?.heat ?? 0;
        best = Math.max(best, heatDamageRate(heat, distanceToCell(box, x, y), rule));
      }
    }
    return best;
  }

  private hurt(kind: EntityKind, id: string, amount: number, sourceName: string): void {
    this.world.damage.applyDamage(
      { kind, id },
      { amount, type: 'environmental', source: { kind: 'environment', name: sourceName }, ignoreInvulnerability: true, noStun: true }
    );
  }
}

function boxOf(body: { position: { x: number; y: number }; halfWidth: number; halfHeight: number }): BodyBox {
  return { x: body.position.x, y: body.position.y, halfWidth: body.halfWidth, halfHeight: body.halfHeight };
}
