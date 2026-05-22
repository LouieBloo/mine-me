import { describe, it, expect } from 'vitest';
import { getStaminaRecoveryPerDay, calculateRestDaysToFull } from './stamina';

describe('stamina recovery utilities', () => {
  describe('getStaminaRecoveryPerDay', () => {
    it('returns the default of 25 stamina per day', () => {
      const char = { stamina: 10, maxStamina: 100 };
      expect(getStaminaRecoveryPerDay(char)).toBe(25);
    });
  });

  describe('calculateRestDaysToFull', () => {
    it('returns 0 days and 0 recovery if stamina is already full', () => {
      const char = { stamina: 100, maxStamina: 100 };
      expect(calculateRestDaysToFull(char)).toEqual({ daysNeeded: 0, staminaRecovered: 0 });
    });

    it('returns correct days and recovery for a simple division (e.g. missing 50 stamina)', () => {
      const char = { stamina: 50, maxStamina: 100 };
      expect(calculateRestDaysToFull(char)).toEqual({ daysNeeded: 2, staminaRecovered: 50 });
    });

    it('ceils the days needed if division has a remainder (e.g. missing 10 stamina)', () => {
      const char = { stamina: 90, maxStamina: 100 };
      expect(calculateRestDaysToFull(char)).toEqual({ daysNeeded: 1, staminaRecovered: 10 });
    });

    it('ceils the days needed correctly for non-multiple (e.g. missing 30 stamina)', () => {
      const char = { stamina: 70, maxStamina: 100 };
      expect(calculateRestDaysToFull(char)).toEqual({ daysNeeded: 2, staminaRecovered: 30 });
    });

    it('correctly handles larger stamina capacities', () => {
      const char = { stamina: 50, maxStamina: 200 };
      // missing 150 stamina → 150 / 25 = 6 days
      expect(calculateRestDaysToFull(char)).toEqual({ daysNeeded: 6, staminaRecovered: 150 });
    });
  });
});
