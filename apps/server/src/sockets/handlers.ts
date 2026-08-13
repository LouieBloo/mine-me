import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { dispatchGameEvent } from './gameEvents';
import { InventoryService } from '../services/inventory.service';
import type { PlayerState, GameCity, GameEventPayload } from '@mine-me/shared';
import { cleanupMiningSession } from './miningEvents';

// Extend socket.data type for type safety
declare module 'socket.io' {
  interface SocketData {
    userId: string;      // Set by socketAuthMiddleware — never set by client
    characterId?: string; // Set after successful select_character
    characterName?: string;
    cityId?: string;
  }
}

// ----------------------------------------------------------------------------
// CITY EVENTS
// ----------------------------------------------------------------------------

export const handleJoinCity = async (io: Server, socket: Socket, cityId: string, characterId: string, callback?: Function) => {
  try {
    const userId = socket.data.userId;

    // Security: Verify character belongs to the authenticated user AND is in the requested city
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, userId: true, cityId: true, name: true, combatScore: true }
    });

    if (!character) {
      if (callback) callback({ error: 'Character not found' });
      return;
    }

    if (character.userId !== userId) {
      if (callback) callback({ error: 'Forbidden: character does not belong to this user' });
      return;
    }

    if (character.cityId !== cityId) {
      if (callback) callback({ error: 'Forbidden: character is not in this city' });
      return;
    }

    // Store on socket for disconnect cleanup
    socket.data.characterId = characterId;
    socket.data.cityId = cityId;
    socket.data.characterName = character.name;

    const cityRoom = `city:${cityId}`;
    socket.join(cityRoom);

    console.log(`[Socket] ${character.name} (${characterId}) joined city:${cityId}`);

    // Fetch city data and emit to this socket (replaces HTTP /api/game/city/:id)
    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: {
        id: true,
        name: true,
        description: true,
        backgroundImageUrl: true,
        objectCoordinates: true,
      }
    });

    if (city) {
      const cityData: GameCity = {
        ...city,
        objectCoordinates: city.objectCoordinates as any
      };
      socket.emit('city_data', cityData);
    }

    // Notify others in the city
    socket.to(cityRoom).emit('player_entered_city', {
      characterId: character.id,
      name: character.name,
      combatScore: character.combatScore,
    });

    // Send system message in the chat
    io.to(cityRoom).emit('city_message', {
      id: Math.random().toString(36).substring(7),
      sender: 'System',
      message: `${character.name} entered the city.`,
      timestamp: Date.now(),
      isSystem: true
    });

    if (callback) callback({ success: true });
  } catch (error: any) {
    console.error('[Socket] handleJoinCity error:', error);
    if (callback) callback({ error: 'Failed to join city' });
  }
};

export const handleLeaveCity = async (io: Server, socket: Socket, cityId: string, callback?: Function) => {
  try {
    const characterId = socket.data.characterId;
    const cityRoom = `city:${cityId}`;

    socket.leave(cityRoom);
    socket.data.cityId = undefined;

    const characterName = socket.data.characterName;
    if (characterId) {
      socket.to(cityRoom).emit('player_left_city', { characterId });
      if (characterName) {
        io.to(cityRoom).emit('city_message', {
          id: Math.random().toString(36).substring(7),
          sender: 'System',
          message: `${characterName} left the city.`,
          timestamp: Date.now(),
          isSystem: true
        });
      }
    }

    if (callback) callback({ success: true });
  } catch (err: any) {
    console.error('[Socket] leave_city error:', err);
    if (callback) callback({ error: 'Internal server error' });
  }
};

// ----------------------------------------------------------------------------
// MAIN CONNECTION HANDLER
// ----------------------------------------------------------------------------

