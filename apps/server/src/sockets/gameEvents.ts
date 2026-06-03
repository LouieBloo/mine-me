import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { broadcastStatUpdate } from '../services/characterBroadcast';
import { handleStartCombat, handleCombatAction, handleLeaveCombat, handleAdvanceDungeonLevel } from './combatEvents';
import { handleTrainingAction } from './trainingEvents';
import { handleMine } from './miningEvents';
import { type GameEventPayload, type GameEventResult, type ChangeCityPayload, type RestPayload, calculateTravelDays, getStaminaRecoveryPerDay } from '@nvg/shared';

// ============================================================================
// Game Event Handler Registry
//
// Each handler receives the io server, the authenticated socket, the typed
// payload, and returns a GameEventResult. Adding a new event:
//   1. Write a handler function
//   2. Register it in gameEventHandlers
// ============================================================================

/** Signature for a game event handler function. */
type GameEventHandler<T extends GameEventPayload = GameEventPayload> = (
  io: Server,
  socket: Socket,
  payload: T,
) => Promise<GameEventResult>;

// ----------------------------------------------------------------------------
// Handler: change_city
// Moves the character to a new city, calculating travel distance and aging.
// ----------------------------------------------------------------------------
const handleChangeCity: GameEventHandler<ChangeCityPayload> = async (io, socket, payload) => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected. Call select_character first.' };
  }

  const { cityId } = payload;
  if (!cityId) {
    return { success: false, error: 'cityId is required.' };
  }

  // Fetch character and verify ownership
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { success: false, error: 'Character not found.' };
  }

  if (character.userId !== userId) {
    return { success: false, error: 'Forbidden: character does not belong to this user.' };
  }

  if (character.status !== 'ACTIVE') {
    return { success: false, error: 'Only active characters can travel.' };
  }

  if (character.cityId === cityId) {
    return { success: false, error: 'Character is already in this city.' };
  }

  // Fetch both cities for distance calculation
  const [currentCity, targetCity] = await Promise.all([
    prisma.city.findUnique({ where: { id: character.cityId } }),
    prisma.city.findUnique({ where: { id: cityId } }),
  ]);

  if (!currentCity || !targetCity) {
    return { success: false, error: 'City not found.' };
  }

  // Euclidean distance → travel days
  const distance = calculateTravelDays(currentCity as any, targetCity as any);

  // Update character in DB
  const updatedCharacter = await prisma.character.update({
    where: { id: characterId },
    data: {
      cityId,
      ageInDays: { increment: distance },
    },
  });

  // Leave old city room, join new one
  const oldCityRoom = `city:${character.cityId}`;
  const newCityRoom = `city:${cityId}`;

  socket.leave(oldCityRoom);
  socket.to(oldCityRoom).emit('player_left_city', { characterId });

  socket.join(newCityRoom);
  socket.to(newCityRoom).emit('player_entered_city', {
    characterId,
    name: character.name,
    combatScore: character.combatScore,
  });

  // Push new city data to this socket
  const cityData = {
    id: targetCity.id,
    name: targetCity.name,
    description: targetCity.description,
    backgroundImageUrl: targetCity.backgroundImageUrl,
    worldPositionX: targetCity.worldPositionX,
    worldPositionY: targetCity.worldPositionY,
  };

  socket.emit('city_data', cityData);

  // Broadcast stat update to the character's personal room
  broadcastStatUpdate(characterId, {
    ageInDays: updatedCharacter.ageInDays,
    cityId,
  });

  console.log(`[GameEvent] change_city: ${character.name} → ${targetCity.name} (${distance} days)`);

  return {
    success: true,
    data: {
      cityId,
      ageInDays: updatedCharacter.ageInDays,
      distance,
      cityName: targetCity.name,
    },
  };
};

