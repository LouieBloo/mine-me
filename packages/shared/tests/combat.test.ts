import { describe, it, expect } from 'vitest';
import { calculateDamage, calculateTotalGearDefense } from '../src/gameLogic/combat';
import { PlayerState } from '../src/types';

describe('Combat Game Logic', () => {
  it('should calculate raw damage correctly', () => {
    // Damage = (Weapon Damage - Armor Score) * (1 - (Defense Score / 100)) * (1 - (Potion Score / 100))
    // Weapon: 100, Base Armor of mob: 10 -> mitigation 90
    // Defense Score: 20 (20%) -> mitigation 0.8
    // Potion Defense: 0 -> mitigation 1.0
    // 90 * 0.8 * 1.0 = 72
    const damage = calculateDamage(100, 10, 20, 0);
    expect(damage).toBe(72);
  });

  it('should incorporate potion defense buffs', () => {
    // 100 Weapon - 0 Armor = 100
    // 0 Defense
    // 50 Potion defense (50%) -> mitigation 0.5
    // 100 * 1 * 0.5 = 50
    const damage = calculateDamage(100, 0, 0, 50);
    expect(damage).toBe(50);
  });

  it('should calculate total gear defense from player state', () => {
    const mockPlayer = {
      gear: {
        head: { defenseBonus: 5 },
        chest: { defenseBonus: 10 },
        leggings: { defenseBonus: 7 },
        boots: { defenseBonus: 3 },
      }
    } as unknown as PlayerState;

    const total = calculateTotalGearDefense(mockPlayer);
    expect(total).toBe(25); // 5 + 10 + 7 + 3
  });
});
