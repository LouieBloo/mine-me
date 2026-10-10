import {
  DEFAULT_DYNAMITE_SOUNDS,
  MINING_CONFIG,
  MiningTileType,
  blastDamageAt,
  calculateThrowVelocity,
  getItemDamageEffect,
  isTileBlastProof,
  knockbackAway,
  type DamageEvent,
  type ItemPhysicsConfig,
  type ItemSoundEffectsConfig,
  type MiningExplosionEvent,
  type Vector2D,
} from '@mine-me/shared';
import { isInBounds } from '../../miningMap.service';
import { MiningDynamiteEntity } from '../physics/MiningDynamiteEntity';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { MiningWorld } from '../MiningWorld';

/** What a player throws, and how. Anything not given is taken from the item's definition. */
export interface ThrowRequest {
  /** World point the throw is aimed at. */
  target: Vector2D;
  /** How hard to throw, 0..1 (defaults to full strength). */
  forceRatio?: number;
  /** The thrown item; its physics, sounds and blast radius are looked up from this. */
  itemId?: string;
  physicsConfig?: ItemPhysicsConfig;
  soundEffects?: ItemSoundEffectsConfig | null;
  explosionRadius?: number;
}

export class MiningExplosiveSubsystem {
  public activeDynamites: MiningDynamiteEntity[] = [];
  public dynamiteCounter = 0;
  public pendingExplosions: MiningExplosionEvent[] = [];

  constructor(private readonly world: MiningWorld) {}

  public throwDynamite(session: MiningPlayerSession | undefined, request: ThrowRequest): boolean {
    if (!session) return false;
    const { data, rigidWorld } = this.world;
    const { target, forceRatio = 1.0, itemId, physicsConfig, soundEffects, explosionRadius } = request;

    this.dynamiteCounter++;
    const dynamiteId = `dynamite_${session.characterId}_${this.dynamiteCounter}_${Date.now()}`;

    const startX = session.playerBody.position.x;
    const startY = session.playerBody.position.y;

    const config = physicsConfig ?? data.getDynamiteItemPhysicsConfig();
    const throwPower = config.throwPower ?? rigidWorld.config.dynamiteThrowPower ?? 20.5;
    const gravityScale = config.gravityScale ?? 1.0;

    const initialVel = calculateThrowVelocity(
      startX,
      startY,
      target.x,
      target.y,
      forceRatio,
      throwPower,
      rigidWorld.config.gravity,
      gravityScale,
      session.isFacingLeft
    );

    // What is being thrown: the named item, or the default throwable when the throw doesn't say
    const thrown = itemId ? data.getItemData(itemId) : data.getDefaultThrowable();
    const fallbackThrowable = data.getDefaultThrowable();

    const resolvedExplosionRadius =
      explosionRadius !== undefined
        ? explosionRadius
        : thrown
          ? data.getItemExplosionRadius(thrown.id)
          : undefined;

    const resolvedSoundEffects =
      soundEffects !== undefined
        ? soundEffects
        : thrown?.soundEffects ?? fallbackThrowable?.soundEffects ?? DEFAULT_DYNAMITE_SOUNDS;

    const dynamiteScale =
      typeof thrown?.inGameScale === 'number' && thrown.inGameScale > 0 ? thrown.inGameScale : 1.0;

    const dynamite = new MiningDynamiteEntity(
      dynamiteId,
      { x: startX, y: startY },
      { x: initialVel.x, y: initialVel.y },
      config.fuseSeconds ?? 4.0,
      rigidWorld,
      {
        bounciness: config.restitution ?? 0.45,
        friction: config.friction ?? 0.4,
        physicsConfig: config,
        explosionRadius: resolvedExplosionRadius,
        itemId,
        soundEffects: resolvedSoundEffects,
        inGameScale: dynamiteScale,
        ownerId: session.characterId,
      }
    );
    this.activeDynamites.push(dynamite);
    return true;
  }

  /** Counts down fuses and detonates dynamite whose fuse ran out. */
  public updateActiveDynamites(dt: number): void {
    if (this.activeDynamites.length === 0) return;

    for (const dynamite of this.activeDynamites) {
      dynamite.update(dt);
      if (dynamite.hasExploded) {
        this.explodeDynamite(dynamite);
      }
    }

    this.activeDynamites = this.activeDynamites.filter((d) => !d.hasExploded);
  }

