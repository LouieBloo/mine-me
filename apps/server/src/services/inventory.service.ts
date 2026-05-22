import { prisma } from '../index';

export class InventoryService {
  /**
   * Awards an item to a character, persists it to the database,
   * and awards experience associated with the item to the character.
   * Returns the quantity given and experience points granted.
   */
  public static async giveItemToCharacter(
    characterId: string,
    itemId: string,
    quantity: number
  ): Promise<{ quantity: number; experienceGranted: number; itemDetails: any }> {
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

    // 2. Give Experience to Character
    if (experienceGranted > 0) {
      await prisma.character.update({
        where: { id: characterId },
        data: {
          experience: { increment: experienceGranted }
        }
      });
    }

    return {
      quantity,
      experienceGranted,
      itemDetails: item
    };
  }
}
