import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { broadcastStatUpdate } from '../services/characterBroadcast';
import { InventoryService } from '../services/inventory.service';
import {
  MINING_CONFIG,
  type GameEventResult,
  type MiningMovePayload,
  type MiningMineStartPayload,
  type MiningMineCompletePayload,
} from '@mine-me/shared';
import {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  processMove,
  startMining,
  completeMining,
  extractFromMine,
  buildClientState,
} from '../services/miningSession.service';
import { getTargetPosition, isInBounds } from '../services/miningMap.service';

// ============================================================================
// Mining Mini-Game Event Handlers
//
// Each handler is registered in gameEvents.ts and dispatched via the
// game_event socket channel. Sessions are stored in Redis.
// ============================================================================

/**
 * Handler: mining_start
 * Begins a new mining session in the character's current city.
 */
export const handleMiningStart = async (
  io: Server,
  socket: Socket,
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
    const sessionState = await createSession(characterId, character.cityId);

    console.log(`[Mining] ${character.name} entered the mine in city ${character.cityId}`);

    return {
      success: true,
      data: { sessionState },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Handler: mining_move
 * Moves the player one tile in a cardinal direction.
 */
export const handleMiningMove = async (
  io: Server,
  socket: Socket,
  payload: MiningMovePayload,
): Promise<GameEventResult> => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const session = await getSession(characterId);
  if (!session) {
    return { success: false, error: 'No active mining session.' };
  }

  // Block movement while mining
  if (session.pendingAction) {
    return { success: false, error: 'Cannot move while mining.' };
  }

  const { direction } = payload;
  if (!direction || !['up', 'down', 'left', 'right'].includes(direction)) {
    return { success: false, error: 'Invalid direction.' };
  }

  const target = getTargetPosition(session.position, direction);

  if (!isInBounds(target.x, target.y)) {
    return { success: false, error: 'Cannot move out of bounds.' };
  }

  try {
    const result = await processMove(session, target.x, target.y);

    // Apply damage if player was crushed by a rock
    if (result.damageTaken > 0) {
      const updatedCharacter = await prisma.character.update({
        where: { id: characterId },
        data: {
          health: { decrement: result.damageTaken },
        },
      });

      broadcastStatUpdate(characterId, {
        health: updatedCharacter.health,
      });

      // Check if character died
      if (updatedCharacter.health <= 0) {
        await deleteSession(characterId);
        return {
          success: true,
          data: {
            sessionState: null,
            damageTaken: result.damageTaken,
            message: 'You were crushed by a falling rock and lost all your loot!',
          },
        };
      }
    }

    await updateSession(characterId, result.session);

    return {
      success: true,
      data: {
        sessionState: buildClientState(result.session),
        itemsGained: result.itemsGained.length > 0 ? result.itemsGained : undefined,
        damageTaken: result.damageTaken > 0 ? result.damageTaken : undefined,
        message: result.message,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Handler: mining_mine_start
 * Begins mining a block adjacent to the player. Records the start timestamp.
 */
export const handleMiningMineStart = async (
  io: Server,
  socket: Socket,
  payload: MiningMineStartPayload,
): Promise<GameEventResult> => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const session = await getSession(characterId);
  if (!session) {
    return { success: false, error: 'No active mining session.' };
  }

  if (session.pendingAction) {
    return { success: false, error: 'Already mining or performing an action.' };
  }

  const { target } = payload;
  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
    return { success: false, error: 'Invalid target position.' };
  }

  if (!isInBounds(target.x, target.y)) {
    return { success: false, error: 'Target out of bounds.' };
  }

  // Check stamina
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { stamina: true },
  });

  if (!character || character.stamina < MINING_CONFIG.MINING_STAMINA_COST) {
    return { success: false, error: 'Not enough stamina to mine.' };
  }

  try {
    const { miningTimeMs } = startMining(session, target);
    await updateSession(characterId, session);

    return {
      success: true,
      data: {
        sessionState: buildClientState(session),
        miningTimeMs,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Handler: mining_mine_complete
 * Completes mining a block. Validates timing, deducts stamina, generates loot.
 */
export const handleMiningMineComplete = async (
  io: Server,
  socket: Socket,
  payload: MiningMineCompletePayload,
): Promise<GameEventResult> => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const session = await getSession(characterId);
  if (!session) {
    return { success: false, error: 'No active mining session.' };
  }

  try {
    const result = await completeMining(session);

    // Deduct stamina from the database
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        stamina: { decrement: MINING_CONFIG.MINING_STAMINA_COST },
        ...(result.damageTaken > 0 ? { health: { decrement: result.damageTaken } } : {}),
      },
    });

    broadcastStatUpdate(characterId, {
      stamina: updatedCharacter.stamina,
      ...(result.damageTaken > 0 ? { health: updatedCharacter.health } : {}),
    });

    // Check if character died from falling rock
    if (updatedCharacter.health <= 0) {
      await deleteSession(characterId);
      return {
        success: true,
        data: {
          sessionState: null,
          damageTaken: result.damageTaken,
          message: 'You were crushed by a falling rock and lost all your loot!',
        },
      };
    }

    await updateSession(characterId, result.session);

    return {
      success: true,
      data: {
        sessionState: buildClientState(result.session),
        itemsGained: result.itemsGained.length > 0 ? result.itemsGained : undefined,
        damageTaken: result.damageTaken > 0 ? result.damageTaken : undefined,
        message: result.message,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Handler: mining_exit
 * Extracts from the mine. Transfers temp backpack to real inventory.
 */
export const handleMiningExit = async (
  io: Server,
  socket: Socket,
): Promise<GameEventResult> => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const session = await getSession(characterId);
  if (!session) {
    return { success: false, error: 'No active mining session.' };
  }

  try {
    const extractedItems = await extractFromMine(characterId, session);

    // Fetch updated inventory to broadcast
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

    console.log(
      `[Mining] ${socket.data.characterName} extracted from mine with ${extractedItems.length} item types`
    );

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
 * Clean up mining session on disconnect.
 * Called from the main socket disconnect handler.
 */
export const cleanupMiningSession = async (characterId: string): Promise<void> => {
  try {
    await deleteSession(characterId);
    console.log(`[Mining] Cleaned up session for character ${characterId} (disconnect)`);
  } catch (err) {
    // Silently ignore — session may not exist
  }
};
