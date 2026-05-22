export interface StaminaCharacterInput {
  stamina: number;
  maxStamina: number;
  class?: string;
  profession?: string | null;
  [key: string]: any;
}

/**
 * Gets the amount of stamina recovered per day of resting.
 * Currently defaults to 25.
 * Easy to extend in the future to account for character attributes, gear, class, etc.
 */
export const getStaminaRecoveryPerDay = (_char: StaminaCharacterInput): number => {
  let recovery = 25;

  // Future upgrades/gear modifier checks can go here:
  // e.g., if (char.class === 'Warrior') recovery += 5;

  return recovery;
};

/**
 * Calculates how many days of rest are needed to reach full stamina,
 * along with the total stamina that will be recovered.
 * 
 * @returns { daysNeeded: number; staminaRecovered: number }
 */
export const calculateRestDaysToFull = (
  char: StaminaCharacterInput
): { daysNeeded: number; staminaRecovered: number } => {
  const currentStamina = char.stamina;
  const maxStamina = char.maxStamina;

  if (currentStamina >= maxStamina) {
    return { daysNeeded: 0, staminaRecovered: 0 };
  }

  const recoveryPerDay = getStaminaRecoveryPerDay(char);
  if (recoveryPerDay <= 0) {
    return { daysNeeded: 0, staminaRecovered: 0 };
  }

  const missingStamina = maxStamina - currentStamina;
  const daysNeeded = Math.ceil(missingStamina / recoveryPerDay);
  const staminaRecovered = Math.min(missingStamina, daysNeeded * recoveryPerDay);

  return { daysNeeded, staminaRecovered };
};
