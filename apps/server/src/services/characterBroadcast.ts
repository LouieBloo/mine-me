import { Server } from 'socket.io';
import type { CharacterStatUpdate } from '@nvg/shared';

/**
 * Singleton broadcast service for pushing character stat updates via WebSocket.
 *
 * Usage (from any route handler or controller):
 *   import { broadcastStatUpdate } from '../services/characterBroadcast';
 *   broadcastStatUpdate(characterId, { sol: 500, ageInDays: 6600 });
 *
 * The client listens for 'character_stat_update' and merges the partial
 * payload into its local PlayerState.
 */

let io: Server | null = null;

/**
 * Called once at server startup to give this module a reference to socket.io.
 */
export function setIO(ioInstance: Server): void {
  io = ioInstance;
}

/**
 * Broadcast a partial stat update to a character's personal WebSocket room.
 * The room name is `character:{characterId}` — joined when the client calls
 * `select_character`.
 *
 * @param characterId - The character to push the update to
 * @param updates     - Only the fields that changed
 */
export function broadcastStatUpdate(characterId: string, updates: CharacterStatUpdate): void {
  if (!io) {
    console.warn('[broadcastStatUpdate] io not initialized — did you call setIO()?');
    return;
  }

  io.to(`character:${characterId}`).emit('character_stat_update', updates);
}
