import {
  DEFAULT_DYNAMITE_SOUNDS,
  MINING_CONFIG,
  MiningTileType,
  calculateThrowVelocity,
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
    const affectedCols = new Set<number>();

    // Queue authoritative explosion event for all clients in room
    this.pendingExplosions.push({
      id: dynamite.id,
      position: { x: dynamite.position.x, y: dynamite.position.y },
      radius,
      soundUrl: dynamite.soundEffects?.explosion?.url ?? DEFAULT_DYNAMITE_SOUNDS.explosion?.url,
    });

    // 1. Excavate all blocks in explosion radius
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radiusSq) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (isInBounds(tx, ty)) {
            const tile = grid[ty][tx];
            if (tile.type !== MiningTileType.ENTRANCE && tile.type !== MiningTileType.EMPTY) {
              const previousType = tile.type;
              tile.type = MiningTileType.EMPTY;
              tile.revealed = true;
              tile.damageMs = 0;
              rigidWorld.removeTileCollider(tx, ty);
              this.world.pushTileUpdate({ x: tx, y: ty, type: MiningTileType.EMPTY, damageStage: 0 });
              affectedCols.add(tx);
              this.world.drops.spawnBlockDrops(tx, ty, previousType);
            }
          }
        }
      }
    }

    // 2. Interrupt any player currently mining a block inside the blast zone
    for (const session of this.world.players.values()) {
      if (session.isMining && session.miningTarget) {
        const dtx = session.miningTarget.x - cx;
        const dty = session.miningTarget.y - cy;
        if (dtx * dtx + dty * dty <= radiusSq) {
          this.world.blocks.stopMining(session);
        }
      }
    }

    // 2.5. Damage active mobs caught within blast radius
    for (const mob of this.world.mobs.activeMobs.values()) {
      const mdx = mob.mobBody.position.x - cx;
      const mdy = mob.mobBody.position.y - cy;
      if (mdx * mdx + mdy * mdy <= radiusSq) {
        this.world.damage.applyDamage(
          { kind: 'mob', id: mob.id },
          {
            amount: MINING_CONFIG.EXPLOSION_MOB_DAMAGE,
            type: 'explosive',
            source: {
              kind: 'explosion',
              id: dynamite.id,
              ownerId: dynamite.ownerId,
              itemId: dynamite.itemId,
              position: { x: dynamite.position.x, y: dynamite.position.y },
            },
          }
        );
      }
    }

    // 3. Trigger falling rocks above the cleared cavern columns
    for (const col of affectedCols) {
      let highestClearedY = cy + radius;
      for (let y = Math.max(0, cy - radius); y <= Math.min(MINING_CONFIG.GRID_HEIGHT - 1, cy + radius); y++) {
        if (grid[y][col].type === MiningTileType.EMPTY) {
          highestClearedY = Math.min(highestClearedY, y);
        }
      }
      this.world.rocks.checkAndTriggerFallingRocks(col, highestClearedY);
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
