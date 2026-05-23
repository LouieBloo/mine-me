import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../src/services/inventory.service';
import { prisma } from '../src/index';
import { CharacterService } from '../src/services/character.service';

vi.mock('../src/index', () => ({
  prisma: {
    item: {
      findUnique: vi.fn(),
    },
    inventoryItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/services/character.service', () => ({
  CharacterService: {
    addExperience: vi.fn().mockResolvedValue({
      experience: 100,
      levelUpLoot: { sol: 0, experience: 0, items: [] }
    })
  }
}));

describe('InventoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('giveItemToCharacter', () => {
    it('should throw error if item does not exist', async () => {
      vi.mocked(prisma.item.findUnique).mockResolvedValue(null);

      await expect(
        InventoryService.giveItemToCharacter('char1', 'item_not_found', 1)
      ).rejects.toThrow('Item item_not_found not found');
    });

    it('should create inventory item and grant experience if item has experience and character does not have it already', async () => {
      const mockItem = {
        id: 'item1',
        name: 'Super Sword',
        experience: 15,
      };

      vi.mocked(prisma.item.findUnique).mockResolvedValue(mockItem as any);
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

      const result = await InventoryService.giveItemToCharacter('char1', 'item1', 2);

      expect(prisma.inventoryItem.create).toHaveBeenCalledWith({
        data: {
          characterId: 'char1',
          itemId: 'item1',
          quantity: 2,
        },
      });
      expect(CharacterService.addExperience).toHaveBeenCalledWith('char1', 30);

      expect(result).toEqual({
        quantity: 2,
        experienceGranted: 30,
        itemDetails: mockItem,
        levelUpLoot: { sol: 0, experience: 0, items: [] }
      });
    });

    it('should update inventory item and not grant experience if item experience is 0', async () => {
      const mockItem = {
        id: 'item1',
        name: 'Basic Stone',
        experience: 0,
      };

      const existingInv = { id: 'inv1', quantity: 5 };

      vi.mocked(prisma.item.findUnique).mockResolvedValue(mockItem as any);
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingInv as any);

      const result = await InventoryService.giveItemToCharacter('char1', 'item1', 3);

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'inv1' },
        data: {
          quantity: { increment: 3 },
        },
      });
      expect(CharacterService.addExperience).not.toHaveBeenCalled();

      expect(result).toEqual({
        quantity: 3,
        experienceGranted: 0,
        itemDetails: mockItem,
        levelUpLoot: undefined
      });
    });
  });
});
