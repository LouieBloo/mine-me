import { Server, Socket } from 'socket.io';
import {
  type GameEventResult,
  type MiningInputPayload,
  type MiningInteractPayload,
  sanitizeTilePosition,
} from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';

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

  if (payload?.input) {
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

  const target = sanitizeTilePosition(payload?.target);
  if (!target) return { success: false, error: 'Invalid target.' };

  const started = engine.startMining(characterId, target);
  if (!started) return { success: false, error: 'Cannot mine target block.' };

  const session = engine.getPlayer(characterId);

  return {
    success: true,
    data: {
      isMining: session?.isMining ?? false,
      miningTarget: session?.miningTarget ?? null,
      miningTotal: session?.miningTotal ?? 0,
    },
  };
};
