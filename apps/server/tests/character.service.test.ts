import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CharacterService } from '../src/services/character.service';
import { LootService } from '../src/services/loot.service';

const { mockPrisma, mockLevelsConfig, mockCharacter } = vi.hoisted(() => {
  const character = {
    id: 'char_1',
    experience: 50,
    sol: 10,
    lear: 5,
  };

  const levelsConfig = [
    { id: 'lvl_1', level: 1, xpRequired: 0, dropTableId: null, dropTable: null },
    { id: 'lvl_2', level: 2, xpRequired: 100, dropTableId: 'dt_2', dropTable: { id: 'dt_2', experience: 0 } },
    { id: 'lvl_3', level: 3, xpRequired: 250, dropTableId: 'dt_3', dropTable: { id: 'dt_3', experience: 0 } }
  ];

  const prismaMock = {
    character: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve({ ...character });
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        if (data.experience !== undefined) {
          character.experience = data.experience;
        }
        if (data.sol?.increment !== undefined) {
          character.sol += data.sol.increment;
        }
        return Promise.resolve({ ...character });
      })
    },
    characterLevel: {
      findMany: vi.fn().mockResolvedValue(levelsConfig)
    }
  };

  return { mockPrisma: prismaMock, mockLevelsConfig: levelsConfig, mockCharacter: character };
});

vi.mock('../src/index', () => ({
  prisma: mockPrisma
}));

vi.mock('../src/services/loot.service', () => ({
  LootService: {
    awardLootToCharacter: vi.fn().mockImplementation((characterId: string, dropTableId: string) => {
      return Promise.resolve({
        sol: 10,
        experience: 0,
        items: [{ itemId: 'item_1', quantity: 1 }]
      });
    }),
    mergeLoot: vi.fn().mockImplementation((acc: any, loot: any) => {
      acc.sol += loot.sol;
      acc.experience += loot.experience;
      acc.items.push(...loot.items);
    })
  }
}));

describe('CharacterService.addExperience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock character experience
    mockCharacter.experience = 50;
    mockCharacter.sol = 10;
    mockCharacter.lear = 5;
  });

  it('should add experience to the character', async () => {
    const result = await CharacterService.addExperience('char_1', 30);
    expect(result.experience).toBe(80);
    expect(mockPrisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char_1' },
      data: { experience: 80 }
    });
    expect(result.levelUpLoot.items.length).toBe(0); // No level up crossed
  });

  it('should trigger level up rewards when crossing a boundary', async () => {
    // Starts at 50 XP. Adding 60 XP makes it 110 XP (crosses Level 2 threshold of 100).
    const result = await CharacterService.addExperience('char_1', 60);
    expect(result.experience).toBe(110);
    expect(LootService.awardLootToCharacter).toHaveBeenCalledWith('char_1', 'dt_2');
    expect(result.levelUpLoot.sol).toBe(10);
    expect(result.levelUpLoot.items[0].itemId).toBe('item_1');
  });

  it('should trigger multiple level up rewards when crossing multiple boundaries in one gain', async () => {
    // Starts at 50 XP. Adding 220 XP makes it 270 XP (crosses Level 2 (100) and Level 3 (250)).
    const result = await CharacterService.addExperience('char_1', 220);
    expect(result.experience).toBe(270);
    expect(LootService.awardLootToCharacter).toHaveBeenCalledTimes(2);
    expect(LootService.awardLootToCharacter).toHaveBeenNthCalledWith(1, 'char_1', 'dt_2');
    expect(LootService.awardLootToCharacter).toHaveBeenNthCalledWith(2, 'char_1', 'dt_3');
    expect(result.levelUpLoot.sol).toBe(20); // 10 + 10 merged
    expect(result.levelUpLoot.items.length).toBe(2);
  });
});
