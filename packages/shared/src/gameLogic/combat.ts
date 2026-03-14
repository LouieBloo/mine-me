import type { PlayerState } from '../types';

/**
 * Calculates the total damage an entity takes in combat.
 * Equation based on PRD: Damage = (Weapon Damage - Armor Score) * (1 - (Defense Score / 100)) * (1 - (Potion Score / 100))
 */
export function calculateDamage(
  weaponDamage: number,
  baseArmorScore: number,
  defenseScore: number,
  potionDefenseScore: number
): number {
  const armorMitigation = Math.max(0, weaponDamage - baseArmorScore);
  const defenseMitigation = 1 - (defenseScore / 100);
  const potionMitigation = 1 - (potionDefenseScore / 100);

  const rawDamage = armorMitigation * defenseMitigation * potionMitigation;
  return Math.max(0, Math.floor(rawDamage));
}

/**
 * Gets the total defense score from a player's current gear.
 */
export function calculateTotalGearDefense(player: PlayerState): number {
  let total = 0;
  if (player.gear.head) total += player.gear.head.defenseBonus;
  if (player.gear.chest) total += player.gear.chest.defenseBonus;
  if (player.gear.leggings) total += player.gear.leggings.defenseBonus;
  if (player.gear.boots) total += player.gear.boots.defenseBonus;
  return total;
}
