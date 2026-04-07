import { Server, Socket } from 'socket.io';
import { prisma } from '../index';

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
  // JOIN CHARACTER ROOM
  // Called once when the user selects a character to enter the game.
  // --------------------------------------------------------------------------
  socket.on('select_character', async (characterId: string, callback?: Function) => {
    try {
      // Verify this character belongs to this user
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { id: true, userId: true, status: true }
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
