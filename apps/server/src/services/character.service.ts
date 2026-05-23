import { prisma } from '../index';
import { LootService, LootResult } from './loot.service';

export class CharacterService {
  /**
   * Adds experience to a character, checks for level ups, and awards any level-up drop table rewards.
   * Returns a LootResult containing all level-up rewards awarded (if any), and the new experience value.
   */
  public static async addExperience(
    characterId: string,
    amount: number
  ): Promise<{ experience: number; levelUpLoot: LootResult }> {
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    });

    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const oldXp = character.experience;
    const newXp = oldXp + amount;

    // Fetch all configured character levels to evaluate level boundary crossing
    const levels = await prisma.characterLevel.findMany({
      orderBy: { level: 'asc' },
      include: {
        dropTable: true
      }
    });

    // Helper to calculate level from XP based on config
    const getLevelFromXp = (xp: number): number => {
      if (levels.length === 0) return 1;
      if (xp < levels[0].xpRequired) {
        return Math.max(0, levels[0].level - 1);
      }
      for (let i = levels.length - 1; i >= 0; i--) {
        if (xp >= levels[i].xpRequired) {
          return levels[i].level;
        }
      }
      return Math.max(0, levels[0].level - 1);
    };

    const oldLevel = getLevelFromXp(oldXp);
    const newLevel = getLevelFromXp(newXp);

    // Update character's experience
    await prisma.character.update({
      where: { id: characterId },
      data: { experience: newXp }
    });

    const levelUpLoot: LootResult = { sol: 0, experience: 0, items: [] };

    if (newLevel > oldLevel) {
      // Award drop tables for all levels crossed (e.g. if leveling up from 1 to 3, award level 2 and level 3 drops)
      for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
        const levelConfig = levels.find((l: any) => l.level === lvl);
        if (levelConfig?.dropTable) {
          const loot = await LootService.awardLootToCharacter(characterId, levelConfig.dropTable.id);
          LootService.mergeLoot(levelUpLoot, loot);
        }
      }
    }

    return {
      experience: newXp,
      levelUpLoot
    };
  }
}
