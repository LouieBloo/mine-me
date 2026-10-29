import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { InventoryService } from '../../../services/inventory.service';
import { type GameEventResult } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';

/**
 * Handler: mining_exit
 * Extracts from the mine. Saves temporary loot to PostgreSQL inventory. Only allowed at the extraction point on the surface
 * (the sandbox, which saves nothing, may leave from anywhere).
 */
export const handleMiningExit = async (
  io: Server,
  socket: Socket,
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const mayLeave = miningSessionManager.canExit(characterId);
  if (!mayLeave.ok) return { success: false, error: mayLeave.error };

  try {
    const { extractedItems, backpackItems, stashItems, mission } = await miningSessionManager.endSession(characterId);

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
        sol: characterWithInventory.sol,
        lear: characterWithInventory.lear,
      });
    }

    return {
      success: true,
      data: {
        extractedItems,
        backpackItems,
        stashItems,
        ...(mission ? { mission } : {}),
        message: extractedItems.length > 0
          ? `Successfully extracted with ${extractedItems.reduce((sum, i) => sum + i.quantity, 0)} items!`
          : 'You left the mine with nothing.',
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * Handler: mining_client_ready
 * The client has finished loading and is showing the mine. The extractor's landing begins now, so the flight is
 * seen and not played behind the loading screen. Harmless if repeated or sent by a player who is not in a mine.
 */
export const handleMiningClientReady = async (
  io: Server,
  socket: Socket,
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };
  miningSessionManager.getSession(characterId)?.clientReady();
  return { success: true };
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

  // Debug control: amount is client-supplied, so it must be a positive integer (default 1).
  const requested = payload?.amount;
  if (requested !== undefined && (!Number.isInteger(requested) || requested <= 0)) {
    return { success: false, error: 'Invalid vision amount.' };
  }
  const delta = requested ?? 1;
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
