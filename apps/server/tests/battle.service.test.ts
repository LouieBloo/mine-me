import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BattleService } from '../src/services/battle.service';
import { LootService } from '../src/services/loot.service';
import { CombatEngine } from '@nvg/shared/src/gameLogic/CombatEngine';

// Mock Prisma
const mockUpsert = vi.fn();
const mockFindUnique = vi.fn();

vi.mock('../src/index', () => ({
  prisma: {
    dungeonLevel: {
      findUnique: (...args: any) => mockFindUnique(...args),
    },
    accomplishment: {
      upsert: (...args: any) => mockUpsert(...args),
    },
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock LootService
vi.mock('../src/services/loot.service', () => ({
  LootService: {
    awardLootToCharacter: vi.fn(),
    mergeLoot: vi.fn((acc, loot) => {
      acc.sol += loot.sol;
      acc.items.push(...loot.items);
    }),
  },
}));

// Mock CombatEngine
vi.mock('@nvg/shared/src/gameLogic/CombatEngine', () => ({
  CombatEngine: {
    generateMobAction: vi.fn().mockReturnValue('Attack'),
  },
}));

describe('BattleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateInitialMobsState', () => {
    it('should map dungeon level mobs to battle mobs and set intended actions', () => {
      const mockMobs = [
        {
          id: 'dlm_1',
          mob: {
            id: 'mob_1',
            name: 'Slime',
            level: 1,
            health: 20,
            attack: 5,
            defense: 2,
            attackPercentage: 70,
            defendPercentage: 30,
            animations: {},
          },
        },
      ];
      const rngSeed = 'test_seed';

      const result = BattleService.generateInitialMobsState(mockMobs, rngSeed);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'dlm_1',
        name: 'Slime',
        health: 20,
        intendedAction: 'Attack',
      });
      expect(CombatEngine.generateMobAction).toHaveBeenCalled();
    });
  });

  describe('buildBattleState', () => {
    it('should correctly build a BattleState object', () => {
      const mockBattle = {
        id: 'battle_1',
        characterId: 'char_1',
        dungeonLevelId: 'dl_1',
        mobsState: [],
        round: 1,
        turn: 'PLAYER',
        status: 'IN_PROGRESS',
        rngSeed: 'seed',
      };
      const mockCharacter = {
        health: 80,
        maxHealth: 100,
      };

      const result = BattleService.buildBattleState(mockBattle, mockCharacter);

      expect(result).toEqual({
        id: 'battle_1',
        characterId: 'char_1',
        dungeonLevelId: 'dl_1',
        playerHealth: 80,
        playerMaxHealth: 100,
        mobs: [],
        round: 1,
        turn: 'PLAYER',
        status: 'IN_PROGRESS',
        rngSeed: 'seed',
      });
    });
  });

  describe('processVictory', () => {
    const mockBattle = { dungeonLevelId: 'dl_1' };
    const characterId = 'char_1';
    const lootResults = { sol: 0, items: [] };
    const newState: any = { status: 'VICTORY' };

    it('should award level loot and record level accomplishment for intermediate level', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'dl_1',
        completionDropTable: { id: 'dt_level' },
        dungeon: {
          id: 'dungeon_1',
          levels: [
            { id: 'dl_1', orderIndex: 0 },
            { id: 'dl_2', orderIndex: 1 },
          ],
        },
      });

      vi.mocked(LootService.awardLootToCharacter).mockResolvedValue({ sol: 10, items: [] });

      await BattleService.processVictory(mockBattle, characterId, lootResults, newState);

      expect(LootService.awardLootToCharacter).toHaveBeenCalledWith(characterId, 'dt_level');
      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ type: 'DUNGEON_LEVEL_CLEARED', referenceId: 'dl_1' })
      }));
      expect(newState.nextDungeonLevelId).toBe('dl_2');
      expect(newState.isDungeonComplete).toBe(false);
      expect(lootResults.sol).toBe(10);
    });

    it('should award dungeon loot and record dungeon accomplishment for last level', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'dl_2',
        completionDropTable: { id: 'dt_level' },
        dungeon: {
          id: 'dungeon_1',
          completionDropTable: { id: 'dt_dungeon' },
          levels: [
            { id: 'dl_1', orderIndex: 0 },
            { id: 'dl_2', orderIndex: 1 },
          ],
        },
      });

      vi.mocked(LootService.awardLootToCharacter)
        .mockResolvedValueOnce({ sol: 10, items: [] }) // Level loot
        .mockResolvedValueOnce({ sol: 50, items: [] }); // Dungeon loot

      await BattleService.processVictory({ dungeonLevelId: 'dl_2' }, characterId, lootResults, newState);

      expect(LootService.awardLootToCharacter).toHaveBeenCalledTimes(2);
      expect(LootService.awardLootToCharacter).toHaveBeenNthCalledWith(1, characterId, 'dt_level');
      expect(LootService.awardLootToCharacter).toHaveBeenNthCalledWith(2, characterId, 'dt_dungeon');
      
      expect(mockUpsert).toHaveBeenCalledTimes(2);
      expect(mockUpsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
        create: expect.objectContaining({ type: 'DUNGEON_CLEARED', referenceId: 'dungeon_1' })
      }));
      
      expect(newState.nextDungeonLevelId).toBeNull();
      expect(newState.isDungeonComplete).toBe(true);
    });
  });
});
