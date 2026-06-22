import { prisma } from '../index';
import { InventoryService } from './inventory.service';
import { CharacterService } from './character.service';

export interface LootResult {
  sol: number;
  experience: number;
  items: { itemId: string; quantity: number; itemDetails?: any }[];
}

export class LootService {
  /**
   * Resolves a drop table and returns the Sol, Experience, and Items rewarded.
   * This is a pure mathematical resolution, it does NOT persist to DB.
   */
  public static async resolveDropTable(dropTableId: string): Promise<LootResult> {
    const dt = await prisma.dropTable.findUnique({
      where: { id: dropTableId },
      include: { items: { include: { item: true } } }
    });

    if (!dt) {
      return { sol: 0, experience: 0, items: [] };
    }

    const sol = Math.floor(Math.random() * (dt.solMax - dt.solMin + 1)) + dt.solMin;
    const experience = dt.experience;
    const items: { itemId: string; quantity: number; itemDetails?: any }[] = [];

    for (const entry of dt.items) {
      const roll = Math.random() * 100;
      if (roll <= entry.chance) {
        const quantity = Math.floor(Math.random() * (entry.maxQuantity - entry.minQuantity + 1)) + entry.minQuantity;
        if (quantity > 0) {
          items.push({ itemId: entry.itemId, quantity, itemDetails: entry.item });
        }
      }
    }

    return { sol, experience, items };
  }

  /**
   * Resolves a drop table, persists the loot to the character, and returns the result.
   */
  public static async awardLootToCharacter(characterId: string, dropTableId: string): Promise<LootResult> {
    const loot = await this.resolveDropTable(dropTableId);
    return this.awardLootResultToCharacter(characterId, loot);
  }

  /**
   * Awards a pre-resolved LootResult directly to the character and persists it to the database.
   * Handles Sol, Experience, and Items.
   */
  public static async awardLootResultToCharacter(characterId: string, loot: LootResult): Promise<LootResult> {
    if (loot.sol === 0 && loot.experience === 0 && loot.items.length === 0) {
      return loot;
    }

    // Clone the input to prevent side-effects on original reference
    const finalLoot: LootResult = {
      sol: loot.sol,
      experience: loot.experience,
      items: loot.items.map(item => ({ ...item }))
    };

    // 1. Give Sol
    if (finalLoot.sol > 0) {
      await prisma.character.update({
        where: { id: characterId },
        data: { sol: { increment: finalLoot.sol } }
      });
    }

    // 2. Give Experience
    if (finalLoot.experience > 0) {
      const result = await CharacterService.addExperience(characterId, finalLoot.experience);
      this.mergeLoot(finalLoot, result.levelUpLoot);
    }

    // 3. Give Items
    for (const item of finalLoot.items) {
      const result = await InventoryService.giveItemToCharacter(characterId, item.itemId, item.quantity);
      finalLoot.experience += result.experienceGranted;
      if (result.levelUpLoot) {
        this.mergeLoot(finalLoot, result.levelUpLoot);
      }
    }

    return finalLoot;
  }

  /**
   * Merges loot from a source into an accumulator, deduplicating items by itemId.
   */
  public static mergeLoot(acc: LootResult, loot: LootResult) {
    acc.sol += loot.sol;
    acc.experience += loot.experience;
    for (const item of loot.items) {
      const existing = acc.items.find(i => i.itemId === item.itemId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        acc.items.push({ ...item });
      }
    }
  }
}
