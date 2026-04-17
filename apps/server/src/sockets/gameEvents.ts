import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { broadcastStatUpdate } from '../services/characterBroadcast';
import { handleStartCombat, handleCombatAction, handleLeaveCombat } from './combatEvents';
import { type GameEventPayload, type GameEventResult, type ChangeCityPayload, calculateTravelDays } from '@nvg/shared';

// ============================================================================
// Game Event Handler Registry
//
// Each handler receives the io server, the authenticated socket, the typed
// payload, and returns a GameEventResult. Adding a new event:
//   1. Write a handler function
//   2. Register it in gameEventHandlers
// ============================================================================

/** Signature for a game event handler function. */
type GameEventHandler<T extends GameEventPayload = GameEventPayload> = (
  io: Server,
  socket: Socket,
  payload: T,
) => Promise<GameEventResult>;

// ----------------------------------------------------------------------------
// Handler: change_city
// Moves the character to a new city, calculating travel distance and aging.
// ----------------------------------------------------------------------------
const handleChangeCity: GameEventHandler<ChangeCityPayload> = async (io, socket, payload) => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected. Call select_character first.' };
  }

  const { cityId } = payload;
  if (!cityId) {
    return { success: false, error: 'cityId is required.' };
  }

  // Fetch character and verify ownership
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { success: false, error: 'Character not found.' };
  }

  if (character.userId !== userId) {
    return { success: false, error: 'Forbidden: character does not belong to this user.' };
  }

  if (character.status !== 'ACTIVE') {
    return { success: false, error: 'Only active characters can travel.' };
  }

  if (character.cityId === cityId) {
    return { success: false, error: 'Character is already in this city.' };
  }

  // Fetch both cities for distance calculation
  const [currentCity, targetCity] = await Promise.all([
    prisma.city.findUnique({ where: { id: character.cityId } }),
    prisma.city.findUnique({ where: { id: cityId } }),
  ]);

  if (!currentCity || !targetCity) {
    return { success: false, error: 'City not found.' };
  }

  // Euclidean distance → travel days
  const distance = calculateTravelDays(currentCity as any, targetCity as any);

  // Update character in DB
  const updatedCharacter = await prisma.character.update({
    where: { id: characterId },
    data: {
      cityId,
      ageInDays: { increment: distance },
    },
  });

  // Leave old city room, join new one
  const oldCityRoom = `city:${character.cityId}`;
  const newCityRoom = `city:${cityId}`;

  socket.leave(oldCityRoom);
  socket.to(oldCityRoom).emit('player_left_city', { characterId });

  socket.join(newCityRoom);
  socket.to(newCityRoom).emit('player_entered_city', {
    characterId,
    name: character.name,
    level: character.level,
    combatScore: character.combatScore,
  });

  // Push new city data to this socket
  const cityData = {
    id: targetCity.id,
    name: targetCity.name,
    description: targetCity.description,
    backgroundImageUrl: targetCity.backgroundImageUrl,
    worldPositionX: targetCity.worldPositionX,
    worldPositionY: targetCity.worldPositionY,
  };

  socket.emit('city_data', cityData);

  // Broadcast stat update to the character's personal room
  broadcastStatUpdate(characterId, {
    ageInDays: updatedCharacter.ageInDays,
    cityId,
  });

  console.log(`[GameEvent] change_city: ${character.name} → ${targetCity.name} (${distance} days)`);

  return {
    success: true,
    data: {
      cityId,
      ageInDays: updatedCharacter.ageInDays,
      distance,
      cityName: targetCity.name,
    },
  };
};

// ----------------------------------------------------------------------------
// Handler Registry — maps event type strings to their handler functions.
// To add a new event, just add an entry here.
// ----------------------------------------------------------------------------
const gameEventHandlers: Record<string, GameEventHandler<any>> = {
  change_city: handleChangeCity,
  start_combat: handleStartCombat,
  combat_action: handleCombatAction,
  leave_combat: handleLeaveCombat,
};

// ----------------------------------------------------------------------------
// Dispatcher — called from the main socket connection handler.
// Looks up the handler by event type and executes it.
// ----------------------------------------------------------------------------
export const dispatchGameEvent = async (
  io: Server,
  socket: Socket,
  payload: GameEventPayload,
  callback?: (result: GameEventResult) => void,
): Promise<void> => {
  try {
    if (!payload?.type) {
      if (callback) callback({ success: false, error: 'Missing event type.' });
      return;
    }

    const handler = gameEventHandlers[payload.type];
    if (!handler) {
      console.warn(`[GameEvent] Unknown event type: ${payload.type}`);
      if (callback) callback({ success: false, error: `Unknown event type: ${payload.type}` });
      return;
    }

    const result = await handler(io, socket, payload);
    if (callback) callback(result);
  } catch (err: any) {
    console.error(`[GameEvent] Error handling ${payload?.type}:`, err);
    if (callback) callback({ success: false, error: 'Internal server error.' });
  }
};
