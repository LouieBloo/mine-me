import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { InventoryService } from '../../../services/inventory.service';
import {
  type GameEventResult,
  CharacterModEngine,
} from '@mine-me/shared';
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
    const clientInventory = InventoryService.mapCharacterInventory(character);
    const mods = CharacterModEngine.getModifications(clientInventory.items);

    // Extract equipped gear layers for remote rendering
    const gearLayers = character.inventory
      .filter((inv) => inv.item.type === 'GEAR' && inv.item.gearImageUrl && inv.equipped)
      .map((inv) => ({
        url: inv.item.gearImageUrl!,
        subType: inv.item.subType as any,
        shootsProjectiles: Boolean(inv.item.shootsProjectiles),
        throwable: Boolean(inv.item.throwable),
        holdOffsetX: inv.item.holdOffsetX ?? 0,
        holdOffsetY: inv.item.holdOffsetY ?? 0,
        holdRotation: inv.item.holdRotation ?? 0,
        muzzleOffsetX: inv.item.muzzleOffsetX ?? 0,
        muzzleOffsetY: inv.item.muzzleOffsetY ?? 0,
      }));

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
      mods.miningSpeed,
      mode,
      character.name,
      gearLayers,
      activeConfig,
      mods.miningDamage,
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
