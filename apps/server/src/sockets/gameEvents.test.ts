import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gameEventHandlers } from './gameEvents';
import { prisma } from '../index';
import * as characterBroadcast from '../services/characterBroadcast';
import { Server } from 'socket.io';

vi.mock('../index', () => {
  const mockPrisma: any = {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    city: {
      findUnique: vi.fn(),
    },
    inventoryItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mockPrisma)),
  };
  return { prisma: mockPrisma };
});

vi.mock('../services/characterBroadcast', () => ({
  broadcastStatUpdate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const makeSocket = (userId = 'user1', characterId: string | null = 'char1') => ({
  data: { userId, characterId },
  leave: vi.fn(),
  join: vi.fn(),
  to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  emit: vi.fn(),
} as any);

const makeCharacter = (overrides: any = {}) => {
  const maxHealth = overrides.maxHealth ?? 100;
  const maxStamina = overrides.maxStamina ?? 100;
  return {
    id: 'char1',
    userId: 'user1',
    name: 'Hero',
    status: 'ACTIVE',
    combatScore: 10,
    cityId: 'city-a',
    health: maxHealth,
    stamina: maxStamina,
    maxHealth,
    maxStamina,
    ageInDays: 6570,
    ...overrides,
  };
};

const makeCity = (id: string, x: number, y: number, overrides = {}) => ({
  id,
  name: `City ${id}`,
  description: '',
  worldPositionX: x,
  worldPositionY: y,
  backgroundImageUrl: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// calculateTravelDays — tested via the shared utility directly
// ---------------------------------------------------------------------------
import { calculateTravelDays } from '@mine-me/shared';

describe('calculateTravelDays (shared utility)', () => {
  it('returns 0 when both cities have the same id', () => {
    const city = makeCity('a', 10, 20);
    expect(calculateTravelDays(city, city)).toBe(0);
  });

  it('calculates the correct Euclidean distance for a simple case (3-4-5 triangle)', () => {
    // dx=3, dy=4 → sqrt(9+16)=5
    const a = makeCity('a', 0, 0);
    const b = makeCity('b', 3, 4);
    expect(calculateTravelDays(a, b)).toBe(5);
  });

  it('is commutative — A→B equals B→A', () => {
    const a = makeCity('a', 10, 20);
    const b = makeCity('b', 45, 75);
    expect(calculateTravelDays(a, b)).toBe(calculateTravelDays(b, a));
  });

  it('ceils fractional results (non-integer distances round up)', () => {
    // dx=1, dy=1 → sqrt(2) ≈ 1.414 → ceils to 2
    const a = makeCity('a', 0, 0);
    const b = makeCity('b', 1, 1);
    expect(calculateTravelDays(a, b)).toBe(2);
  });

  it('uses 50,50 as defaults when coordinates are missing', () => {
    const a = { id: 'a' };
    const b = makeCity('b', 50, 80);
    // dx=0, dy=30 → 30
    expect(calculateTravelDays(a, b)).toBe(30);
  });

  it('handles cities far apart correctly', () => {
    // dx=60, dy=80 → sqrt(3600+6400)=100
    const a = makeCity('a', 0, 0);
    const b = makeCity('b', 60, 80);
    expect(calculateTravelDays(a, b)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// handleChangeCity
// ---------------------------------------------------------------------------
describe('gameEvents — handleChangeCity', () => {
  const handleChangeCity = gameEventHandlers.change_city;
  let io: Server;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    io = {} as Server;
    socket = makeSocket();
    vi.clearAllMocks();
  });

  it('returns error when no character is selected', async () => {
    socket.data.characterId = null;
    const result = await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });
    expect(result).toEqual({ success: false, error: 'No character selected. Call select_character first.' });
  });

  it('returns error when cityId is missing', async () => {
    const result = await handleChangeCity(io, socket, { type: 'change_city', cityId: '' });
    expect(result).toEqual({ success: false, error: 'cityId is required.' });
  });

  it('returns error when character is not found', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(null);
    const result = await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });
    expect(result).toEqual({ success: false, error: 'Character not found.' });
  });

  it('returns error when character does not belong to the user', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ userId: 'other-user' }));
    const result = await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });
    expect(result).toEqual({ success: false, error: 'Forbidden: character does not belong to this user.' });
  });

  it('returns error when character is not ACTIVE', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ status: 'DEAD' }));
    const result = await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });
    expect(result).toEqual({ success: false, error: 'Only active characters can travel.' });
  });

  it('returns error when character is already in the target city', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ cityId: 'city-b' }));
    const result = await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });
    expect(result).toEqual({ success: false, error: 'Character is already in this city.' });
  });

  it('returns error when a city is not found in the DB', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter());
    (prisma.city.findUnique as any).mockResolvedValueOnce(null); // currentCity missing
    (prisma.city.findUnique as any).mockResolvedValueOnce(makeCity('city-b', 80, 80));
    const result = await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });
    expect(result).toEqual({ success: false, error: 'City not found.' });
  });

  it('ages the character by the Euclidean distance between cities (3-4-5 triangle → 5 days)', async () => {
    const currentCity = makeCity('city-a', 0, 0);   // origin
    const targetCity  = makeCity('city-b', 3, 4);   // distance = 5

    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ cityId: 'city-a', ageInDays: 100 }));
    (prisma.city.findUnique as any)
      .mockResolvedValueOnce(currentCity)
      .mockResolvedValueOnce(targetCity);
    (prisma.character.update as any).mockResolvedValue({ cityId: 'city-b', ageInDays: 105 });

    await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });

    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char1' },
      data: {
        cityId: 'city-b',
        ageInDays: { increment: 5 },
      },
    });
  });

  it('ages the character by a larger distance (60-80-100 triangle → 100 days)', async () => {
    const currentCity = makeCity('city-a', 0, 0);
    const targetCity  = makeCity('city-b', 60, 80);  // distance = 100

    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ cityId: 'city-a', ageInDays: 200 }));
    (prisma.city.findUnique as any)
      .mockResolvedValueOnce(currentCity)
      .mockResolvedValueOnce(targetCity);
    (prisma.character.update as any).mockResolvedValue({ cityId: 'city-b', ageInDays: 300 });

    await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });

    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char1' },
      data: {
        cityId: 'city-b',
        ageInDays: { increment: 100 },
      },
    });
  });

  it('does NOT hardcode 30 days regardless of city position', async () => {
    // A 35-day journey must age the character 35 days, not 30
    const currentCity = makeCity('city-a', 0, 0);
    const targetCity  = makeCity('city-b', 21, 28); // sqrt(441+784) = sqrt(1225) = 35

    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ cityId: 'city-a', ageInDays: 6570 }));
    (prisma.city.findUnique as any)
      .mockResolvedValueOnce(currentCity)
      .mockResolvedValueOnce(targetCity);
    (prisma.character.update as any).mockResolvedValue({ cityId: 'city-b', ageInDays: 6605 });

    await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });

    const updateCall = (prisma.character.update as any).mock.calls[0][0];
    // Must be exactly 35, not 30
    expect(updateCall.data.ageInDays.increment).toBe(35);
    expect(updateCall.data.ageInDays.increment).not.toBe(30);
  });

  it('broadcasts the updated ageInDays and cityId after travel', async () => {
    const currentCity = makeCity('city-a', 0, 0);
    const targetCity  = makeCity('city-b', 3, 4);

    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ cityId: 'city-a', ageInDays: 100 }));
    (prisma.city.findUnique as any)
      .mockResolvedValueOnce(currentCity)
      .mockResolvedValueOnce(targetCity);
    (prisma.character.update as any).mockResolvedValue({ cityId: 'city-b', ageInDays: 105 });

    await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });

    expect(characterBroadcast.broadcastStatUpdate).toHaveBeenCalledWith('char1', {
      ageInDays: 105,
      cityId: 'city-b',
    });
  });

  it('returns distance in the result data so the client can display it', async () => {
    const currentCity = makeCity('city-a', 0, 0);
    const targetCity  = makeCity('city-b', 3, 4);

    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ cityId: 'city-a', ageInDays: 100 }));
    (prisma.city.findUnique as any)
      .mockResolvedValueOnce(currentCity)
      .mockResolvedValueOnce(targetCity);
    (prisma.character.update as any).mockResolvedValue({ cityId: 'city-b', ageInDays: 105 });

    const result = await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });

    expect(result.success).toBe(true);
    expect(result.data?.distance).toBe(5);
    expect(result.data?.ageInDays).toBe(105);
  });

  it('joins the new city socket room and leaves the old one', async () => {
    const currentCity = makeCity('city-a', 0, 0);
    const targetCity  = makeCity('city-b', 3, 4);

    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ cityId: 'city-a' }));
    (prisma.city.findUnique as any)
      .mockResolvedValueOnce(currentCity)
      .mockResolvedValueOnce(targetCity);
    (prisma.character.update as any).mockResolvedValue({ cityId: 'city-b', ageInDays: 105 });

    await handleChangeCity(io, socket, { type: 'change_city', cityId: 'city-b' });

    expect(socket.leave).toHaveBeenCalledWith('city:city-a');
    expect(socket.join).toHaveBeenCalledWith('city:city-b');
  });
});