// ----------------------------------------------------------------------------
// Handler: rest
// Restores health and stamina to max, ages the character by 1 day.
// ----------------------------------------------------------------------------
const handleRest: GameEventHandler<RestPayload> = async (io, socket, payload) => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected. Call select_character first.' };
  }

  const { days } = payload;
  const requestedDays = days ?? 1;

  if (days !== undefined && (!Number.isInteger(days) || days <= 0)) {
    return { success: false, error: 'Invalid days parameter. Must be a positive integer.' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character || character.userId !== userId) {
    return { success: false, error: 'Character not found or forbidden.' };
  }

  if (character.status !== 'ACTIVE') {
    return { success: false, error: 'Only active characters can rest.' };
  }

  const recoveryPerDay = getStaminaRecoveryPerDay(character as any);
  const staminaRecovered = requestedDays * recoveryPerDay;
  const newAge = character.ageInDays + requestedDays;
  const isDead = newAge >= 36000;

  const updateData: any = {
    ageInDays: newAge,
  };

  if (isDead) {
    updateData.status = 'DEAD';
    updateData.health = 0;
    updateData.stamina = 0;
  } else {
    updateData.health = character.maxHealth;
    updateData.stamina = Math.min(character.maxStamina, character.stamina + staminaRecovered);
  }

  const updatedCharacter = await prisma.character.update({
    where: { id: characterId },
    data: updateData,
  });

  broadcastStatUpdate(characterId, {
    health: updatedCharacter.health,
    stamina: updatedCharacter.stamina,
    ageInDays: updatedCharacter.ageInDays,
    status: updatedCharacter.status as any,
  });

  return {
    success: true,
    data: {
      died: isDead,
    },
  };
};

// ----------------------------------------------------------------------------
// Handler: equip_item
// Equips a gear item, unequipping any currently equipped item of the same subtype.
// ----------------------------------------------------------------------------
const handleEquipItem: GameEventHandler<any> = async (io, socket, payload) => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const { inventoryItemId } = payload;
  if (!inventoryItemId) {
    return { success: false, error: 'inventoryItemId is required.' };
  }

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    include: { item: true }
  });

  if (!inventoryItem || inventoryItem.characterId !== characterId) {
    return { success: false, error: 'Item not found in character inventory.' };
  }

  if (inventoryItem.item.type !== 'GEAR') {
    return { success: false, error: 'Only gear can be equipped.' };
  }

  const subType = inventoryItem.item.subType;

  // Transaction to unequip other items in same slot and equip this one
  await prisma.$transaction(async (tx) => {
    // Find currently equipped item of same subtype
    const currentlyEquipped = await tx.inventoryItem.findFirst({
      where: {
        characterId,
        equipped: true,
        item: { subType }
      }
    });

    if (currentlyEquipped) {
      await tx.inventoryItem.update({
        where: { id: currentlyEquipped.id },
        data: { equipped: false }
      });
    }

    // Equip the new item
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { equipped: true }
    });
  });

  // Fetch updated character inventory
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      inventory: {
        include: { item: true }
      }
    }
  });

  if (!character) {
    return { success: false, error: 'Character not found.' };
  }

  const clientInventory = {
    slots: character.maxInventorySlots,
    items: character.inventory.map(inv => ({
      id: inv.id,
      item: {
        id: inv.item.id,
        name: inv.item.name,
        description: inv.item.description,
        type: inv.item.type as any,
        subType: inv.item.subType as any,
        priceSol: inv.item.vendorSellPrice,
        rarity: inv.item.rarity as any,
        iconUrl: inv.item.iconUrl,
        gearImageUrl: inv.item.gearImageUrl,
        isStartingPiece: inv.item.isStartingPiece,
        experience: inv.item.experience,
        combatScore: inv.item.combatScore,
        defenseScore: inv.item.defenseScore,
      },
      quantity: inv.quantity,
      equipped: inv.equipped,
    })),
  };

  const clientGear = {
    head: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'HEAD')?.item as any,
    shoulders: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'SHOULDERS')?.item as any,
    chest: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'CHEST')?.item as any,
    gauntlets: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'GAUNTLETS')?.item as any,
    leggings: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'LEGGINGS')?.item as any,
    boots: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'BOOTS')?.item as any,
    weapon: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'WEAPON')?.item as any,
  };

  broadcastStatUpdate(characterId, {
    inventory: clientInventory,
    gear: clientGear
  });

  return { success: true };
};

