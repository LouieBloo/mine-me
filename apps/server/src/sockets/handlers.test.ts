import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
    },
    city: {
      findUnique: vi.fn(),
    },
    cityDungeon: {
      findMany: vi.fn(),
    },
    accomplishment: {
      findMany: vi.fn(),
    },
  },
}));

import { handleSocketConnection, handleJoinCity, handleLeaveCity } from './handlers';
import { prisma } from '../index';

describe('socket handlers', () => {
  let io: any;
  let socket: any;
  let registeredEvents: Record<string, Function>;

  beforeEach(() => {
    registeredEvents = {};
    io = {
      to: vi.fn().mockReturnValue({
        emit: vi.fn(),
      }),
    };
    socket = {
      id: 'socket-123',
      data: {
        userId: 'user-1',
      },
      rooms: new Set(['socket-123']),
      join: vi.fn().mockImplementation((room) => {
        socket.rooms.add(room);
      }),
      leave: vi.fn().mockImplementation((room) => {
        socket.rooms.delete(room);
      }),
      to: vi.fn().mockReturnValue({
        emit: vi.fn(),
      }),
      emit: vi.fn(),
      on: vi.fn().mockImplementation((event, callback) => {
        registeredEvents[event] = callback;
      }),
    };
    vi.clearAllMocks();
  });

  it('registers expected event listeners on connection', () => {
    handleSocketConnection(io as any, socket as any);
    expect(socket.on).toHaveBeenCalledWith('select_character', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('join_city', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('leave_city', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('send_city_message', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('game_event', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  describe('join_city', () => {
    it('returns error when character is not found', async () => {
      (prisma.character.findUnique as any).mockResolvedValue(null);
      const callback = vi.fn();
      await handleJoinCity(io, socket, 'city-1', 'char-1', callback);
      expect(callback).toHaveBeenCalledWith({ error: 'Character not found' });
    });

    it('returns error when character does not belong to user', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({
        id: 'char-1',
        userId: 'different-user',
        cityId: 'city-1',
        name: 'Hero',
        combatScore: 10,
      });
      const callback = vi.fn();
      await handleJoinCity(io, socket, 'city-1', 'char-1', callback);
      expect(callback).toHaveBeenCalledWith({ error: 'Forbidden: character does not belong to this user' });
    });

    it('returns error when character is not in the city', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({
        id: 'char-1',
        userId: 'user-1',
        cityId: 'different-city',
        name: 'Hero',
        combatScore: 10,
      });
      const callback = vi.fn();
      await handleJoinCity(io, socket, 'city-1', 'char-1', callback);
      expect(callback).toHaveBeenCalledWith({ error: 'Forbidden: character is not in this city' });
    });

    it('successfully joins room, saves to socket data, and emits data', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({
        id: 'char-1',
        userId: 'user-1',
        cityId: 'city-1',
        name: 'Hero',
        combatScore: 10,
      });
      (prisma.city.findUnique as any).mockResolvedValue({
        id: 'city-1',
        name: 'City 1',
        description: 'First City',
        backgroundImageUrl: 'url',
        objectCoordinates: {},
      });
      (prisma.cityDungeon.findMany as any).mockResolvedValue([]);
      (prisma.accomplishment.findMany as any).mockResolvedValue([]);

      const callback = vi.fn();
      await handleJoinCity(io, socket, 'city-1', 'char-1', callback);

      expect(socket.data.characterId).toBe('char-1');
      expect(socket.data.cityId).toBe('city-1');
      expect(socket.data.characterName).toBe('Hero');
      expect(socket.join).toHaveBeenCalledWith('city:city-1');
      expect(socket.emit).toHaveBeenCalledWith('city_data', expect.objectContaining({ id: 'city-1' }));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('leave_city', () => {
    beforeEach(() => {
      socket.data.characterId = 'char-1';
      socket.data.cityId = 'city-1';
    });

    it('successfully leaves room and clears socket data', async () => {
      const callback = vi.fn();
      await handleLeaveCity(io, socket, 'city-1', callback);

      expect(socket.leave).toHaveBeenCalledWith('city:city-1');
      expect(socket.data.cityId).toBeUndefined();
      expect(callback).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('send_city_message', () => {
    beforeEach(() => {
      handleSocketConnection(io as any, socket as any);
    });

    it('returns error if character or city is not set on socket data', async () => {
      socket.data.characterId = undefined;
      socket.data.cityId = undefined;
      socket.data.characterName = undefined;

      const callback = vi.fn();
      await registeredEvents['send_city_message']({ message: 'Hello' }, callback);
      expect(callback).toHaveBeenCalledWith({ error: 'Not in a city room or character not selected' });
    });

    it('returns error if message is empty or whitespace', async () => {
      socket.data.characterId = 'char-1';
      socket.data.cityId = 'city-1';
      socket.data.characterName = 'Hero';

      const callback = vi.fn();
      await registeredEvents['send_city_message']({ message: '   ' }, callback);
      expect(callback).toHaveBeenCalledWith({ error: 'Message cannot be empty' });
    });

    it('returns error if message length exceeds 1000 characters', async () => {
      socket.data.characterId = 'char-1';
      socket.data.cityId = 'city-1';
      socket.data.characterName = 'Hero';

      const callback = vi.fn();
      const longMessage = 'a'.repeat(1001);
      await registeredEvents['send_city_message']({ message: longMessage }, callback);
      expect(callback).toHaveBeenCalledWith({ error: 'Message exceeds character limit of 1000' });
    });

    it('broadcasts message to the room if validated successfully', async () => {
      socket.data.characterId = 'char-1';
      socket.data.cityId = 'city-1';
      socket.data.characterName = 'Hero';

      const callback = vi.fn();
      await registeredEvents['send_city_message']({ message: 'Hello City!' }, callback);

      expect(io.to).toHaveBeenCalledWith('city:city-1');
      const emitMock = io.to.mock.results[0].value.emit;
      expect(emitMock).toHaveBeenCalledWith('city_message', expect.objectContaining({
        sender: 'Hero',
        message: 'Hello City!',
      }));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });
  });
});
