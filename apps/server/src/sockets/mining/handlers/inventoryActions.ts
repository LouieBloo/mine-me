import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { InventoryService } from '../../../services/inventory.service';

/**
 * Atomically consumes `quantity` of an inventory row. Returns false (and changes nothing)
 * if the character no longer has enough, so concurrent requests can never consume the
 * same item twice. Rows that reach zero are removed.
 */
export async function consumeInventoryItem(
  characterId: string,
  inventoryItemId: string,
  quantity = 1
): Promise<boolean> {
  const res = await prisma.inventoryItem.updateMany({
    where: { id: inventoryItemId, characterId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (res.count !== 1) return false;

  await prisma.inventoryItem.deleteMany({
    where: { id: inventoryItemId, characterId, quantity: { lte: 0 } },
  });
  return true;
}

/** Returns previously consumed items to a character (used when the action fails after consuming). */
export async function refundInventoryItem(
  characterId: string,
  itemId: string,
  quantity = 1
): Promise<void> {
  const res = await prisma.inventoryItem.updateMany({
    where: { characterId, itemId },
    data: { quantity: { increment: quantity } },
  });
  if (res.count === 0) {
    await prisma.inventoryItem.create({ data: { characterId, itemId, quantity } });
  }
}

/** Reloads the character's inventory and pushes it to the client. */
export async function broadcastInventory(characterId: string): Promise<void> {
  const updatedChar = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      inventory: {
        include: {
          item: {
            include: {
              itemEffects: {
                include: { effect: true },
              },
            },
          },
        },
      },
    },
  });

  if (updatedChar) {
    broadcastStatUpdate(characterId, { inventory: InventoryService.mapCharacterInventory(updatedChar) });
  }
}
