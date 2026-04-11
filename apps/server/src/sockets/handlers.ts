import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import type { PlayerState, GameCity } from '@nvg/shared';

// Extend socket.data type for type safety
declare module 'socket.io' {
  interface SocketData {
    userId: string;      // Set by socketAuthMiddleware — never set by client
    characterId?: string; // Set after successful select_character
  }
}

// ----------------------------------------------------------------------------
// CITY EVENTS
// ----------------------------------------------------------------------------

const handleJoinCity = async (io: Server, socket: Socket, cityId: string, characterId: string, callback?: Function) => {
  try {
    const userId = socket.data.userId;

    // Security: Verify character belongs to the authenticated user AND is in the requested city
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, userId: true, cityId: true, name: true, combatScore: true, level: true }
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
      }
    });

    if (city) {
      const cityData: GameCity = city;
      socket.emit('city_data', cityData);
    }

    // Notify others in the city
    socket.to(cityRoom).emit('player_entered_city', {
      characterId: character.id,
      name: character.name,
      level: character.level,
      combatScore: character.combatScore,
    });

    if (callback) callback({ success: true });
  } catch (err: any) {
    console.error('[Socket] join_city error:', err);
    if (callback) callback({ error: 'Internal server error' });
  }
};

const handleLeaveCity = async (io: Server, socket: Socket, cityId: string, callback?: Function) => {
  try {
    const characterId = socket.data.characterId;
    const cityRoom = `city:${cityId}`;

    socket.leave(cityRoom);

    if (characterId) {
      socket.to(cityRoom).emit('player_left_city', { characterId });
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
      socket.join(`character:${characterId}`);

      console.log(`[Socket] User ${userId} selected character ${characterId}`);

      // Build the PlayerState payload and emit to this socket
      const playerState: PlayerState = {
        id: character.id,
        familyName: character.user.familyName,
        characterName: character.name,
        characterClass: character.class as any,
        profession: character.profession as any ?? undefined,
        sol: character.sol,
        lear: character.lear,
        cityId: character.cityId,
        attributes: {
          level: character.level,
          combatScore: character.combatScore,
          defenseScore: character.defenseScore,
          stamina: character.stamina,
          maxStamina: character.maxStamina,
          ageInDays: character.ageInDays,
        },
        inventory: {
          slots: character.maxInventorySlots,
          items: character.inventory.map(inv => ({
            item: {
              id: inv.item.id,
              name: inv.item.name,
              description: inv.item.description,
              type: inv.item.type as any,
              subType: inv.item.subType as any,
              priceSol: inv.item.vendorSellPrice,
              rarity: inv.item.rarity as any,
              iconUrl: inv.item.iconUrl,
              gearImageUrl: inv.item.gearImageUrl,
              isStartingPiece: inv.item.isStartingPiece,
            },
            quantity: inv.quantity,
          })),
        },
        city: character.city
          ? {
              id: character.city.id,
              name: character.city.name,
              description: character.city.description,
              backgroundImageUrl: character.city.backgroundImageUrl,
            }
          : undefined,
        gear: {}, // TODO: derive equipped gear from inventory items
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

  // --------------------------------------------------------------------------
  // DISCONNECT — Clean up city presence
  // --------------------------------------------------------------------------
  socket.on('disconnect', () => {
    const characterId = socket.data.characterId;
    console.log(`[Socket] User ${userId} disconnected (socket: ${socket.id})`);

    if (characterId) {
      // Notify any city rooms this socket was in
      const rooms = Array.from(socket.rooms).filter(r => r.startsWith('city:'));
      rooms.forEach(room => {
        io.to(room).emit('player_left_city', { characterId });
      });
    }
  });
};
