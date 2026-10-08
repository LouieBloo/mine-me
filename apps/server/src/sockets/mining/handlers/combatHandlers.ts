import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { InventoryService } from '../../../services/inventory.service';
import { type GameEventResult, type Vector2D } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';

/**
 * Handler: mining_throw_dynamite & mining_throw_item
 * Throws a throwable item (dynamite, bomb, etc.) towards target position if player has it in inventory.
 * Authoritative: Deducts 1 item, creates physics entity with fuse,
 * and starts countdown on server with scaled throw force.
 */
export const handleMiningThrowDynamite = async (
  io: Server,
  socket: Socket,
  payload: { target: { x: number; y: number }; forceRatio?: number; itemId?: string },
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  if (!payload?.target) {
    return { success: false, error: 'Target position is required.' };
  }

  // 1. Check if user has the specific item (or any throwable / dynamite) in character inventory
  let inventoryItemToThrow: any = null;
  const itemInclude = {
    include: {
      itemEffects: {
        include: { effect: true },
      },
    },
  };

  if (payload.itemId) {
    inventoryItemToThrow = await prisma.inventoryItem.findFirst({
      where: {
        characterId,
        itemId: payload.itemId,
        quantity: { gt: 0 },
      },
      include: { item: itemInclude },
    });
  }

  if (!inventoryItemToThrow) {
    inventoryItemToThrow = await prisma.inventoryItem.findFirst({
      where: {
        characterId,
        quantity: { gt: 0 },
        OR: [
          { item: { throwable: true } },
          { item: { subType: { equals: 'DYNAMITE', mode: 'insensitive' } } },
        ],
      } as any,
      include: { item: itemInclude },
    });
  }

  if (!inventoryItemToThrow) {
    return { success: false, error: 'You do not have any dynamite or throwable items to throw.' };
  }

  // 2. Launch throwable item in server engine (calculates throw trajectory & starts fuse)
  const itemPhysicsConfig = ((inventoryItemToThrow.item as any).physicsConfig as any) || undefined;
  const explodeEffect = (inventoryItemToThrow.item as any)?.itemEffects?.find(
    (ie: any) => ie.effect?.explodes === true && ie.value > 0
  );
  const explosionRadius = explodeEffect ? Number(explodeEffect.value) : undefined;
  const soundEffects = (inventoryItemToThrow.item as any)?.soundEffects || undefined;

  const thrown = engine.throwDynamite(
    characterId,
    payload.target,
    itemPhysicsConfig,
    payload.forceRatio,
    explosionRadius,
    inventoryItemToThrow.item?.id,
    soundEffects
  );
  if (!thrown) {
    return { success: false, error: 'Failed to throw item.' };
  }

  // 3. Deduct 1 item from character inventory
  if (inventoryItemToThrow.quantity <= 1) {
    await prisma.inventoryItem.delete({
      where: { id: inventoryItemToThrow.id },
    });
  } else {
    await prisma.inventoryItem.update({
      where: { id: inventoryItemToThrow.id },
      data: { quantity: { decrement: 1 } },
    });
  }

  const updatedChar = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      inventory: {
        include: {
          item: {
            include: {
              itemEffects: {
                include: {
                  effect: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (updatedChar) {
    const mappedInventory = InventoryService.mapCharacterInventory(updatedChar);
    broadcastStatUpdate(characterId, { inventory: mappedInventory });
  }

  return { success: true };
};

export const handleMiningThrowItem = handleMiningThrowDynamite;

/**
 * Handler: mining_shoot
 * Fires a projectile from character's weapon towards target coordinates.
 * Authoritative: Validates ammo, magazine, cooldown, creates Planck.js projectile.
 */
export const handleMiningShoot = async (
  io: Server,
  socket: Socket,
  payload: { target: Vector2D; itemId?: string; weaponItemId?: string; muzzlePosition?: Vector2D }
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  if (!payload?.target) {
    return { success: false, error: 'Target position is required.' };
  }

  const weaponId = payload.weaponItemId || payload.itemId;
  const result = engine.shootProjectile(characterId, payload.target, weaponId, payload.muzzlePosition);
  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Failed to shoot weapon.',
      data: {
        remainingAmmo: result.remainingAmmo,
        isReloading: result.isReloading,
      },
    };
  }

  return {
    success: true,
    data: {
      remainingAmmo: result.remainingAmmo,
      isReloading: result.isReloading,
    },
  };
};

/**
 * Handler: mining_reload
 * Initiates authoritative weapon reload for character.
 */
export const handleMiningReload = async (
  io: Server,
  socket: Socket,
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  const result = engine.reloadWeapon(characterId);
  return {
    success: result.success,
    error: result.error,
    data: {
      remainingAmmo: result.remainingAmmo,
      isReloading: result.isReloading,
    },
  };
};
