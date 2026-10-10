import { MINING_CONFIG } from '../types/mining';

/**
 * Damage an explosion deals at `distance` from its centre: full damage at the centre, falling
 * linearly to `minFraction` of it at the edge of `radius`, and nothing beyond.
 */
export function blastDamageAt(
  distance: number,
  radius: number,
  baseDamage: number,
  minFraction: number = MINING_CONFIG.EXPLOSION_MIN_DAMAGE_FRACTION
): number {
  if (!(radius > 0) || !(baseDamage > 0) || !Number.isFinite(distance) || distance > radius) return 0;
  const t = Math.max(0, distance) / radius;
  const fraction = 1 - (1 - minFraction) * t;
  return baseDamage * fraction;
}
