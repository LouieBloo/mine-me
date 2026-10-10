import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { buildMiningLoadout } from '../../../services/mining/miningLoadout';
import { type GameEventResult } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { getActiveMiningConfig } from '../../../services/miningConfig.service';

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
    const loadout = buildMiningLoadout(character);
    const clientInventory = loadout.clientInventory;

    // Ensure client has latest authoritative inventory upon entering mine
    broadcastStatUpdate(characterId, { inventory: clientInventory });

    const activeConfig = await getActiveMiningConfig().catch((err) => {
      console.warn('[Mining] Failed to load active mining config, falling back to defaults:', err);
      return undefined;
    });

    const mode = payload?.mode ?? 'singleplayer';
    const engine = miningSessionManager.createSession(
      characterId,
      character.cityId,
      socket,
      payload?.forceNew,
      loadout.miningSpeed,
      mode,
      character.name,
      loadout.gearLayers,
      activeConfig,
      {
        toolDamage: loadout.toolDamage,
        weaponDamage: loadout.weaponDamage,
        pickPower: loadout.pickPower,
        knockback: loadout.knockback,
      },
      loadout.equippedWeaponId,
      character.maxHealth,
    );

    // A run starts at full health; show that in the app's health bar (and the current value on re-entry)
    const runSession = engine.getPlayer(characterId);
    if (runSession) {
      broadcastStatUpdate(characterId, {
        health: Math.max(0, Math.round(runSession.health)),
        maxHealth: runSession.maxHealth,
      });
    }
    const sessionState = miningSessionManager.buildClientState(engine, characterId);

    console.log(
      `[Mining] ${character.name} entered real-time mine (${mode}) in city ${character.cityId} with speed ${loadout.miningSpeed}${
        payload?.forceNew ? ' (fresh session)' : ''
      }`,
    );

    return {
      success: true,
      data: { sessionState },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};
