import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { broadcastStatUpdate } from '../services/characterBroadcast';
import { InventoryService } from '../services/inventory.service';
import {
  type GameEventResult,
  type MiningInputPayload,
  type MiningInteractPayload,
  CharacterModEngine,
} from '@mine-me/shared';
import { miningSessionManager } from '../services/mining/MiningSessionManager';

// ============================================================================
// Real-Time 30 Hz Mining Mini-Game Event Handlers
// ============================================================================

/**
 * Handler: mining_start
 * Begins a new real-time mining session for the character.
 */
export const handleMiningStart = async (
  io: Server,
  socket: Socket,
  payload?: { forceNew?: boolean; mode?: 'singleplayer' | 'multiplayer' },
): Promise<GameEventResult> => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const character = await prisma.character.findUnique({
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

  if (!character || character.userId !== userId) {
    return { success: false, error: 'Character not found or forbidden.' };
  }

  if (character.status !== 'ACTIVE') {
    return { success: false, error: 'Only active characters can enter the mine.' };
  }

  try {
    const clientInventory = InventoryService.mapCharacterInventory(character);
    const mods = CharacterModEngine.getModifications(clientInventory.items);

    // Extract equipped gear layers for remote rendering
    const gearLayers = character.inventory
      .filter((inv) => inv.item.type === 'GEAR' && inv.item.gearImageUrl && inv.equipped)
      .map((inv) => ({
        url: inv.item.gearImageUrl!,
        subType: inv.item.subType as any,
      }));

    // Ensure client has latest authoritative inventory upon entering mine
    broadcastStatUpdate(characterId, { inventory: clientInventory });

    const mode = payload?.mode ?? 'singleplayer';
    const engine = miningSessionManager.createSession(
      characterId,
      character.cityId,
      socket,
      payload?.forceNew,
      mods.miningSpeed,
      mode,
      character.name,
      gearLayers,
    );
    const sessionState = miningSessionManager.buildClientState(engine, characterId);

    console.log(
      `[Mining] ${character.name} entered real-time mine (${mode}) in city ${character.cityId} with speed ${mods.miningSpeed}${
        payload?.forceNew ? ' (fresh session)' : ''
      }`,
    );

    return {
      success: true,
      data: { sessionState },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Handler: mining_input
 * Continuous real-time movement and input vector sent from client.
 */
export const handleMiningInput = async (
  io: Server,
  socket: Socket,
  payload: MiningInputPayload,
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  if (payload.input) {
    engine.handleInput(characterId, payload.input);
  }

  return { success: true };
};

/**
 * Handler: mining_interact
 * Triggers mining interaction on a target block.
 */
export const handleMiningInteract = async (
  io: Server,
  socket: Socket,
  payload: MiningInteractPayload,
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  if (!payload.target) return { success: false, error: 'Invalid target.' };

  const started = engine.startMining(payload.target, characterId);
  if (!started) return { success: false, error: 'Cannot mine target block.' };

  const session = engine.getPlayer(characterId);

  return {
    success: true,
    data: {
      isMining: session?.isMining ?? engine.isMining,
      miningTarget: session?.miningTarget ?? engine.miningTarget,
      miningTimeMs: session?.miningTimeMs ?? engine.miningTimeMs,
    },
  };
};

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

/**
 * Handler: mining_throw_dynamite
 * Throws a dynamite towards target position if player has dynamite in inventory.
 * Authoritative: Deducts 1 dynamite, creates physics entity with 4s fuse,
 * and starts countdown on server.
 */
export const handleMiningThrowDynamite = async (
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

  // 1. Check if user has dynamite in character inventory
  const characterInventoryDynamite = await prisma.inventoryItem.findFirst({
    where: {
      characterId,
      quantity: { gt: 0 },
      item: { subType: { equals: 'DYNAMITE', mode: 'insensitive' } },
    },
    include: { item: true },
  });

  if (!characterInventoryDynamite) {
    return { success: false, error: 'You do not have any dynamite to throw.' };
  }

  // 2. Launch dynamite in server engine (calculates throw trajectory & starts 4s fuse)
  const thrown = engine.throwDynamite(characterId, payload.target);
  if (!thrown) {
    return { success: false, error: 'Failed to throw dynamite.' };
  }

  // 3. Deduct dynamite from character inventory
  if (characterInventoryDynamite.quantity <= 1) {
    await prisma.inventoryItem.delete({
      where: { id: characterInventoryDynamite.id },
    });
  } else {
    await prisma.inventoryItem.update({
      where: { id: characterInventoryDynamite.id },
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
 * Handler: mining_exit
 * Extracts from the mine. Saves temporary loot to PostgreSQL inventory.
 */
export const handleMiningExit = async (
  io: Server,
  socket: Socket,
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  try {
    const { extractedItems } = await miningSessionManager.endSession(characterId);

    const characterWithInventory = await prisma.character.findUnique({
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

    if (characterWithInventory) {
      const clientInventory = InventoryService.mapCharacterInventory(characterWithInventory);
      broadcastStatUpdate(characterId, {
        inventory: clientInventory,
      });
    }

    return {
      success: true,
      data: {
        extractedItems,
        message: extractedItems.length > 0
          ? `Successfully extracted with ${extractedItems.reduce((sum, i) => sum + i.quantity, 0)} items!`
          : 'You left the mine with nothing.',
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Handler: mining_cancel
 * Explicitly cancels/abandons the mining session when the user leaves or navigates away.
 */
export const handleMiningCancel = async (
  io: Server,
  socket: Socket,
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  miningSessionManager.cancelSession(characterId);
  console.log(`[Mining] Cancelled and stopped real-time session for character ${characterId}`);
  return { success: true };
};

/**
 * Handler: mining_increase_vision
 * Increases the player's view distance temporarily for this mining game session,
 * and immediately reveals newly uncovered surrounding tiles.
 */
export const handleMiningIncreaseVision = async (
  io: Server,
  socket: Socket,
  payload?: { amount?: number }
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  const delta = typeof payload?.amount === 'number' && payload.amount > 0 ? payload.amount : 1;
  const newVision = engine.increaseVisionRange(characterId, delta);

  return {
    success: true,
    data: {
      visionRange: newVision,
    },
  };
};

/**
 * Clean up mining session on disconnect.
 */
export const cleanupMiningSession = async (characterId: string): Promise<void> => {
  try {
    miningSessionManager.cancelSession(characterId);
    console.log(`[Mining] Cleaned up real-time session for character ${characterId} (disconnect)`);
  } catch (err) {
    // Silently ignore
  }
};
