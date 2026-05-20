import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { broadcastStatUpdate } from '../services/characterBroadcast';
import type { GameEventResult } from '@nvg/shared';

const MINING_STAMINA_COST = 25;

const RARITY_CHANCES: Record<string, number> = {
  LOW: 50,       // 50% chance
  MEDIUM: 25,    // 25% chance
  RARE: 10,      // 10% chance
  VERY_RARE: 3,  // 3% chance
};

/**
 * Handler: mine
 *
 * Processes a single mining action in the character's current city.
 * - Costs 25 stamina per action.
 * - Determines dropped materials based on the city's available materials and their rarity.
 * - Adds dropped materials to character inventory.
 * - Emits 'combat_loot' socket event to show notifications on the client.
 * - Broadcasts character stat updates (stamina, inventory) via user and character channels.
 */
export const handleMine = async (
  io: Server,
  socket: Socket
): Promise<GameEventResult> => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character || character.userId !== userId) {
    return { success: false, error: 'Character not found or forbidden.' };
  }

  if (character.status !== 'ACTIVE') {
    return { success: false, error: 'Only active characters can mine.' };
  }

  if (character.stamina < MINING_STAMINA_COST) {
    return { success: false, error: 'Not enough stamina to mine. Please rest.' };
  }

  // Fetch materials available in this city
  const cityMaterials = await prisma.cityMaterial.findMany({
    where: { cityId: character.cityId },
    include: { item: true },
  });

  const rewards: { itemId: string; quantity: number; itemDetails?: any }[] = [];

  for (const cm of cityMaterials) {
    const chance = RARITY_CHANCES[cm.item.rarity] ?? 50;
    const roll = Math.random() * 100;
    if (roll <= chance) {
      rewards.push({
        itemId: cm.itemId,
        quantity: 1,
        itemDetails: {
          id: cm.item.id,
          name: cm.item.name,
          description: cm.item.description,
          type: cm.item.type,
          subType: cm.item.subType,
          priceSol: cm.item.vendorSellPrice,
          rarity: cm.item.rarity,
          iconUrl: cm.item.iconUrl,
          gearImageUrl: cm.item.gearImageUrl,
          isStartingPiece: cm.item.isStartingPiece,
        },
      });
    }
  }

  // Deduct stamina and save character changes
  const updatedCharacter = await prisma.character.update({
    where: { id: characterId },
    data: {
      stamina: { decrement: MINING_STAMINA_COST },
    },
  });

  // Save rewards to database
  for (const reward of rewards) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { characterId, itemId: reward.itemId },
    });

    if (existing) {
      await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: reward.quantity } },
      });
    } else {
      await prisma.inventoryItem.create({
        data: {
          characterId,
          itemId: reward.itemId,
          quantity: reward.quantity,
        },
      });
    }
  }

  // Retrieve full updated character inventory to sync client state
  const characterWithInventory = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      inventory: {
        include: {
          item: true,
        },
      },
    },
  });

  if (!characterWithInventory) {
    return { success: false, error: 'Failed to retrieve updated inventory.' };
  }

  const clientInventory = {
    slots: characterWithInventory.maxInventorySlots,
    items: characterWithInventory.inventory.map((inv) => ({
      item: {
        id: inv.item.id,
        name: inv.item.name,
        description: inv.item.description,
        type: inv.item.type as any,
        subType: inv.item.subType as any,
        priceSol: inv.item.vendorSellPrice,
        rarity: inv.item.rarity as any,
        iconUrl: inv.item.iconUrl,
        gearImageUrl: inv.item.gearImageUrl,
        isStartingPiece: inv.item.isStartingPiece,
      },
      quantity: inv.quantity,
    })),
  };

  // Broadcast stat update
  broadcastStatUpdate(characterId, {
    stamina: updatedCharacter.stamina,
  });

  // Push character stat update with updated inventory to this user
  io.to(`user:${userId}`).emit('character_stat_update', {
    stamina: updatedCharacter.stamina,
    inventory: clientInventory,
  });

  // Emit 'combat_loot' socket event if items were found so they display as standard loot popups
  if (rewards.length > 0) {
    socket.emit('combat_loot', {
      sol: 0,
      experience: 0,
      items: rewards,
    });
  }

  console.log(
    `[Mining] ${character.name} mined in city ${character.cityId}. ` +
    `Stamina: ${updatedCharacter.stamina}, Rewards: ${rewards.map(r => r.itemDetails.name).join(', ') || 'None'}`
  );

  return {
    success: true,
    data: {
      stamina: updatedCharacter.stamina,
      rewards: rewards.map((r) => ({
        id: r.itemId,
        name: r.itemDetails.name,
        description: r.itemDetails.description,
        rarity: r.itemDetails.rarity,
        quantity: r.quantity,
      })),
    },
  };
};
