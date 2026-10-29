import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { buildMiningLoadout } from '../../../services/mining/miningLoadout';
import { sanitizeBiomeKeys, type GameEventResult, type MiningGameMode } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { isMiningGameMode } from '../../../services/mining/gameModeRules';
import { getActiveMiningConfig } from '../../../services/miningConfig.service';
import { MissionOfferService, levelFromXp } from '../../../services/missionOffer.service';

/**
 * Handler: mining_start
 * Begins a new real-time mining session for the character.
 */
export const handleMiningStart = async (
  io: Server,
  socket: Socket,
  payload?: { forceNew?: boolean; mode?: MiningGameMode; biomeKeys?: unknown; missionId?: unknown },
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
    if (!isMiningGameMode(mode)) return { success: false, error: 'Unknown mining mode.' };
    // The mission is picked from this player's offers before the map is made. Joining a room that already exists inherits its mission.
    const joinable = miningSessionManager.peekJoinableRoom(mode, characterId);
    let mission: ReturnType<typeof MissionOfferService.take>;
    if (!joinable && mode !== 'sandbox' && typeof payload?.missionId === 'string' && payload.missionId !== '') {
      mission = MissionOfferService.take(characterId, payload.missionId);
      if (!mission) return { success: false, error: 'That mission is not one of your offers. Open the mission list again.' };
    } else {
      // No pick (or nothing to pick): the run has no mission, and the kept roll is dropped
      MissionOfferService.clear(characterId);
    }
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
        carryCapacity: loadout.carryCapacity,
      },
      loadout.equippedWeaponId,
      character.maxHealth,
      // Only a Single Player run can choose its biomes; the engine drops names that are not biomes
      mode === 'singleplayer' ? sanitizeBiomeKeys(payload?.biomeKeys) : undefined,
      mission,
    );

    // A run starts at full health; show that in the app's health bar (and the current value on re-entry)
    const runSession = engine.getPlayer(characterId);
    if (runSession && engine.rules.persistsCharacter) {
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

/**
 * Handler: mining_mission_offers
 * What missions a new run of this mode offers this player. The roll is kept, so asking again shows the same list; a mode that
 * joins a room that already exists (the shared lobby) has nothing to pick and reports that room's mission instead.
 */
export const handleMiningMissionOffers = async (
  _io: Server,
  socket: Socket,
  payload?: { mode?: MiningGameMode },
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };
  const mode = payload?.mode ?? 'singleplayer';
  if (!isMiningGameMode(mode)) return { success: false, error: 'Unknown mining mode.' };
  if (mode === 'sandbox') return { success: true, data: { offers: [] } };

  const joinable = miningSessionManager.peekJoinableRoom(mode, characterId);
  if (joinable) return { success: true, data: { offers: [], joining: joinable.missionTracker?.clientState() ?? null } };

  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { experience: true, userId: true } });
  if (!character || character.userId !== socket.data.userId) return { success: false, error: 'Character not found or forbidden.' };
  const levels = await prisma.characterLevel.findMany({ select: { level: true, xpRequired: true } });
  const level = levelFromXp(levels, character.experience);
  const offers = MissionOfferService.offersFor(characterId, level);
  return { success: true, data: { offers } };
};

