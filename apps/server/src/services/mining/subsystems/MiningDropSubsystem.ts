import * as planck from 'planck';
import {
  MiningTileType,
  type MiningDroppedItem,
  type MiningRigidWorld,
} from '@mine-me/shared';
import type { MiningDataManager } from './MiningDataManager';
import type { MiningPlayerSession } from './MiningPlayerManager';

export class MiningDropSubsystem {
  public droppedItems: MiningDroppedItem[] = [];
  public activeItemBodies: Map<string, planck.Body> = new Map();
  public droppedItemCounter = 0;
  public droppedItemsDirty: boolean = true;

  public spawnBlockDrops(
    tx: number,
    ty: number,
    tileType: MiningTileType,
    getBlockConfig: (tileType: MiningTileType) => any,
    getItemData: (itemId: string) => any,
    rigidWorld: MiningRigidWorld
  ): void {
    if (tileType === MiningTileType.EMPTY || tileType === MiningTileType.ENTRANCE) return;

    const blockConfig = getBlockConfig(tileType);
    const dropTable = blockConfig?.dropTable;
    const dropsToSpawn: { itemId: string; quantity: number }[] = [];

    if (dropTable && Array.isArray(dropTable.items) && dropTable.items.length > 0) {
      for (const entry of dropTable.items) {
        const roll = Math.random() * 100;
        if (roll <= entry.chance) {
          const qty =
            Math.floor(Math.random() * (entry.maxQuantity - entry.minQuantity + 1)) +
            entry.minQuantity;
          if (qty > 0) {
            dropsToSpawn.push({ itemId: entry.itemId, quantity: qty });
          }
        }
      }
    } else {
      // Fallback for legacy blocks without drop tables configured
      if (tileType === MiningTileType.MINERAL) {
        dropsToSpawn.push({ itemId: 'copper_ore', quantity: 1 });
      } else if (tileType === MiningTileType.CHEST) {
        dropsToSpawn.push({ itemId: 'sol', quantity: 50 });
      }
    }

    if (dropsToSpawn.length === 0) return;

    const N = dropsToSpawn.length;
    dropsToSpawn.forEach((drop, idx) => {
      this.droppedItemCounter++;
      const id = `drop_${Date.now()}_${this.droppedItemCounter}_${idx}`;
      const itemData = getItemData(drop.itemId);

      // Spread out multiple items so they don't overlap
      const offsetX = N > 1 ? (idx - (N - 1) / 2) * 0.25 : 0;
      const posX = tx + 0.5 + offsetX;
      const posY = ty + 0.5;

      const vx =
        N > 1
          ? (idx - (N - 1) / 2) * 1.5 + (Math.random() - 0.5) * 0.4
          : (Math.random() - 0.5) * 0.5;
      const vy =
        N > 1 ? -2.2 - Math.random() * 1.0 : -1.8 - Math.random() * 0.6;

      const rigidBody = rigidWorld.createItemBody(
        id,
        { x: posX, y: posY },
        { x: vx, y: vy }
      );
      this.activeItemBodies.set(id, rigidBody);

      this.droppedItems.push({
        id,
        position: { x: posX, y: posY },
        velocity: { x: vx, y: vy },
        itemId: drop.itemId,
        itemName: itemData?.name || drop.itemId,
        iconUrl: itemData?.iconUrl || null,
        inGameSpriteUrl: itemData?.inGameSpriteUrl || null,
        quantity: drop.quantity,
        physicsConfig: itemData?.physicsConfig,
        particleEffectId: itemData?.particleEffectId || null,
        lightConfig: itemData?.lightConfig || null,
        inGameScale:
          typeof (itemData as any)?.inGameScale === 'number'
            ? (itemData as any).inGameScale
            : 1.0,
      });
    });

    this.droppedItemsDirty = true;
  }

  public updateDroppedItemsPhysics(): void {
    if (this.droppedItems.length === 0) return;

    let anyMoved = false;
    for (const item of this.droppedItems) {
      if (!item.id) continue;
      const body = this.activeItemBodies.get(item.id);
      if (body) {
        const pos = body.getPosition();
        const vel = body.getLinearVelocity();

        if (
          Math.abs(item.position.x - pos.x) > 0.001 ||
          Math.abs(item.position.y - pos.y) > 0.001
        ) {
          anyMoved = true;
        }

        item.position.x = pos.x;
        item.position.y = pos.y;
        item.velocity = { x: vel.x, y: vel.y };
      }
    }

    if (anyMoved) {
      this.droppedItemsDirty = true;
    }
  }

  public checkItemPickupsForPlayer(
    session: MiningPlayerSession,
    rigidWorld: MiningRigidWorld
  ): void {
    if (this.droppedItems.length === 0) return;

    const remainingItems: MiningDroppedItem[] = [];
    const playerPos = session.playerBody.position;

    for (const item of this.droppedItems) {
      const dx = Math.abs(item.position.x - playerPos.x);
      const dy = Math.abs(item.position.y - playerPos.y);

      // AABB overlap check for pickup
      if (dx <= 0.95 && dy <= 0.95) {
        // Collect into player temporaryBackpack
        const existing = session.temporaryBackpack.find((b) => b.itemId === item.itemId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          session.temporaryBackpack.push({
            itemId: item.itemId,
            quantity: item.quantity,
            itemName: item.itemName,
            iconUrl: item.iconUrl || null,
          });
        }
        session.backpackDirty = true;
        this.droppedItemsDirty = true;

        // Clean up rigid body from Planck simulation
        if (item.id) {
          const body = this.activeItemBodies.get(item.id);
          if (body) {
            rigidWorld.destroyBody(body);
            this.activeItemBodies.delete(item.id);
          }
        }
      } else {
        remainingItems.push(item);
      }
    }

    if (remainingItems.length !== this.droppedItems.length) {
      this.droppedItems = remainingItems;
    }
  }
}