// ----------------------------------------------------------------------------
// Handler: unequip_item
// Unequips a currently equipped gear item.
// ----------------------------------------------------------------------------
const handleUnequipItem: GameEventHandler<any> = async (io, socket, payload) => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) {
    return { success: false, error: 'No character selected.' };
  }

  const { inventoryItemId } = payload;
  if (!inventoryItemId) {
    return { success: false, error: 'inventoryItemId is required.' };
  }

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId }
  });

  if (!inventoryItem || inventoryItem.characterId !== characterId) {
    return { success: false, error: 'Item not found in character inventory.' };
  }

  await prisma.inventoryItem.update({
    where: { id: inventoryItemId },
    data: { equipped: false }
  });

  // Fetch updated character inventory
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      inventory: {
        include: { item: true }
      }
    }
  });

  if (!character) {
    return { success: false, error: 'Character not found.' };
  }

  const clientInventory = {
    slots: character.maxInventorySlots,
    items: character.inventory.map(inv => ({
      id: inv.id,
      item: {
        id: inv.item.id,
        name: inv.item.name,
        description: inv.item.description,
        type: inv.item.type as any,
        subType: inv.item.subType as any,
        priceSol: inv.item.vendorSellPrice,
        rarity: inv.item.rarity as any,
        iconUrl: inv.item.iconUrl,
        gearImageUrl: inv.item.gearImageUrl,
        isStartingPiece: inv.item.isStartingPiece,
        experience: inv.item.experience,
        combatScore: inv.item.combatScore,
        defenseScore: inv.item.defenseScore,
      },
      quantity: inv.quantity,
      equipped: inv.equipped,
    })),
  };

  const clientGear = {
    head: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'HEAD')?.item as any,
    shoulders: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'SHOULDERS')?.item as any,
    chest: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'CHEST')?.item as any,
    gauntlets: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'GAUNTLETS')?.item as any,
    leggings: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'LEGGINGS')?.item as any,
    boots: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'BOOTS')?.item as any,
    weapon: character.inventory.find(inv => inv.equipped && inv.item.type === 'GEAR' && inv.item.subType === 'WEAPON')?.item as any,
  };

  broadcastStatUpdate(characterId, {
    inventory: clientInventory,
    gear: clientGear
  });

  return { success: true };
};

// ----------------------------------------------------------------------------
// Handler Registry — maps event type strings to their handler functions.
// To add a new event, just add an entry here.
// ----------------------------------------------------------------------------
export const gameEventHandlers: Record<string, GameEventHandler<any>> = {
  change_city: handleChangeCity,
  start_combat: handleStartCombat,
  combat_action: handleCombatAction,
  leave_combat: handleLeaveCombat,
  advance_dungeon_level: handleAdvanceDungeonLevel,
  rest: handleRest,
  training_action: handleTrainingAction,
  mine: handleMine,
  equip_item: handleEquipItem,
  unequip_item: handleUnequipItem,
};

// ----------------------------------------------------------------------------
// Dispatcher — called from the main socket connection handler.
// Looks up the handler by event type and executes it.
// ----------------------------------------------------------------------------
export const dispatchGameEvent = async (
  io: Server,
  socket: Socket,
  payload: GameEventPayload,
  callback?: (result: GameEventResult) => void,
): Promise<void> => {
  try {
    if (!payload?.type) {
      if (callback) callback({ success: false, error: 'Missing event type.' });
      return;
    }

    const handler = gameEventHandlers[payload.type];
    if (!handler) {
      console.warn(`[GameEvent] Unknown event type: ${payload.type}`);
      if (callback) callback({ success: false, error: `Unknown event type: ${payload.type}` });
      return;
    }

    const result = await handler(io, socket, payload);
    if (callback) callback(result);
  } catch (err: any) {
    console.error(`[GameEvent] Error handling ${payload?.type}:`, err);
    if (callback) callback({ success: false, error: 'Internal server error.' });
  }
};
