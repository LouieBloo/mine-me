import * as planck from 'planck';
import {
  BLOCK_SCALE,
  MINING_CONFIG,
  MiningTileType,
  PLACED_ITEM_TILES,
  carryRoom,
  rollDropTable,
  type MiningDroppedItem,
  type MiningItemPickupEvent,
  type RolledDrop,
  type Vector2D,
} from '@mine-me/shared';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { MiningWorld } from '../MiningWorld';

/** How close (tiles, either axis) a player's centre must be to a dropped item to pick it up. */
const PICKUP_REACH = 0.95 * BLOCK_SCALE;

/**
 * An item that moves slower than this (tiles/s) for REST_TICKS ticks in a row is put to sleep. Box2D would do it itself,
 * but at the game's gravity (56) a body resting on a block keeps a steady push-out speed of about 0.3 and sinks about
 * 0.02 tiles into it, which is past Box2D's own sleep limits, so every item would otherwise stay awake for ever. A
 * sleeping body wakes by itself when anything it rests on is removed or something hits it.
 */
const REST_SPEED = 0.3 * BLOCK_SCALE;
const REST_TICKS = 10;

export class MiningDropSubsystem {
  public droppedItems: MiningDroppedItem[] = [];
  public activeItemBodies: Map<string, planck.Body> = new Map();
  public droppedItemCounter = 0;
  /** For each item, how many ticks in a row it has hardly moved. */
  private readonly restTicks = new Map<string, number>();
  public droppedItemsDirty: boolean = true;
  private lastLimitWarningAt = -Infinity;
  private pendingPickups: MiningItemPickupEvent[] = [];

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
    if (tileType === MiningTileType.EMPTY) return;

    // A tile an item places (a bridge) has no block row: mining it gives back the item that places it
    const placer = PLACED_ITEM_TILES.find((p) => p.tileType === tileType);
    if (placer) {
      const item = this.world.data.getItems().find((i) => placer.matches(i));
      if (item) this.spawnDrops([{ itemId: item.id, quantity: 1 }], { x: tx + 0.5, y: ty + 0.5 });
      return;
    }

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

      const posX = origin.x + (N > 1 ? (idx - (N - 1) / 2) * 0.25 * BLOCK_SCALE : 0);
      const posY = origin.y;

      const vx =
        N > 1
          ? (idx - (N - 1) / 2) * 1.5 * BLOCK_SCALE + (Math.random() - 0.5) * 0.4 * BLOCK_SCALE
          : (Math.random() - 0.5) * 0.5 * BLOCK_SCALE;
      const vy = N > 1 ? (-2.2 - Math.random() * 1.0) * BLOCK_SCALE : (-1.8 - Math.random() * 0.6) * BLOCK_SCALE;

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
        physicsConfig: itemData?.physicsConfig ?? undefined,
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
        // (a body put to sleep stands still: report that, not the small speed it had a moment ago)
        if (this.putToRestWhenStill(item.id, body, Math.hypot(vel.x, vel.y))) item.velocity = { x: 0, y: 0 };
      }
    }

    if (anyMoved) {
      this.droppedItemsDirty = true;
    }
  }

  /** Counts the ticks an item has been (nearly) still and lets its body sleep once it has been for REST_TICKS in a row. True when it just went to sleep. */
  private putToRestWhenStill(id: string, body: planck.Body, speed: number): boolean {
    if (!body.isAwake()) {
      this.restTicks.set(id, 0); // asleep; if it is woken it has to be still for a while again before it sleeps
      return false;
    }
    const still = speed < REST_SPEED ? (this.restTicks.get(id) ?? 0) + 1 : 0;
    this.restTicks.set(id, still);
    if (still < REST_TICKS) return false;
    body.setAwake(false);
    return true;
  }

  public checkItemPickupsForPlayer(session: MiningPlayerSession): void {
    if (this.droppedItems.length === 0) return;

    const remainingItems: MiningDroppedItem[] = [];
    const playerPos = session.playerBody.position;
    let pickedUp = false;

    for (const item of this.droppedItems) {
      const dx = Math.abs(item.position.x - playerPos.x);
      const dy = Math.abs(item.position.y - playerPos.y);

      // AABB overlap check for pickup
      if (dx <= PICKUP_REACH && dy <= PICKUP_REACH) {
        // Only what fits under the carry capacity goes in; the rest stays on the ground
        const room = carryRoom(session.temporaryBackpack, item.itemId, session.carryCapacity, this.weightOf);
        const taken = Math.min(item.quantity, room);
        if (taken < item.quantity) this.noteBackpackFull(session);
        if (taken > 0) {
          this.addToBackpack(session, item, taken);
          pickedUp = true;
        }
        if (taken < item.quantity) {
          item.quantity -= taken;
          remainingItems.push(item);
          this.droppedItemsDirty = true;
          continue;
        }

        // Clean up rigid body from Planck simulation
        if (item.id) {
          const body = this.activeItemBodies.get(item.id);
          if (body) {
            this.world.rigidWorld.destroyBody(body);
            this.activeItemBodies.delete(item.id);
            this.restTicks.delete(item.id);
          }
        }
      } else {
        remainingItems.push(item);
      }
    }

    if (remainingItems.length !== this.droppedItems.length) {
      this.droppedItems = remainingItems;
    }

    // One pickup sound per player per tick, however many stacks were collected
    if (pickedUp) this.pendingPickups.push({ x: playerPos.x, y: playerPos.y });
  }

  /** What one unit of an item weighs, for the carry rules (read live from the item definitions). */
  private readonly weightOf = (itemId: string) => this.world.data.getItemData(itemId);

  private addToBackpack(session: MiningPlayerSession, item: MiningDroppedItem, quantity: number): void {
    const existing = session.temporaryBackpack.find((b) => b.itemId === item.itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      session.temporaryBackpack.push({ itemId: item.itemId, quantity, itemName: item.itemName, iconUrl: item.iconUrl || null });
    }
    session.backpackDirty = true;
    this.droppedItemsDirty = true;
    // Only what really went into the backpack counts toward a mission
    this.world.missions?.onItemCollected(session.characterId, item.itemId, quantity);
  }

  /** An item did not fit: tell the player, at most once every few seconds while they stand on it. */
  private noteBackpackFull(session: MiningPlayerSession): void {
    if (session.backpackFullCooldown > 0) return;
    session.backpackFullCooldown = MINING_CONFIG.BACKPACK_FULL_NOTICE_COOLDOWN_SECONDS;
    session.backpackFullPending = true;
  }

  /** The pickups since the last call, then forgets them. */
  public takePickups(): MiningItemPickupEvent[] {
    const out = this.pendingPickups;
    this.pendingPickups = [];
    return out;
  }
}
