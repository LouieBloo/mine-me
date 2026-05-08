import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gameEventHandlers } from './gameEvents';
import { prisma } from '../index';
import * as characterBroadcast from '../services/characterBroadcast';
import { Server, Socket } from 'socket.io';

vi.mock('../index', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    city: {
      findUnique: vi.fn(),
    }
  }
}));

vi.mock('../services/characterBroadcast', () => ({
  broadcastStatUpdate: vi.fn(),
}));

describe('gameEvents', () => {
  let io: Server;
  let socket: any;

  beforeEach(() => {
    io = {} as Server;
    socket = {
      data: {
        userId: 'user1',
        characterId: 'char1',
      },
      leave: vi.fn(),
      join: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      emit: vi.fn(),
    };
    vi.clearAllMocks();
  });

  describe('handleRest', () => {
    const handleRest = gameEventHandlers.rest;

    it('returns error if no character is selected', async () => {
      socket.data.characterId = null;
      const result = await handleRest(io, socket, { type: 'rest' });
      expect(result).toEqual({ success: false, error: 'No character selected. Call select_character first.' });
    });

    it('returns error if character is not found', async () => {
      (prisma.character.findUnique as any).mockResolvedValue(null);
      const result = await handleRest(io, socket, { type: 'rest' });
      expect(result).toEqual({ success: false, error: 'Character not found or forbidden.' });
    });

    it('returns error if character does not belong to user', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({ id: 'char1', userId: 'otherUser' });
      const result = await handleRest(io, socket, { type: 'rest' });
      expect(result).toEqual({ success: false, error: 'Character not found or forbidden.' });
    });

    it('returns error if character is not ACTIVE', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({ id: 'char1', userId: 'user1', status: 'DEAD' });
      const result = await handleRest(io, socket, { type: 'rest' });
      expect(result).toEqual({ success: false, error: 'Only active characters can rest.' });
    });

    it('updates character health, stamina, and age, then broadcasts', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({
        id: 'char1', userId: 'user1', status: 'ACTIVE', maxHealth: 200, maxStamina: 100
      });
      (prisma.character.update as any).mockResolvedValue({
        id: 'char1', health: 200, stamina: 100, ageInDays: 5
      });

      const result = await handleRest(io, socket, { type: 'rest' });

      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: 'char1' },
        data: {
          health: 200,
          stamina: 100,
          ageInDays: { increment: 1 }
        }
      });

      expect(characterBroadcast.broadcastStatUpdate).toHaveBeenCalledWith('char1', {
        health: 200,
        stamina: 100,
        ageInDays: 5
      });

      expect(result).toEqual({ success: true });
    });
  });
});
