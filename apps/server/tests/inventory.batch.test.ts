import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../src/services/inventory.service';
import { prisma } from '../src/index';
import { CharacterService } from '../src/services/character.service';

vi.mock('../src/index', () => {
  const p: any = {
    item: { findUnique: vi.fn() },
    inventoryItem: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    character: { update: vi.fn() },
  };
  p.$transaction = vi.fn(async (cb: any) => cb(p));
  return { prisma: p };
});

vi.mock('../src/services/character.service', () => ({
  CharacterService: {
    addExperience: vi.fn().mockResolvedValue({ experience: 0, levelUpLoot: { sol: 0, experience: 0, items: [] } }),
  },
}));

describe('InventoryService.giveItemsToCharacter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);
  });

  it('writes everything inside a single transaction', async () => {
    vi.mocked(prisma.item.findUnique).mockImplementation((async ({ where }: any) => ({
      id: where.id,
      type: 'MATERIAL',
      experience: 0,
    })) as any);

    const res = await InventoryService.giveItemsToCharacter('c1', [
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 1 },
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryItem.create).toHaveBeenCalledTimes(2);
    expect(res.granted).toEqual([
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 1 },
    ]);
    expect(res.skipped).toEqual([]);
  });

  it('merges duplicate ids and increments existing rows', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ id: 'a', type: 'MATERIAL', experience: 0 } as any);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'row1' } as any);

    await InventoryService.giveItemsToCharacter('c1', [
      { itemId: 'a', quantity: 2 },
      { itemId: 'a', quantity: 3 },
    ]);

    expect(prisma.inventoryItem.update).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'row1' },
      data: { quantity: { increment: 5 } },
    });
  });

  it('credits the wallet for currency items', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ id: 'sol-id', type: 'CURRENCY', subType: 'SOL', name: 'Sol' } as any);
    await InventoryService.giveItemsToCharacter('c1', [{ itemId: 'sol-id', quantity: 40 }]);
    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { sol: { increment: 40 } },
    });
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('matches by id only: unknown ids and bad quantities are skipped and reported', async () => {
    vi.mocked(prisma.item.findUnique).mockImplementation((async ({ where }: any) =>
      where.id === 'good' ? { id: 'good', type: 'MATERIAL' } : null) as any);

    const res = await InventoryService.giveItemsToCharacter('c1', [
      { itemId: 'good', quantity: 1 },
      { itemId: 'sol', quantity: 5 },
      { itemId: 'good2', quantity: 0 },
      { itemId: 'good3', quantity: 1.5 },
      { itemId: 'good4', quantity: -2 },
    ]);

    expect(res.granted).toEqual([{ itemId: 'good', quantity: 1 }]);
    expect(res.skipped.map((s) => [s.itemId, s.reason])).toEqual([
      ['good2', 'invalid quantity'],
      ['good3', 'invalid quantity'],
      ['good4', 'invalid quantity'],
      ['sol', 'item not found'],
    ]);
    expect(prisma.item.findUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { name: expect.anything() } }));
  });

  it('propagates a transaction failure and grants no experience', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ id: 'a', type: 'MATERIAL', experience: 10 } as any);
    vi.mocked(prisma.inventoryItem.create).mockRejectedValueOnce(new Error('db down'));
    await expect(InventoryService.giveItemsToCharacter('c1', [{ itemId: 'a', quantity: 1 }])).rejects.toThrow('db down');
    expect(CharacterService.addExperience).not.toHaveBeenCalled();
  });

  it('grants total experience after the transaction commits', async () => {
    vi.mocked(prisma.item.findUnique).mockImplementation((async ({ where }: any) => ({
      id: where.id,
      type: 'MATERIAL',
      experience: where.id === 'a' ? 5 : 2,
    })) as any);

    const res = await InventoryService.giveItemsToCharacter('c1', [
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 3 },
    ]);
    expect(res.experienceGranted).toBe(16);
    expect(CharacterService.addExperience).toHaveBeenCalledWith('c1', 16);
  });
});

describe('InventoryService.mapItem effect flags', () => {
  it('passes every effect flag through to the client, including the combat-stat ones', () => {
    const mapped: any = InventoryService.mapItem({
      id: 'i', name: 'Pick', itemEffects: [{
        id: 'ie', itemId: 'i', effectId: 'e', value: 2,
        effect: {
          id: 'e', name: 'Pick Power', description: '', healthGain: false, staminaGain: false,
          miningSpeedModifier: false, damageModifier: false, toolDamageModifier: false,
          pickPowerModifier: true, knockbackModifier: false, explodes: false,
        },
      }],
    });
    expect(mapped.itemEffects[0].effect).toMatchObject({
      pickPowerModifier: true, toolDamageModifier: false, knockbackModifier: false, damageModifier: false, explodes: false,
    });
  });
});