// ---------------------------------------------------------------------------
// handleRest
// ---------------------------------------------------------------------------
describe('gameEvents — handleRest', () => {
  const handleRest = gameEventHandlers.rest;
  let io: Server;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    io = {} as Server;
    socket = makeSocket();
    vi.clearAllMocks();
  });

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
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ userId: 'other-user' }));
    const result = await handleRest(io, socket, { type: 'rest' });
    expect(result).toEqual({ success: false, error: 'Character not found or forbidden.' });
  });

  it('returns error if character is not ACTIVE', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ status: 'DEAD' }));
    const result = await handleRest(io, socket, { type: 'rest' });
    expect(result).toEqual({ success: false, error: 'Only active characters can rest.' });
  });

  it('restores health and stamina to max and ages by exactly 1 day', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ health: 100, stamina: 50, maxHealth: 200, maxStamina: 150, ageInDays: 6570 }));
    (prisma.character.update as any).mockResolvedValue({ health: 200, stamina: 75, ageInDays: 6571, status: 'ACTIVE' });

    await handleRest(io, socket, { type: 'rest' });

    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char1' },
      data: {
        health: 200,
        stamina: 75,
        ageInDays: 6571,
      },
    });
  });

  it('restores health and stamina for custom days', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ health: 100, stamina: 50, maxHealth: 200, maxStamina: 150, ageInDays: 6570 }));
    (prisma.character.update as any).mockResolvedValue({ health: 200, stamina: 125, ageInDays: 6573, status: 'ACTIVE' });

    await handleRest(io, socket, { type: 'rest', days: 3 });

    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char1' },
      data: {
        health: 200,
        stamina: 125,
        ageInDays: 6573,
      },
    });
  });

  it('returns error if days is invalid', async () => {
    const result1 = await handleRest(io, socket, { type: 'rest', days: -5 });
    expect(result1).toEqual({ success: false, error: 'Invalid days parameter. Must be a positive integer.' });

    const result2 = await handleRest(io, socket, { type: 'rest', days: 1.5 });
    expect(result2).toEqual({ success: false, error: 'Invalid days parameter. Must be a positive integer.' });
  });

  it('broadcasts updated health, stamina, ageInDays, and status', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ maxHealth: 200, maxStamina: 100, ageInDays: 4 }));
    (prisma.character.update as any).mockResolvedValue({ health: 200, stamina: 100, ageInDays: 5, status: 'ACTIVE' });

    await handleRest(io, socket, { type: 'rest' });

    expect(characterBroadcast.broadcastStatUpdate).toHaveBeenCalledWith('char1', {
      health: 200,
      stamina: 100,
      ageInDays: 5,
      status: 'ACTIVE',
    });
  });

  it('returns success: true and died: false on valid rest', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter());
    (prisma.character.update as any).mockResolvedValue({ health: 100, stamina: 100, ageInDays: 6571, status: 'ACTIVE' });

    const result = await handleRest(io, socket, { type: 'rest' });
    expect(result).toEqual({ success: true, data: { died: false } });
  });

  it('kills character and sets status to DEAD if character ages to 36000 days or more', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(makeCharacter({ ageInDays: 35999 }));
    (prisma.character.update as any).mockResolvedValue({ health: 0, stamina: 0, ageInDays: 36000, status: 'DEAD' });

    const result = await handleRest(io, socket, { type: 'rest', days: 1 });

    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char1' },
      data: {
        status: 'DEAD',
        health: 0,
        stamina: 0,
        ageInDays: 36000,
      },
    });
    expect(result).toEqual({ success: true, data: { died: true } });
  });
});

