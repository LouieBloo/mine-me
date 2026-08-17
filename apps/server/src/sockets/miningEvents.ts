import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { broadcastStatUpdate } from '../services/characterBroadcast';
import { InventoryService } from '../services/inventory.service';
import {
  type GameEventResult,
  type MiningInputPayload,
  type MiningInteractPayload,
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
  payload?: { forceNew?: boolean },
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
    return { success: false, error: 'Only active characters can enter the mine.' };
  }

  try {
    const engine = miningSessionManager.createSession(
      characterId,
      character.cityId,
      socket,
      payload?.forceNew,
    );
    const sessionState = miningSessionManager.buildClientState(engine);

    console.log(
      `[Mining] ${character.name} entered real-time mine simulation in city ${character.cityId}${
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
    engine.handleInput(payload.input);
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

  const started = engine.startMining(payload.target);
  if (!started) return { success: false, error: 'Cannot mine target block.' };

  return {
    success: true,
    data: {
      isMining: engine.isMining,
      miningTarget: engine.miningTarget,
      miningTimeMs: engine.miningTimeMs,
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

  const placed = engine.placeLadder(payload.target);
  if (!placed) return { success: false, error: 'Cannot place ladder here.' };

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
