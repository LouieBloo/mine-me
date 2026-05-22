import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMine } from './miningEvents';
import { prisma } from '../index';
import { Server } from 'socket.io';

vi.mock('../index', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    cityMaterial: {
      findMany: vi.fn(),
    },
    inventoryItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockGiveItemToCharacter = vi.fn();
vi.mock('../services/inventory.service', () => ({
  InventoryService: {
    giveItemToCharacter: (...args: any[]) => mockGiveItemToCharacter(...args),
  },
}));

vi.mock('../services/characterBroadcast', () => ({
  broadcastStatUpdate: vi.fn(),
}));

describe('miningEvents', () => {
  let io: Server;
  let socket: any;

  beforeEach(() => {
    io = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    } as any;
    socket = {
      data: {
        userId: 'user1',
        characterId: 'char1',
      },
      emit: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('returns error if no character is selected', async () => {
    socket.data.characterId = undefined;

    const result = await handleMine(io, socket);

    expect(result).toEqual({ success: false, error: 'No character selected.' });
  });

  it('returns error if character does not exist or does not belong to user', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(null);

    const result = await handleMine(io, socket);

    expect(result).toEqual({ success: false, error: 'Character not found or forbidden.' });
  });

  it('returns error if character status is not ACTIVE', async () => {
    (prisma.character.findUnique as any).mockResolvedValue({
      id: 'char1',
      userId: 'user1',
      status: 'DEAD',
    });

    const result = await handleMine(io, socket);

    expect(result).toEqual({ success: false, error: 'Only active characters can mine.' });
  });

  it('returns error if character has less than 25 stamina', async () => {
    (prisma.character.findUnique as any).mockResolvedValue({
      id: 'char1',
      userId: 'user1',
      status: 'ACTIVE',
      stamina: 20,
    });

    const result = await handleMine(io, socket);

    expect(result).toEqual({ success: false, error: 'Not enough stamina to mine. Please rest.' });
  });

  it('successfully mines, updates stamina, registers inventory item, and emits events', async () => {
    const character = {
      id: 'char1',
      userId: 'user1',
      status: 'ACTIVE',
      stamina: 100,
      cityId: 'city1',
      maxInventorySlots: 25,
      inventory: [],
    };

    (prisma.character.findUnique as any)
      .mockResolvedValueOnce(character) // first fetch
      .mockResolvedValueOnce({ ...character, stamina: 75, inventory: [{ id: 'inv1', itemId: 'item1', quantity: 1, item: { id: 'item1', name: 'Copperium', rarity: 'LOW', vendorSellPrice: 5 } }] }); // final fetch for client sync

    (prisma.cityMaterial.findMany as any).mockResolvedValue([
      {
        id: 'cm1',
        cityId: 'city1',
        itemId: 'item1',
        item: {
          id: 'item1',
          name: 'Copperium',
          description: 'Copper ore',
          type: 'MATERIAL',
          subType: 'MINERAL',
          vendorSellPrice: 5,
          rarity: 'LOW',
        },
      },
    ]);

    (prisma.character.update as any).mockResolvedValue({
      id: 'char1',
      stamina: 75,
    });

    mockGiveItemToCharacter.mockResolvedValue({
      quantity: 1,
      experienceGranted: 5,
      itemDetails: { id: 'item1', name: 'Copperium' }
    });

    // Force Math.random to return 0.1 so the roll <= LOW (50) chance succeeds
    const spyRandom = vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const result = await handleMine(io, socket);

    expect(result.success).toBe(true);
    expect(result.data?.stamina).toBe(75);
    expect(result.data?.rewards).toHaveLength(1);
    expect(result.data?.rewards[0].name).toBe('Copperium');

    expect(mockGiveItemToCharacter).toHaveBeenCalledWith('char1', 'item1', 1);

    expect(socket.emit).toHaveBeenCalledWith('combat_loot', expect.objectContaining({
      experience: 5,
      items: expect.arrayContaining([
        expect.objectContaining({ itemId: 'item1', quantity: 1 }),
      ]),
    }));

    spyRandom.mockRestore();
  });
});
