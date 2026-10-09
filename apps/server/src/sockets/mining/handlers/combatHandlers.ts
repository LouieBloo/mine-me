import { Server, Socket } from 'socket.io';
import { prisma } from '../../../index';
import { ITEM_ROLE_WHERE, type GameEventResult, type Vector2D, sanitizeWorldPoint } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { broadcastInventory, consumeInventoryItem, refundInventoryItem } from './inventoryActions';

/**
 * Handler: mining_throw_dynamite & mining_throw_item
 * Throws a throwable item (dynamite, bomb, etc.) towards target position.
 * The client must say which item (itemId); the server verifies the character owns it and that
 * it is throwable, atomically consumes one, then launches it (refunding if the launch fails).
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

  const throwTarget = sanitizeWorldPoint(payload?.target);
  if (!throwTarget) {
    return { success: false, error: 'Target position is required.' };
  }
  if (typeof payload.itemId !== 'string' || payload.itemId.length === 0) {
    return { success: false, error: 'No throwable item specified.' };
  }
  const forceRatio =
    typeof payload.forceRatio === 'number' && Number.isFinite(payload.forceRatio)
      ? Math.min(1, Math.max(0, payload.forceRatio))
      : undefined;

  // 1. Check the character owns the specified item and that it is throwable
  const inventoryItemToThrow: any = await prisma.inventoryItem.findFirst({
    where: {
      characterId,
      itemId: payload.itemId,
      quantity: { gt: 0 },
      item: ITEM_ROLE_WHERE.throwable,
    } as any,
    include: {
      item: {
        include: {
          itemEffects: {
            include: { effect: true },
          },
        },
      },
    },
  });

  if (!inventoryItemToThrow) {
    return { success: false, error: 'You do not have that throwable item.' };
  }

  // 2. Atomically consume one; fails if a concurrent request already used the last one
  if (!(await consumeInventoryItem(characterId, inventoryItemToThrow.id))) {
    return { success: false, error: 'You do not have that throwable item.' };
  }

  // 3. Launch throwable item in server engine (calculates throw trajectory & starts fuse)
  const itemPhysicsConfig = ((inventoryItemToThrow.item as any).physicsConfig as any) || undefined;
  const explodeEffect = (inventoryItemToThrow.item as any)?.itemEffects?.find(
    (ie: any) => ie.effect?.explodes === true && ie.value > 0
  );
  const explosionRadius = explodeEffect ? Number(explodeEffect.value) : undefined;
  const soundEffects = (inventoryItemToThrow.item as any)?.soundEffects || undefined;

  const thrown = engine.throwDynamite(characterId, {
    target: throwTarget,
    forceRatio,
    itemId: inventoryItemToThrow.item?.id,
    physicsConfig: itemPhysicsConfig,
    soundEffects,
    explosionRadius,
  });
  if (!thrown) {
    await refundInventoryItem(characterId, inventoryItemToThrow.itemId);
    await broadcastInventory(characterId);
    return { success: false, error: 'Failed to throw item.' };
  }

  await broadcastInventory(characterId);
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
  payload: { target: Vector2D; muzzlePosition?: Vector2D; itemId?: string; weaponItemId?: string }
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const engine = miningSessionManager.getSession(characterId);
  if (!engine) return { success: false, error: 'No active mining session.' };

  const shootTarget = sanitizeWorldPoint(payload?.target);
  if (!shootTarget) {
    return { success: false, error: 'Target position is required.' };
  }
  // Muzzle is optional; a malformed one is ignored and the server computes it.
  const muzzle = payload.muzzlePosition ? sanitizeWorldPoint(payload.muzzlePosition) ?? undefined : undefined;

  // The weapon is resolved server-side from the character's equipped gear; any client-sent
  // weaponItemId / itemId is ignored.
  const result = engine.shootProjectile(characterId, shootTarget, muzzle);
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
