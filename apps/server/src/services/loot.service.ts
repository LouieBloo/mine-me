import { prisma } from '../index';

export interface LootResult {
  sol: number;
  items: { itemId: string; quantity: number; itemDetails?: any }[];
}

export class LootService {
  /**
   * Resolves a drop table and returns the Sol and Items rewarded.
   * This is a pure mathematical resolution, it does NOT persist to DB.
   */
  public static async resolveDropTable(dropTableId: string): Promise<LootResult> {
    const dt = await prisma.dropTable.findUnique({
      where: { id: dropTableId },
      include: { items: { include: { item: true } } }
    });

    if (!dt) {
      return { sol: 0, items: [] };
    }

    const sol = Math.floor(Math.random() * (dt.solMax - dt.solMin + 1)) + dt.solMin;
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

    return { sol, items };
  }

  /**
   * Resolves a drop table, persists the loot to the character, and returns the result.
   */
  public static async awardLootToCharacter(characterId: string, dropTableId: string): Promise<LootResult> {
    const loot = await this.resolveDropTable(dropTableId);

    if (loot.sol === 0 && loot.items.length === 0) {
      return loot;
    }

    // 1. Give Sol
    if (loot.sol > 0) {
      await prisma.character.update({
        where: { id: characterId },
        data: { sol: { increment: loot.sol } }
      });
    }

    // 2. Give Items
    for (const item of loot.items) {
      const existing = await prisma.inventoryItem.findFirst({
        where: { characterId, itemId: item.itemId }
      });

      if (existing) {
        await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: { quantity: { increment: item.quantity } }
        });
      } else {
        await prisma.inventoryItem.create({
          data: {
            characterId,
            itemId: item.itemId,
            quantity: item.quantity
          }
        });
      }
    }

    return loot;
  }
}
