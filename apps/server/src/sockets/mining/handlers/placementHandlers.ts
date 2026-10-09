import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { ITEM_ROLE_WHERE, type GameEventResult, sanitizeTilePosition } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { broadcastInventory, consumeInventoryItem, refundInventoryItem } from './inventoryActions';

/**
 * Handler: mining_place_ladder
 * Places a ladder at target position or player's current tile.
 * Order: validate placement -> atomically consume the item -> commit placement
 * (refunding the item if the commit is refused after consuming).
 */
export const handleMiningPlaceLadder = async (
  io: Server,
  socket: Socket,
  payload: { target?: { x: number; y: number } },
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  let target: { x: number; y: number } | undefined;
  if (payload?.target !== undefined && payload?.target !== null) {
    const clean = sanitizeTilePosition(payload.target);
    if (!clean) return { success: false, error: 'Invalid target.' };
    target = clean;
  }

  // 1. Check if user has a ladder in character inventory
  const ladder = await prisma.inventoryItem.findFirst({
    where: {
      characterId,
      quantity: { gt: 0 },
      item: ITEM_ROLE_WHERE.ladder,
    },
    include: { item: true },
  });

  if (!ladder) {
    return { success: false, error: 'You do not have a ladder to place.' };
  }

  // 2. Validate placement before touching the inventory
  if (!engine.canPlaceLadder(characterId, target)) {
    return { success: false, error: 'Cannot place ladder here.' };
  }

  // 3. Atomically consume; fails if a concurrent request already used the last one
  if (!(await consumeInventoryItem(characterId, ladder.id))) {
    return { success: false, error: 'You do not have a ladder to place.' };
  }

  // 4. Commit placement (state may have changed while awaiting the DB)
  if (!engine.placeLadder(characterId, target)) {
    await refundInventoryItem(characterId, ladder.itemId);
    await broadcastInventory(characterId);
    return { success: false, error: 'Cannot place ladder here.' };
  }

  await broadcastInventory(characterId);
  return { success: true };
};

/**
 * Handler: mining_place_torch
 * Places a torch at target position if the player has one in inventory and the target is in reach.
 * Order: validate placement -> atomically consume -> commit (refund if refused).
 */
export const handleMiningPlaceTorch = async (
  io: Server,
  socket: Socket,
  payload: { target: { x: number; y: number } },
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  const torchTarget = sanitizeTilePosition(payload?.target);
  if (!torchTarget) {
    return { success: false, error: 'Target position is required.' };
  }

  // 1. Check if user has a torch in character inventory
  const torch = await prisma.inventoryItem.findFirst({
    where: {
      characterId,
      quantity: { gt: 0 },
      item: ITEM_ROLE_WHERE.torch,
    },
    include: { item: true },
  });

  if (!torch) {
    return { success: false, error: 'You do not have a torch to place.' };
  }

  const placeError = 'Cannot place torch here (must be within 1 tile on an empty revealed space).';

  // 2. Validate placement before touching the inventory
  if (!engine.canPlaceTorch(characterId, torchTarget)) {
    return { success: false, error: placeError };
  }

  // 3. Atomically consume
  if (!(await consumeInventoryItem(characterId, torch.id))) {
    return { success: false, error: 'You do not have a torch to place.' };
  }

  // 4. Commit placement
  if (!engine.placeTorch(characterId, torchTarget)) {
    await refundInventoryItem(characterId, torch.itemId);
    await broadcastInventory(characterId);
    return { success: false, error: placeError };
  }

  await broadcastInventory(characterId);
  return { success: true };
};