  public explodeDynamite(dynamite: MiningDynamiteEntity): void {
    const radius = dynamite.explosionRadius;
    if (!radius || radius <= 0) {
      return;
    }

    const { grid, rigidWorld } = this.world;
    const cx = Math.round(dynamite.position.x);
    const cy = Math.round(dynamite.position.y);
    const radiusSq = radius * radius;
    const clearedByCol = new Map<number, number[]>();

    // Queue authoritative explosion event for all clients in room
    this.pendingExplosions.push({
      id: dynamite.id,
      position: { x: dynamite.position.x, y: dynamite.position.y },
      radius,
      soundUrl: dynamite.soundEffects?.explosion?.url ?? DEFAULT_DYNAMITE_SOUNDS.explosion?.url,
    });

    const origin = { x: dynamite.position.x, y: dynamite.position.y };
    const source: DamageEvent['source'] = {
      kind: 'explosion',
      id: dynamite.id,
      ownerId: dynamite.ownerId,
      itemId: dynamite.itemId,
      position: origin,
    };
    // Blast strength comes from the explosive's own Damage effect; the config value is the fallback
    const baseDamage =
      getItemDamageEffect(dynamite.itemId ? this.world.data.getItemData(dynamite.itemId) : undefined) ||
      MINING_CONFIG.EXPLOSION_DEFAULT_DAMAGE;

    // 1. Hurt everything alive in the radius, players and mobs alike. Walls do not stop the damage:
    //    distance is the only thing that reduces it (see blastDamageAt).
    const hurt = (position: Vector2D): { amount: number; knockback: Vector2D } | null => {
      const amount = blastDamageAt(Math.hypot(position.x - origin.x, position.y - origin.y), radius, baseDamage);
      if (amount <= 0) return null;
      return {
        amount,
        knockback: knockbackAway(origin.x, position.x, {
          x: MINING_CONFIG.EXPLOSION_KNOCKBACK_X,
          y: MINING_CONFIG.EXPLOSION_KNOCKBACK_Y,
        }),
      };
    };
    for (const mob of Array.from(this.world.mobs.activeMobs.values())) {
      if (mob.health <= 0) continue;
      const blast = hurt(mob.mobBody.position);
      if (blast) this.world.damage.applyDamage({ kind: 'mob', id: mob.id }, { ...blast, type: 'explosive', source });
    }
    for (const session of Array.from(this.world.players.values())) {
      if (session.isDead) continue;
      const blast = hurt(session.playerBody.position);
      if (blast) this.world.damage.applyDamage({ kind: 'player', id: session.characterId }, { ...blast, type: 'explosive', source });
    }

    // 2. Excavate the blocks in the radius, except blast-proof ones (the entrance)
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radiusSq) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (!isInBounds(tx, ty)) continue;
        const tile = grid[ty][tx];
        if (tile.type === MiningTileType.EMPTY || isTileBlastProof(tile.type)) continue;

        const previousType = tile.type;
        tile.type = MiningTileType.EMPTY;
        tile.revealed = true;
        tile.damage = 0;
        rigidWorld.removeTileCollider(tx, ty);
        this.world.pushTileUpdate({ x: tx, y: ty, type: MiningTileType.EMPTY, damageStage: 0 });
        clearedByCol.set(tx, [...(clearedByCol.get(tx) ?? []), ty]);
        this.world.drops.spawnBlockDrops(tx, ty, previousType);
      }
    }

    // 2.5. Interrupt any player currently mining a block inside the blast zone
    for (const session of this.world.players.values()) {
      if (session.isMining && session.miningTarget) {
        const dtx = session.miningTarget.x - cx;
        const dty = session.miningTarget.y - cy;
        if (dtx * dtx + dty * dty <= radiusSq) {
          this.world.blocks.stopMining(session);
        }
      }
    }

    // 3. Rocks resting above any cleared tile start to fall - not just above the topmost one in a
    //    column, since a rock can sit between two cleared tiles
    for (const [col, ys] of clearedByCol) {
      for (const y of ys) this.world.rocks.checkAndTriggerFallingRocks(col, y);
    }

    // 4. Invalidate line of sight caches
    for (const session of this.world.players.values()) {
      session.lastRevealGridPos = null;
    }
  }

  public consumePendingExplosions(): MiningExplosionEvent[] {
    const list = this.pendingExplosions;
    this.pendingExplosions = [];
    return list;
  }
}
