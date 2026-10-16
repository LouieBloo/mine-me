import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { ITEM_ROLE_WHERE, type GameEventResult, sanitizeTilePosition } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { inventoryActionsFor } from './inventoryActions';
import type { PlacementProblem } from '../../../services/mining/subsystems/MiningBlockSubsystem';

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
  const inventory = inventoryActionsFor(engine.rules.persistsCharacter);

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
  if (!(await inventory.consume(characterId, ladder.id))) {
    return { success: false, error: 'You do not have a ladder to place.' };
  }

  // 4. Commit placement (state may have changed while awaiting the DB)
  if (!engine.placeLadder(characterId, target)) {
    await inventory.refund(characterId, ladder.itemId);
    await inventory.broadcast(characterId);
    return { success: false, error: 'Cannot place ladder here.' };
  }

  await inventory.broadcast(characterId);
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
  const inventory = inventoryActionsFor(engine.rules.persistsCharacter);

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
  if (!(await inventory.consume(characterId, torch.id))) {
    return { success: false, error: 'You do not have a torch to place.' };
  }

  // 4. Commit placement
  if (!engine.placeTorch(characterId, torchTarget, torch.itemId)) {
    await inventory.refund(characterId, torch.itemId);
    await inventory.broadcast(characterId);
    return { success: false, error: placeError };
  }

  await inventory.broadcast(characterId);
  return { success: true };
};

const BRIDGE_PROBLEM_TEXT: Record<PlacementProblem, string> = {
  no_player: 'No active player.',
  out_of_bounds: 'Cannot place a bridge outside the mine.',
  out_of_reach: 'Cannot place bridge here: too far away.',
  hidden: 'Cannot place bridge here: you have not uncovered that space yet.',
  occupied: 'Cannot place bridge here: that space is not empty.',
  body_in_way: 'Cannot place bridge here: a player or mob is in that space.',
};

/**
 * Handler: mining_place_bridge
 * Places a bridge (a solid, walkable tile) at the target if the player has one and the cell is empty and in reach.
 * Order: validate placement -> atomically consume -> commit (refund if refused).
 */
export const handleMiningPlaceBridge = async (
  io: Server,
  socket: Socket,
  payload: { target: { x: number; y: number } },
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };
  const inventory = inventoryActionsFor(engine.rules.persistsCharacter);

  const target = sanitizeTilePosition(payload?.target);
  if (!target) return { success: false, error: 'Target position is required.' };

  const bridge = await prisma.inventoryItem.findFirst({
    where: { characterId, quantity: { gt: 0 }, item: ITEM_ROLE_WHERE.bridge },
    include: { item: true },
  });
  if (!bridge) return { success: false, error: 'You do not have a bridge to place.' };

  const problem = engine.bridgePlacementProblem(characterId, target);
  if (problem) return { success: false, error: BRIDGE_PROBLEM_TEXT[problem] };
  const placeError = BRIDGE_PROBLEM_TEXT.occupied;

  if (!(await inventory.consume(characterId, bridge.id))) {
    return { success: false, error: 'You do not have a bridge to place.' };
  }

  if (!engine.placeBridge(characterId, target)) {
    await inventory.refund(characterId, bridge.itemId);
    await inventory.broadcast(characterId);
    return { success: false, error: placeError };
  }

  await inventory.broadcast(characterId);
  return { success: true };
};
