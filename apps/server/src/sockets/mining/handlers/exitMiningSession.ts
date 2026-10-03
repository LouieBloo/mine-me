import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { InventoryService } from '../../../services/inventory.service';
import { type GameEventResult } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';

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
        sol: characterWithInventory.sol,
        lear: characterWithInventory.lear,
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
