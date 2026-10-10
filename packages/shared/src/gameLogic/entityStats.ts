import { MINING_CONFIG } from '../types/mining';
import { DEFAULT_MINING_SWING_SPEED } from './miningSpeed';
import { sumEffects, type EffectEntry, type MiningCombatStats } from './combatStats';

/**
 * Stats shared by every entity that can mine and fight (players, mobs, anything added later).
 * They are always derived from Effects (the same Effect table for gear and mobs), never from
 * entity-specific columns, so a new kind of entity only has to supply its effect list.
 */
export interface EntityCombatStats extends MiningCombatStats {
  /** Swing rate stat (Mining Speed effect). 25 = 2 swings per second. 0 = baseline. */
  miningSpeed: number;
}

/** Sums every combat effect in `entries` (e.g. an item's `itemEffects` or a mob's `mobEffects`). */
export function deriveCombatStats(...lists: (readonly EffectEntry[] | null | undefined)[]): EntityCombatStats {
  const entries = lists.flatMap((list) => list ?? []);
  return {
    miningSpeed: sumEffects(entries, 'miningSpeedModifier'),
    toolDamage: sumEffects(entries, 'toolDamageModifier'),
    weaponDamage: sumEffects(entries, 'damageModifier'),
    pickPower: sumEffects(entries, 'pickPowerModifier'),
    knockback: sumEffects(entries, 'knockbackModifier'),
  };
}

/**
 * Swings per second for a Mining Speed stat. A stat of 0 (nothing configured) uses the baseline
 * pickaxe speed, so entities without the effect still swing at a sane rate.
 */
export function swingsPerSecond(miningSpeed: number): number {
  const stat = Number.isFinite(miningSpeed) && miningSpeed > 0 ? miningSpeed : MINING_CONFIG.BASE_PICKAXE_MINING_SPEED;
  return DEFAULT_MINING_SWING_SPEED * (stat / MINING_CONFIG.BASE_PICKAXE_MINING_SPEED);
}

/** State of one entity's swing timer. Players and mobs both embed this shape. */
export interface SwingState {
  /** Seconds until the next swing may start. One timer drives block damage and melee alike. */
  swingCooldown: number;
  /** A swing fired this tick (consumed by block mining and melee). */
  swungThisTick: boolean;
}

/**
 * Advances a swing timer by `dt`. Returns (and records in `swungThisTick`) whether a swing fired.
 * The timer keeps counting while `wantsSwing` is false, so tapping can't beat holding, and at
 * most one tick of time carries over so the long-run rate is exact.
 */
export function advanceSwing(state: SwingState, dt: number, wantsSwing: boolean, miningSpeed: number): boolean {
  state.swungThisTick = false;
  state.swingCooldown = Math.max(-dt, state.swingCooldown - dt);
  if (!wantsSwing || state.swingCooldown > 0) return false;
  state.swungThisTick = true;
  state.swingCooldown += 1 / swingsPerSecond(miningSpeed);
  return true;
}
