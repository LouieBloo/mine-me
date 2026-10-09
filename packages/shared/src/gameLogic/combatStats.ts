import type { GameItem } from '../types';
import type { Vector2D } from '../types/mining';

/**
 * Equipment-derived combat stats. Each is the sum of the matching effect (by effect flag) over the
 * item(s) in question, so new items get stats just by being given the effect in the admin app.
 */

/** Combat stats derived from equipped gear's effects (see CharacterModEngine). */
export interface MiningCombatStats {
  /** Damage per swing to blocks (Tool Damage effect). */
  toolDamage: number;
  /** Damage per hit to mobs (Damage effect). */
  weaponDamage: number;
  /** Hardest block the gear can break (Pick Power effect). */
  pickPower: number;
  /** Melee knockback in tenths of tiles/s (Knockback effect); 0 = default push. */
  knockback: number;
}

type EffectFlag =
  | 'miningSpeedModifier'
  | 'damageModifier'
  | 'toolDamageModifier'
  | 'pickPowerModifier'
  | 'knockbackModifier';

export function sumItemEffect(item: GameItem | null | undefined, flag: EffectFlag): number {
  if (!item || !Array.isArray(item.itemEffects)) return 0;
  let total = 0;
  for (const ie of item.itemEffects) {
    if (ie.effect?.[flag]) total += ie.value || 0;
  }
  return total;
}

/** Damage dealt to blocks per swing. */
export const getItemToolDamageEffect = (item?: GameItem | null): number => sumItemEffect(item, 'toolDamageModifier');

/** Pick power: the hardest block this tool can damage. */
export const getItemPickPowerEffect = (item?: GameItem | null): number => sumItemEffect(item, 'pickPowerModifier');

/** Melee knockback in tenths of tiles/s. */
export const getItemKnockbackEffect = (item?: GameItem | null): number => sumItemEffect(item, 'knockbackModifier');

/** Melee knockback used by weapons without a Knockback effect (4.5 tiles/s sideways). */
export const DEFAULT_MELEE_KNOCKBACK = 45;

/** Upward lift per unit of sideways knockback (matches the original 4.5 / -3.2 push). */
export const KNOCKBACK_LIFT_RATIO = 3.2 / 4.5;

/**
 * Converts a knockback stat (tenths of tiles/s) into an impulse pushing in `direction`
 * (-1 left, 1 right). A non-positive stat falls back to the default push.
 */
export function knockbackImpulse(knockbackTenths: number, direction: 1 | -1): Vector2D {
  const strength = (knockbackTenths > 0 ? knockbackTenths : DEFAULT_MELEE_KNOCKBACK) / 10;
  return { x: direction * strength, y: -strength * KNOCKBACK_LIFT_RATIO };
}

/** True if a tool with `pickPower` can damage a block requiring `requiredPickPower`. */
export function canBreakBlock(pickPower: number, requiredPickPower: number | undefined | null): boolean {
  return pickPower >= (requiredPickPower ?? 0);
}
