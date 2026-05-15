import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { broadcastStatUpdate } from '../services/characterBroadcast';
import type { TrainingActionPayload, GameEventResult } from '@nvg/shared';

const TRAINING_STAMINA_COST = 20;

/**
 * Handler: training_action
 *
 * Processes a single training action (Attack or Defend) against the training dummy.
 * - Costs 20 stamina per action.
 * - Attack: increments combatScore by 1.
 * - Defend: increments defenseScore by 1.
 * - Broadcasts stat updates to the client via the existing character_stat_update channel.
 */
export const handleTrainingAction = async (
  io: Server,
  socket: Socket,
  payload: TrainingActionPayload
): Promise<GameEventResult> => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const { action } = payload;

  if (action !== 'Attack' && action !== 'Defend') {
    return { success: false, error: 'Invalid training action. Must be Attack or Defend.' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character || character.userId !== userId) {
    return { success: false, error: 'Character not found or forbidden.' };
  }

  if (character.status !== 'ACTIVE') {
    return { success: false, error: 'Only active characters can train.' };
  }

  if (character.stamina < TRAINING_STAMINA_COST) {
    return { success: false, error: 'Not enough stamina to train. Please rest.' };
  }

  // Build the update based on action type
  const updateData: Record<string, any> = {
    stamina: { decrement: TRAINING_STAMINA_COST },
  };

  if (action === 'Attack') {
    updateData.combatScore = { increment: 1 };
  } else {
    updateData.defenseScore = { increment: 1 };
  }

  const updatedCharacter = await prisma.character.update({
    where: { id: characterId },
    data: updateData,
  });

  // Broadcast the stat update to the client
  const statUpdate: Record<string, number> = {
    stamina: updatedCharacter.stamina,
  };

  if (action === 'Attack') {
    statUpdate.combatScore = updatedCharacter.combatScore;
  } else {
    statUpdate.defenseScore = updatedCharacter.defenseScore;
  }

  broadcastStatUpdate(characterId, statUpdate);

  console.log(
    `[Training] ${character.name} trained ${action}. ` +
    `Combat: ${updatedCharacter.combatScore}, Defense: ${updatedCharacter.defenseScore}, ` +
    `Stamina: ${updatedCharacter.stamina}`
  );

  return {
    success: true,
    data: {
      action,
      combatScore: updatedCharacter.combatScore,
      defenseScore: updatedCharacter.defenseScore,
      stamina: updatedCharacter.stamina,
    },
  };
};
