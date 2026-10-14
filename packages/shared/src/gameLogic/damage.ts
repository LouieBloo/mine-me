import type { Vector2D } from '../types/mining';

/** What kind of damage this is. A tag for now (sounds, UI, future per-type modifiers). */
export type DamageType = 'melee' | 'ranged' | 'explosive' | 'mining' | 'environmental';

export type DamageSourceKind = 'player' | 'mob' | 'projectile' | 'explosion' | 'environment';

/** Who/what caused the damage. */
export interface DamageSource {
  kind: DamageSourceKind;
  /** The attacking entity's id (character, mob instance, projectile or dynamite id). */
  id?: string;
  name?: string;
  /** The player who owns this source (e.g. who fired a projectile / threw dynamite). */
  ownerId?: string;
  /** Item that caused it (weapon / explosive), when known. */
  itemId?: string;
  position?: Vector2D;
}

/** A single hit, built by whatever caused it and applied through the damage system. */
export interface DamageEvent {
  amount: number;
  type: DamageType;
  source: DamageSource;
  /** Impulse (tiles/s) to apply to the target, if it can be pushed. */
  knockback?: Vector2D;
  /**
   * The hit lands even during the target's post-hit invulnerability window, and does not start a
   * new one (so environmental damage cannot shield a player from a mob hit).
   */
  ignoreInvulnerability?: boolean;
  /**
   * The hit does not interrupt or stun the target (a mob keeps doing what it was doing). For damage that
   * ticks over time, such as burning, which would otherwise stun-lock.
   */
  noStun?: boolean;
}

export type DamageTarget = { kind: 'mob'; id: string } | { kind: 'player'; id: string };

export interface DamageResult {
  /** The hit landed (target exists, is alive, and wasn't immune). */
  applied: boolean;
  /** Damage actually removed from the target's health. */
  dealt: number;
  /** This hit killed the target. */
  killed: boolean;
}

export interface TileDamageResult {
  applied: boolean;
  dealt: number;
  /** Total damage the tile has accumulated (0 once it is destroyed). */
  tileDamage: number;
  /** The tile was mined through by this hit. */
  destroyed: boolean;
}

export const NO_DAMAGE: DamageResult = { applied: false, dealt: 0, killed: false };
export const NO_TILE_DAMAGE: TileDamageResult = { applied: false, dealt: 0, tileDamage: 0, destroyed: false };

export function isValidDamageAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

/**
 * Horizontal-away knockback from a source toward a target.
 * Falls back to `fallbackDir` (-1 | 1) when the two share the same x.
 */
export function knockbackAway(
  sourceX: number,
  targetX: number,
  magnitude: Vector2D,
  fallbackDir: 1 | -1 = 1
): Vector2D {
  const dir = Math.sign(targetX - sourceX) || fallbackDir;
  return { x: dir * magnitude.x, y: magnitude.y };
}

/** Linear speed-based damage rule: nothing at or below `minSpeed`, then `perSpeed` per extra tile/s. */
export interface SpeedDamageRule {
  /** Speed (tiles/s) at or below which no damage is dealt. */
  minSpeed: number;
  /** Damage per tile/s above `minSpeed`. */
  perSpeed: number;
  /** Largest hit this rule can deal; 0 or less means no cap. */
  max: number;
}

/**
 * Damage for something moving at `speed` (tiles/s) when it hits: used by fall damage and falling
 * rocks. Returns 0 for invalid input or a speed that does not exceed the minimum.
 */
export function computeSpeedDamage(speed: number, rule: SpeedDamageRule): number {
  if (!Number.isFinite(speed) || !Number.isFinite(rule.minSpeed) || !Number.isFinite(rule.perSpeed)) return 0;
  if (speed <= rule.minSpeed || rule.perSpeed <= 0) return 0;
  const raw = (speed - rule.minSpeed) * rule.perSpeed;
  const capped = rule.max > 0 ? Math.min(raw, rule.max) : raw;
  return Math.max(0, capped);
}
