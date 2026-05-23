import { prisma } from '../index';
import { CharacterService } from './character.service';
import { LootResult } from './loot.service';

export class InventoryService {
  /**
   * Awards an item to a character, persists it to the database,
   * and awards experience associated with the item to the character.
   * Returns the quantity given, experience points granted, and any level-up loot.
   */
  public static async giveItemToCharacter(
    characterId: string,
    itemId: string,
    quantity: number
  ): Promise<{ quantity: number; experienceGranted: number; itemDetails: any; levelUpLoot?: LootResult }> {
    const item = await prisma.item.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    const experienceGranted = (item.experience || 0) * quantity;

    // 1. Give Item to Character Inventory
    const existing = await prisma.inventoryItem.findFirst({
      where: { characterId, itemId }
    });

    if (existing) {
      await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } }
      });
    } else {
      await prisma.inventoryItem.create({
        data: {
          characterId,
          itemId,
          quantity
        }
      });
    }

    let levelUpLoot: LootResult | undefined = undefined;

    // 2. Give Experience to Character
    if (experienceGranted > 0) {
      const result = await CharacterService.addExperience(characterId, experienceGranted);
      levelUpLoot = result.levelUpLoot;
    }

    return {
      quantity,
      experienceGranted,
      itemDetails: item,
      levelUpLoot
    };
  }
}
