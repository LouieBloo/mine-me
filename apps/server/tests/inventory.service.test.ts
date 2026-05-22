import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../src/services/inventory.service';
import { prisma } from '../src/index';

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
    character: {
      update: vi.fn(),
    },
  },
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
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: 'char1' },
        data: {
          experience: { increment: 30 }, // 15 * 2
        },
      });

      expect(result).toEqual({
        quantity: 2,
        experienceGranted: 30,
        itemDetails: mockItem,
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
      expect(prisma.character.update).not.toHaveBeenCalled();

      expect(result).toEqual({
        quantity: 3,
        experienceGranted: 0,
        itemDetails: mockItem,
      });
    });
  });
});