// ---------------------------------------------------------------------------
// handleEquipItem & handleUnequipItem
// ---------------------------------------------------------------------------
describe('gameEvents — handleEquipItem & handleUnequipItem', () => {
  const handleEquipItem = gameEventHandlers.equip_item;
  const handleUnequipItem = gameEventHandlers.unequip_item;
  let io: Server;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    io = {} as Server;
    socket = makeSocket();
    vi.clearAllMocks();
  });

  it('equips a gear item and unequips other items of the same subtype', async () => {
    const targetItem = {
      id: 'inv-target',
      characterId: 'char1',
      itemId: 'item-helmet',
      equipped: false,
      item: { id: 'item-helmet', type: 'GEAR', subType: 'HEAD' },
    };

    const currentlyEquipped = {
      id: 'inv-old',
      characterId: 'char1',
      itemId: 'item-old-helmet',
      equipped: true,
      item: { id: 'item-old-helmet', type: 'GEAR', subType: 'HEAD' },
    };

    const updatedChar = {
      id: 'char1',
      maxInventorySlots: 25,
      inventory: [
        {
          id: 'inv-target',
          quantity: 1,
          equipped: true,
          item: { id: 'item-helmet', type: 'GEAR', subType: 'HEAD', combatScore: 0, defenseScore: 5 },
        },
      ],
    };

    (prisma.inventoryItem.findUnique as any).mockResolvedValue(targetItem);
    (prisma.inventoryItem.findFirst as any).mockResolvedValue(currentlyEquipped);
    (prisma.character.findUnique as any).mockResolvedValue(updatedChar);

    const result = await handleEquipItem(io, socket, { type: 'equip_item', inventoryItemId: 'inv-target' });

    expect(result).toEqual({ success: true });
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv-target' },
      data: { equipped: true },
    });
    expect(characterBroadcast.broadcastStatUpdate).toHaveBeenCalled();
  });

  it('unequips an equipped item', async () => {
    const targetItem = {
      id: 'inv-target',
      characterId: 'char1',
      itemId: 'item-helmet',
      equipped: true,
      item: { id: 'item-helmet', type: 'GEAR', subType: 'HEAD' },
    };

    const updatedChar = {
      id: 'char1',
      maxInventorySlots: 25,
      inventory: [
        {
          id: 'inv-target',
          quantity: 1,
          equipped: false,
          item: { id: 'item-helmet', type: 'GEAR', subType: 'HEAD', combatScore: 0, defenseScore: 5 },
        },
      ],
    };

    (prisma.inventoryItem.findUnique as any).mockResolvedValue(targetItem);
    (prisma.character.findUnique as any).mockResolvedValue(updatedChar);

    const result = await handleUnequipItem(io, socket, { type: 'unequip_item', inventoryItemId: 'inv-target' });

    expect(result).toEqual({ success: true });
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv-target' },
      data: { equipped: false },
    });
    expect(characterBroadcast.broadcastStatUpdate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleConsumeItem
// ---------------------------------------------------------------------------
describe('gameEvents — handleConsumeItem', () => {
  const handleConsumeItem = gameEventHandlers.consume_item;
  let io: Server;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    io = {} as Server;
    socket = makeSocket();
    vi.clearAllMocks();
  });

  it('returns error if no character is selected', async () => {
    socket.data.characterId = null;
    const result = await handleConsumeItem(io, socket, { type: 'consume_item', inventoryItemId: 'inv-1' });
    expect(result).toEqual({ success: false, error: 'No character selected.' });
  });

  it('returns error if item is not found in character inventory', async () => {
    (prisma.inventoryItem.findUnique as any).mockResolvedValue(null);
    const result = await handleConsumeItem(io, socket, { type: 'consume_item', inventoryItemId: 'inv-1' });
    expect(result).toEqual({ success: false, error: 'Item not found in character inventory.' });
  });

  it('returns error if item type is not CONSUMABLE', async () => {
    const gearItem = {
      id: 'inv-1',
      characterId: 'char1',
      quantity: 1,
      item: { id: 'item-helmet', type: 'GEAR', name: 'Helmet' },
    };
    (prisma.inventoryItem.findUnique as any).mockResolvedValue(gearItem);
    const result = await handleConsumeItem(io, socket, { type: 'consume_item', inventoryItemId: 'inv-1' });
    expect(result).toEqual({ success: false, error: 'Only consumable items can be consumed.' });
  });

  it('applies health and stamina gains and decrements inventory item quantity', async () => {
    const consumableItem = {
      id: 'inv-1',
      characterId: 'char1',
      quantity: 2,
      item: {
        id: 'item-potion',
        type: 'CONSUMABLE',
        name: 'Healing Potion',
        itemEffects: [
          {
            value: 20,
            effect: { healthGain: true, staminaGain: false }
          },
          {
            value: 10,
            effect: { healthGain: false, staminaGain: true }
          }
        ]
      },
    };

    const character = {
      id: 'char1',
      health: 50,
      stamina: 80,
      maxHealth: 100,
      maxStamina: 100,
      status: 'ACTIVE'
    };

    const updatedChar = {
      ...character,
      health: 70,
      stamina: 90,
      maxInventorySlots: 25,
      inventory: [
        {
          id: 'inv-1',
          quantity: 1,
          equipped: false,
          item: consumableItem.item
        }
      ]
    };

    (prisma.inventoryItem.findUnique as any).mockResolvedValue(consumableItem);
    (prisma.character.findUnique as any)
      .mockResolvedValueOnce(character) // first fetch before apply
      .mockResolvedValueOnce(updatedChar); // second fetch after transaction

    const result = await handleConsumeItem(io, socket, { type: 'consume_item', inventoryItemId: 'inv-1' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      itemName: 'Healing Potion',
      healthRecovered: 20,
      staminaRecovered: 10
    });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { quantity: { decrement: 1 } }
    });

    expect(characterBroadcast.broadcastStatUpdate).toHaveBeenCalledWith('char1', expect.objectContaining({
      health: 70,
      stamina: 90
    }));
  });
});
