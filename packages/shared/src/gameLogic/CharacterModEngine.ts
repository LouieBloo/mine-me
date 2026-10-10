import type { GameItem } from '../types';
import { deriveCombatStats } from './entityStats';

export interface CharacterModifications {
  combatScore: number;
  defenseScore: number;
  /** Swing/attack speed. */
  miningSpeed: number;
  /** Damage per swing to blocks (Tool Damage effect). */
  toolDamage: number;
  /** Damage per hit to mobs (Damage effect). */
  weaponDamage: number;
  /** Hardest block this gear can break (Pick Power effect). */
  pickPower: number;
  /** Melee knockback in tenths of tiles/s (Knockback effect); 0 means the default push. */
  knockback: number;
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
      toolDamage: 0,
      weaponDamage: 0,
      pickPower: 0,
      knockback: 0,
    };

    for (const entry of inventoryItems) {
      if (entry.equipped && entry.item.type === 'GEAR') {
        const item = entry.item;
        if (item.combatScore) mods.combatScore += item.combatScore;
        if (item.defenseScore) mods.defenseScore += item.defenseScore;

        const stats = deriveCombatStats(item.itemEffects);
        mods.miningSpeed += stats.miningSpeed;
        mods.toolDamage += stats.toolDamage;
        mods.weaponDamage += stats.weaponDamage;
        mods.pickPower += stats.pickPower;
        mods.knockback += stats.knockback;
      }
    }

    return mods;
  }

  /**
   * Calculates the total attributes of a character, applying modifications to base stats.
   */
  static calculateTotalAttributes<T extends { combatScore: number; defenseScore: number; miningSpeed?: number; toolDamage?: number }>(
    baseAttributes: T,
    mods: CharacterModifications
  ): T & { miningSpeed: number; toolDamage: number } {
    return {
      ...baseAttributes,
      combatScore: baseAttributes.combatScore + mods.combatScore,
      defenseScore: baseAttributes.defenseScore + mods.defenseScore,
      miningSpeed: (baseAttributes.miningSpeed ?? 0) + mods.miningSpeed,
      toolDamage: (baseAttributes.toolDamage ?? 0) + mods.toolDamage,
    };
  }
}

