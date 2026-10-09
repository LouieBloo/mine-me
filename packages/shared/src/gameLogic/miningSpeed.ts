import type { GameItem } from '../types';
import { MINING_CONFIG } from '../types/mining';
import { getItemToolDamageEffect } from './combatStats';

/**
 * Baseline mining swing speed (swings per second)
 * calculated from the hit rate on reference dirt tile with standard base pickaxe.
 */
export const DEFAULT_MINING_SWING_SPEED =
  (MINING_CONFIG.DAMAGE_STAGES * 1000 * (MINING_CONFIG.BASE_PICKAXE_MINING_SPEED / 100)) /
  MINING_CONFIG.DIRT_MINE_TIME_MS; // 2.0 swings/sec (500ms cycle)

/**
 * Baseline mining damage per swing (HP per hit).
 */
export const DEFAULT_MINING_DAMAGE = 25;

/**
 * Extracts the total mining speed modifier value from an item's attached effects.
 */
export function getItemMiningSpeedEffect(item?: GameItem | null): number {
  if (!item || !item.itemEffects || !Array.isArray(item.itemEffects)) return 0;
  let total = 0;
  for (const ie of item.itemEffects) {
    if (ie.effect?.miningSpeedModifier) {
      total += ie.value || 0;
    }
  }
  return total;
}

/**
 * Extracts the total weapon damage (Damage effect) from an item's attached effects.
 * This is what a weapon deals to mobs, by melee or by projectile. Damage to blocks is the
 * separate Tool Damage effect (see `getItemToolDamageEffect`).
 */
export function getItemDamageEffect(item?: GameItem | null): number {
  if (!item || !item.itemEffects || !Array.isArray(item.itemEffects)) return 0;
  let total = 0;
  for (const ie of item.itemEffects) {
    if (ie.effect?.damageModifier) {
      total += ie.value || 0;
    }
  }
  return total;
}

/**
 * Calculates effective damage to blocks per swing (tool damage), checking the tool and character mods.
 */
export function calculateEffectiveMiningDamage(
  weapon?: GameItem | null,
  characterMiningDamage?: number
): number {
  if (typeof characterMiningDamage === 'number' && characterMiningDamage > 0) {
    return characterMiningDamage;
  }
  const toolDamage = getItemToolDamageEffect(weapon);
  if (toolDamage > 0) {
    return toolDamage;
  }
  return DEFAULT_MINING_DAMAGE;
}

/**
 * Calculates the effective mining swing speed (swings per second)
 * based on the mining speed effects attached to the tool/item and character.
 *
 * Grounded in the game engine's mining mechanics:
 * - Server accumulates damage: damageRate = 1000 * (miningSpeed / 100) ms/s
 * - Damage per crack stage on reference dirt tile: DIRT_MINE_TIME_MS / DAMAGE_STAGES = 500 / 4 = 125 ms
 * - Hits per second on reference tile: (1000 * (miningSpeed / 100)) / (DIRT_MINE_TIME_MS / DAMAGE_STAGES)
 *   For miningSpeed 25: (1000 * 0.25) / (500 / 4) = 250 / 125 = 2.0 swings/sec (500ms cycle)
 *
 * @param weapon The equipped weapon/tool GameItem (if any)
 * @param characterMiningSpeed The player's total mining speed attribute (e.g. 25)
 * @returns Effective swings per second (e.g. 2.0 for 25 speed, clamped to [MIN_SWING_SPEED, MAX_SWING_SPEED])
 */
export function calculateEffectiveSwingSpeed(
  weapon?: GameItem | null,
  characterMiningSpeed?: number
): number {
  let speedStat = 0;
  if (typeof characterMiningSpeed === 'number' && characterMiningSpeed > 0) {
    speedStat = characterMiningSpeed;
  } else {
    const weaponSpeed = getItemMiningSpeedEffect(weapon);
    if (weaponSpeed > 0) {
      speedStat = weaponSpeed;
    }
  }

  // If no mining speed attribute or tool modifier found, fall back to base tool speed
  if (speedStat <= 0) {
    speedStat = MINING_CONFIG.BASE_PICKAXE_MINING_SPEED;
  }

  // Damage stage hit rate on the reference tile (Dirt)
  const damagePerStage = MINING_CONFIG.DIRT_MINE_TIME_MS / MINING_CONFIG.DAMAGE_STAGES;
  const damageRatePerSecond = 1000 * (speedStat / 100);
  const hitsPerSecond = damageRatePerSecond / damagePerStage;

  return Math.min(
    MINING_CONFIG.MAX_SWING_SPEED,
    Math.max(MINING_CONFIG.MIN_SWING_SPEED, hitsPerSecond)
  );
}
