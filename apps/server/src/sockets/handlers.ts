import { Server, Socket } from 'socket.io';
import { prisma } from '../index';

export const handleSocketConnection = (io: Server, socket: Socket) => {
  console.log(`[Socket] A player connected: ${socket.id}`);

  // ----------------------------------------------------------------------------
  // AUTHENTICATE SOCKET
  // ----------------------------------------------------------------------------
  socket.on('authenticate', async (token: string, callback) => {
    // In a real app we would verify the JWT. 
    // For scaffolding, we assume the client passes their userId directly for now.
    const userId = token; 
    
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { characters: true }
      });

      if (!user) {
        if (callback) callback({ error: 'User not found' });
        return;
      }

      // Join a personal room
      socket.join(`user:${user.id}`);
      console.log(`[Socket] User ${user.familyName} authenticated`);
      if (callback) callback({ success: true, user });

    } catch (err: any) {
      if (callback) callback({ error: err.message });
    }
  });

  // ----------------------------------------------------------------------------
  // JOIN CITY INSTANCE
  // ----------------------------------------------------------------------------
  socket.on('join_city', async (cityId: string, characterId: string, callback) => {
    // Basic verification
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) return;

    socket.join(`city:${cityId}`);
    
    // Broadcast to others in the city that we joined
    socket.to(`city:${cityId}`).emit('player_joined', {
      characterId: character.id,
      name: character.name,
      combatScore: character.combatScore,
    });

    if (callback) callback({ success: true });
  });


  // ----------------------------------------------------------------------------
  // DISCONNECT
  // ----------------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`[Socket] A player disconnected: ${socket.id}`);
  });
};
