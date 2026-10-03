import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { InventoryService } from '../../../services/inventory.service';
import { type GameEventResult } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';

/**
 * Handler: mining_place_ladder
 * Places a ladder at target position or player's current tile for testing/building.
 */
export const handleMiningPlaceLadder = async (
  io: Server,
  socket: Socket,
  payload: { target?: { x: number; y: number } },
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  // 1. Check if user has a ladder in character inventory
  const characterInventoryLadder = await prisma.inventoryItem.findFirst({
    where: {
      characterId,
      quantity: { gt: 0 },
      item: {
        OR: [
          { subType: { equals: 'LADDER', mode: 'insensitive' } },
          { name: { contains: 'ladder', mode: 'insensitive' } },
        ],
      },
    },
    include: { item: true },
  });

  if (!characterInventoryLadder) {
    return { success: false, error: 'You do not have a ladder to place.' };
  }

  // 2. Validate and place in engine
  const placed = engine.placeLadder(payload.target, characterId);
  if (!placed) return { success: false, error: 'Cannot place ladder here.' };

  // 3. Deduct ladder from inventory
  if (characterInventoryLadder.quantity <= 1) {
    await prisma.inventoryItem.delete({
      where: { id: characterInventoryLadder.id },
    });
  } else {
    await prisma.inventoryItem.update({
      where: { id: characterInventoryLadder.id },
      data: { quantity: { decrement: 1 } },
    });
  }

  const updatedChar = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      inventory: {
        include: {
          item: {
            include: {
              itemEffects: {
                include: {
                  effect: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (updatedChar) {
    const mappedInventory = InventoryService.mapCharacterInventory(updatedChar);
    broadcastStatUpdate(characterId, { inventory: mappedInventory });
  }

  return { success: true };
};

/**
 * Handler: mining_place_torch
 * Places a torch at target position if player has a torch in inventory or temp backpack,
 * and target is within 1 tile of player.
 */
export const handleMiningPlaceTorch = async (
  io: Server,
  socket: Socket,
  payload: { target: { x: number; y: number } },
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  if (!payload?.target) {
    return { success: false, error: 'Target position is required.' };
  }

  // 1. Check if user has a torch in character inventory
  const characterInventoryTorch = await prisma.inventoryItem.findFirst({
    where: {
      characterId,
      quantity: { gt: 0 },
      item: { subType: { equals: 'TORCH', mode: 'insensitive' } },
    },
    include: { item: true },
  });

  if (!characterInventoryTorch) {
    return { success: false, error: 'You do not have a torch to place.' };
  }

  // 2. Validate and place in engine (checks bounds, revealed, <= 1 tile distance)
  const placed = engine.placeTorch(payload.target, characterId);
  if (!placed) {
    return { success: false, error: 'Cannot place torch here (must be within 1 tile on an empty revealed space).' };
  }

  // 3. Deduct torch from inventory
  if (characterInventoryTorch.quantity <= 1) {
    await prisma.inventoryItem.delete({
      where: { id: characterInventoryTorch.id },
    });
  } else {
    await prisma.inventoryItem.update({
      where: { id: characterInventoryTorch.id },
      data: { quantity: { decrement: 1 } },
    });
  }

  const updatedChar = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      inventory: {
        include: {
          item: {
            include: {
              itemEffects: {
                include: {
                  effect: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (updatedChar) {
    const mappedInventory = InventoryService.mapCharacterInventory(updatedChar);
    broadcastStatUpdate(characterId, { inventory: mappedInventory });
  }

  return { success: true };
};