export const handleSocketConnection = (io: Server, socket: Socket) => {
  // socket.data.userId is already set by socketAuthMiddleware
  const userId = socket.data.userId;

  console.log(`[Socket] User ${userId} connected (socket: ${socket.id})`);

  // Join a personal room scoped to userId for server->client pushes
  // Character-scoped room is joined below after character is identified
  socket.join(`user:${userId}`);

  // --------------------------------------------------------------------------
  // SELECT CHARACTER
  // Called once when the user selects a character to enter the game.
  // Responds with the full PlayerState so the client has everything it needs.
  // --------------------------------------------------------------------------
  socket.on('select_character', async (characterId: string, callback?: Function) => {
    try {
      // Fetch full character state including inventory items, city, and user's familyName
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: {
          user: { select: { familyName: true } },
          city: {
            select: {
              id: true,
              name: true,
              description: true,
              backgroundImageUrl: true,
              worldPositionX: true,
              worldPositionY: true,
              objectCoordinates: true,
            }
          },
          inventory: {
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  type: true,
                  subType: true,
                  vendorBuyPrice: true,
                  vendorSellPrice: true,
                  userBuyPrice: true,
                  userSellPrice: true,
                  rarity: true,
                  iconUrl: true,
                  gearImageUrl: true,
                  isStartingPiece: true,
                  experience: true,
                  combatScore: true,
                  defenseScore: true,
                  itemEffects: {
                    include: {
                      effect: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!character || character.userId !== userId) {
        if (callback) callback({ error: 'Character not found or forbidden' });
        return;
      }

      if (character.status !== 'ACTIVE') {
        if (callback) callback({ error: 'Only active characters can enter the game' });
        return;
      }

      socket.data.characterId = characterId;
      socket.data.characterName = character.name;
      socket.join(`character:${characterId}`);

      console.log(`[Socket] User ${userId} selected character ${characterId}`);

      // Build the PlayerState payload and emit to this socket
      const playerState: PlayerState = {
        id: character.id,
        familyName: character.user.familyName,
        characterName: character.name,
        characterClass: character.class as any,
        profession: character.profession as any ?? undefined,
        status: character.status as any,
        sol: character.sol,
        lear: character.lear,
        cityId: character.cityId,
        attributes: {
          combatScore: character.combatScore,
          defenseScore: character.defenseScore,
          health: character.health,
          maxHealth: character.maxHealth,
          stamina: character.stamina,
          maxStamina: character.maxStamina,
          ageInDays: character.ageInDays,
          experience: character.experience,
        },
        inventory: InventoryService.mapCharacterInventory(character),
        city: character.city
          ? {
            id: character.city.id,
            name: character.city.name,
            description: character.city.description,
            backgroundImageUrl: character.city.backgroundImageUrl,
            worldPositionX: character.city.worldPositionX,
            worldPositionY: character.city.worldPositionY,
            objectCoordinates: character.city.objectCoordinates as any,
          }
          : undefined,
        gear: InventoryService.mapCharacterGear(character.inventory) as any,
      };

      socket.emit('character_state', playerState);

      if (callback) callback({ success: true });
    } catch (err: any) {
      console.error('[Socket] select_character error:', err);
      if (callback) callback({ error: 'Internal server error' });
    }
  });

  // --------------------------------------------------------------------------
  // CITY ROOM MANAGEMENT
  // --------------------------------------------------------------------------
  socket.on('join_city', (cityId: string, characterId: string, callback?: Function) => {
    handleJoinCity(io, socket, cityId, characterId, callback);
  });

  socket.on('leave_city', (cityId: string, callback?: Function) => {
    handleLeaveCity(io, socket, cityId, callback);
  });

  socket.on('send_city_message', async (payload: { message: string }, callback?: Function) => {
    try {
      const characterId = socket.data.characterId;
      const cityId = socket.data.cityId;
      const characterName = socket.data.characterName;

      if (!characterId || !cityId || !characterName) {
        if (callback) callback({ error: 'Not in a city room or character not selected' });
        return;
      }

      const { message } = payload;
      if (!message || typeof message !== 'string' || message.trim() === '') {
        if (callback) callback({ error: 'Message cannot be empty' });
        return;
      }

      if (message.length > 1000) {
        if (callback) callback({ error: 'Message exceeds character limit of 1000' });
        return;
      }

      const chatMessage = {
        id: Math.random().toString(36).substring(7),
        sender: characterName,
        message: message.trim(),
        timestamp: Date.now()
      };

      // Broadcast to everyone in the city room (including sender)
      io.to(`city:${cityId}`).emit('city_message', chatMessage);

      if (callback) callback({ success: true });
    } catch (err) {
      console.error('[Socket] send_city_message error:', err);
      if (callback) callback({ error: 'Internal server error' });
    }
  });

  // --------------------------------------------------------------------------
  // GAME EVENTS — Typed game actions dispatched through a single channel
  // --------------------------------------------------------------------------
  socket.on('game_event', (payload: GameEventPayload, callback?: Function) => {
    dispatchGameEvent(io, socket, payload, callback as any);
  });

  // --------------------------------------------------------------------------
  // DISCONNECT — Clean up city presence
  // --------------------------------------------------------------------------
  socket.on('disconnect', async () => {
    const characterId = socket.data.characterId;
    const characterName = socket.data.characterName;
    const cityId = socket.data.cityId;
    console.log(`[Socket] User ${userId} disconnected (socket: ${socket.id})`);

    // Clean up any active mining session
    if (characterId) {
      cleanupMiningSession(characterId);
    }
    if (characterId) {
      // Notify any city rooms this socket was in
      const rooms = Array.from(socket.rooms).filter(r => r.startsWith('city:'));
      // Fallback to socket.data.cityId room if rooms is empty (rooms can be cleared on disconnect)
      if (rooms.length === 0 && cityId) {
        rooms.push(`city:${cityId}`);
      }
      rooms.forEach(room => {
        io.to(room).emit('player_left_city', { characterId });
        if (characterName) {
          io.to(room).emit('city_message', {
            id: Math.random().toString(36).substring(7),
            sender: 'System',
            message: `${characterName} left the city.`,
            timestamp: Date.now(),
            isSystem: true
          });
        }
      });
    }
  });
};
