import { PlayerState } from '@mine-me/shared';

/**
 * Validates if a player has enough stamina to perform an action.
 */
export function canPerformAction(player: PlayerState, staminaCost: number): boolean {
  if (player.attributes.stamina < staminaCost) {
    return false;
  }
  return true;
}

/**
 * Validates if the given character is legally inside the target city.
 */
export function isPlayerInCity(characterCityId: string, targetCityId: string): boolean {
  return characterCityId === targetCityId;
}

/**
 * Validates if a player has reached the maximum age constraint.
 */
export function isPlayerDeadFromAge(player: PlayerState): boolean {
  return player.attributes.ageInDays >= 36000;
}
