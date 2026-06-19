import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStartCombat, handleAdvanceDungeonLevel } from './combatEvents';
import { prisma } from '../index';
import { Server, Socket } from 'socket.io';

vi.mock('../index', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
    },
    dungeonLevel: {
      findUnique: vi.fn(),
    },
    battle: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    }
  }
}));

describe('combatEvents', () => {
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

  describe('handleStartCombat', () => {
    it('returns error if character has less than 100 stamina', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({
        id: 'char1', userId: 'user1', cityId: 'city1', stamina: 50
      });
      (prisma.dungeonLevel.findUnique as any).mockResolvedValue({
        id: 'level1',
        staminaCost: 100,
        dungeon: { cityDungeons: [{ cityId: 'city1' }] },
        mobs: []
      });

      const result = await handleStartCombat(io, socket, {
        type: 'start_combat', cityId: 'city1', dungeonLevelId: 'level1'
      });

      expect(result).toEqual({ success: false, error: 'Not enough stamina to enter the dungeon. Please rest.' });
    });

    it('passes stamina check if character has 100 or more stamina', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({
        id: 'char1', userId: 'user1', cityId: 'city1', stamina: 100
      });
      // Mock dungeonLevel to fail so we don't have to mock the rest of the flow
      (prisma.dungeonLevel.findUnique as any).mockResolvedValue(null);

      const result = await handleStartCombat(io, socket, {
        type: 'start_combat', cityId: 'city1', dungeonLevelId: 'level1'
      });

      expect(result).toEqual({ success: false, error: 'Dungeon level not found in this city.' });
    });

    it('updates/resets existing battle if dungeonLevelId is different', async () => {
      (prisma.character.findUnique as any).mockResolvedValue({
        id: 'char1', userId: 'user1', cityId: 'city1', stamina: 100
      });
      (prisma.dungeonLevel.findUnique as any).mockResolvedValue({
        id: 'level2',
        staminaCost: 10,
        dungeon: { cityDungeons: [{ cityId: 'city1' }] },
        mobs: []
      });
      (prisma.battle.findUnique as any).mockResolvedValue({
        id: 'battle1',
        characterId: 'char1',
        dungeonLevelId: 'level1',
        status: 'IN_PROGRESS'
      });
      (prisma.battle.update as any).mockResolvedValue({
        id: 'battle1',
        characterId: 'char1',
        dungeonLevelId: 'level2',
        status: 'IN_PROGRESS',
        mobsState: [],
        rngSeed: 'seed123',
        round: 1,
        turn: 'PLAYER'
      });

      const result = await handleStartCombat(io, socket, {
        type: 'start_combat', cityId: 'city1', dungeonLevelId: 'level2'
      });

      expect(prisma.battle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'battle1' },
          data: expect.objectContaining({
            dungeonLevelId: 'level2',
            status: 'IN_PROGRESS',
            round: 1
          })
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleAdvanceDungeonLevel', () => {
    it('returns error if character has less than 100 stamina', async () => {
      (prisma.battle.findUnique as any).mockResolvedValue({
        id: 'battle1', characterId: 'char1', status: 'VICTORY', dungeonLevelId: 'level1'
      });
      (prisma.character.findUnique as any).mockResolvedValue({
        id: 'char1', stamina: 99
      });
      (prisma.dungeonLevel.findUnique as any).mockImplementation((args: any) => {
        if (args.where.id === 'level1') {
          return Promise.resolve({
            id: 'level1',
            dungeon: { levels: [{ id: 'level1' }, { id: 'level2' }] }
          });
        }
        if (args.where.id === 'level2') {
          return Promise.resolve({
            id: 'level2', staminaCost: 100, mobs: [{}]
          });
        }
        return Promise.resolve(null);
      });

      const result = await handleAdvanceDungeonLevel(io, socket, {
        type: 'advance_dungeon_level'
      });

      expect(result).toEqual({ success: false, error: 'Not enough stamina to continue. You must retreat and rest.' });
    });
  });
});
