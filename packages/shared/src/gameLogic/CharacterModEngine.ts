import type { GameItem } from '../types';

export interface CharacterModifications {
  combatScore: number;
  defenseScore: number;
  miningSpeed: number;
}

export class CharacterModEngine {
  /**
   * Returns all modifications granted by the character's currently equipped gear.
   */
  static getModifications(inventoryItems: { item: GameItem; equipped?: boolean }[]): CharacterModifications {
    const mods: CharacterModifications = {
      combatScore: 0,
      defenseScore: 0,
      miningSpeed: 0,
    };

    for (const entry of inventoryItems) {
      if (entry.equipped && entry.item.type === 'GEAR') {
        const item = entry.item;
        if (item.combatScore) mods.combatScore += item.combatScore;
        if (item.defenseScore) mods.defenseScore += item.defenseScore;

        if (item.itemEffects && Array.isArray(item.itemEffects)) {
          for (const ie of item.itemEffects) {
            if (ie.effect?.miningSpeedModifier) {
              mods.miningSpeed += ie.value || 0;
            }
          }
        }
      }
    }

    return mods;
  }

  /**
   * Calculates the total attributes of a character, applying modifications to base stats.
   */
  static calculateTotalAttributes<T extends { combatScore: number; defenseScore: number; miningSpeed?: number }>(
    baseAttributes: T,
    mods: CharacterModifications
  ): T & { miningSpeed: number } {
    return {
      ...baseAttributes,
      combatScore: baseAttributes.combatScore + mods.combatScore,
      defenseScore: baseAttributes.defenseScore + mods.defenseScore,
      miningSpeed: (baseAttributes.miningSpeed ?? 0) + mods.miningSpeed,
    };
  }
}

