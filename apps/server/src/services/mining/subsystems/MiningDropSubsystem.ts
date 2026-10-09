import * as planck from 'planck';
import {
  MINING_CONFIG,
  MiningTileType,
  rollDropTable,
  type MiningDroppedItem,
  type RolledDrop,
  type Vector2D,
} from '@mine-me/shared';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { MiningWorld } from '../MiningWorld';

export class MiningDropSubsystem {
  public droppedItems: MiningDroppedItem[] = [];
  public activeItemBodies: Map<string, planck.Body> = new Map();
  public droppedItemCounter = 0;
  public droppedItemsDirty: boolean = true;
  private lastLimitWarningAt = -Infinity;

  constructor(private readonly world: MiningWorld) {}

  /**
   * How many of `requested` new drops may be created. Items never despawn, so the room is capped
   * at MAX_DROPPED_ITEMS as a safety net; drops beyond it are skipped (and logged, at most every
   * few seconds) rather than evicting items that are already on the floor.
   */
  public reserveDropSlots(requested: number): number {
    const free = Math.max(0, MINING_CONFIG.MAX_DROPPED_ITEMS - this.droppedItems.length);
    if (requested <= free) return requested;

    const now = Date.now(); // log throttling only; never used for game logic
    if (now - this.lastLimitWarningAt > 5000) {
      this.lastLimitWarningAt = now;
      console.warn(
        `[Mining] Dropped item limit (${MINING_CONFIG.MAX_DROPPED_ITEMS}) reached; skipping ${requested - free} drop(s)`
      );
    }
    return free;
  }

  /** Rolls a mined block's drop table and drops the result at the tile. */
  public spawnBlockDrops(tx: number, ty: number, tileType: MiningTileType): void {
    if (tileType === MiningTileType.EMPTY || tileType === MiningTileType.ENTRANCE) return;

    // The block's drop table (from the database) is the only source of loot: no table, no drops.
    const dropTable = this.world.data.getBlockConfig(tileType)?.dropTable;
    this.spawnDrops(rollDropTable(dropTable), { x: tx + 0.5, y: ty + 0.5 });
  }

  /**
   * Drops a batch of items around `origin`: spread out so they don't overlap, popped upward with a
   * little randomness, each backed by a physics body. The one place dropped items are created
   * (blocks and mobs both use it). Respects the room's item limit.
   */
  public spawnDrops(drops: RolledDrop[], origin: Vector2D): void {
    const batch = drops.slice(0, this.reserveDropSlots(drops.length));
    if (batch.length === 0) return;

    const N = batch.length;
    batch.forEach((drop, idx) => {
      this.droppedItemCounter++;
      const id = `drop_${Date.now()}_${this.droppedItemCounter}_${idx}`;
      const itemData = this.world.data.getItemData(drop.itemId);

      const posX = origin.x + (N > 1 ? (idx - (N - 1) / 2) * 0.25 : 0);
      const posY = origin.y;

      const vx =
        N > 1
          ? (idx - (N - 1) / 2) * 1.5 + (Math.random() - 0.5) * 0.4
          : (Math.random() - 0.5) * 0.5;
      const vy = N > 1 ? -2.2 - Math.random() * 1.0 : -1.8 - Math.random() * 0.6;

      const rigidBody = this.world.rigidWorld.createItemBody(id, { x: posX, y: posY }, { x: vx, y: vy });
      this.activeItemBodies.set(id, rigidBody);

      this.droppedItems.push({
        id,
        position: { x: posX, y: posY },
        velocity: { x: vx, y: vy },
        // Store the canonical DB id (drop tables may reference an itemKey)
        itemId: itemData?.id ?? drop.itemId,
        itemName: itemData?.name || drop.itemId,
        iconUrl: itemData?.iconUrl || null,
        inGameSpriteUrl: itemData?.inGameSpriteUrl || null,
        quantity: drop.quantity,
        physicsConfig: itemData?.physicsConfig,
        particleEffectId: itemData?.particleEffectId || null,
        lightConfig: itemData?.lightConfig || null,
        inGameScale: typeof itemData?.inGameScale === 'number' ? itemData.inGameScale : 1.0,
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

  public checkItemPickupsForPlayer(session: MiningPlayerSession): void {
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
            this.world.rigidWorld.destroyBody(body);
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
