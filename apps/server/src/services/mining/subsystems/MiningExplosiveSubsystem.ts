import {
  DEFAULT_DYNAMITE_SOUNDS,
  MINING_CONFIG,
  MiningTileType,
  calculateThrowVelocity,
  type ItemPhysicsConfig,
  type ItemSoundEffectsConfig,
  type MiningExplosionEvent,
  type MiningPosition,
  type MiningRigidWorld,
} from '@mine-me/shared';
import { isInBounds, type ServerMiningGrid } from '../../miningMap.service';
import { MiningDynamiteEntity } from '../physics/MiningDynamiteEntity';
import type { MiningDataManager } from './MiningDataManager';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { PendingTileUpdate } from './MiningBlockSubsystem';

export class MiningExplosiveSubsystem {
  public activeDynamites: MiningDynamiteEntity[] = [];
  public dynamiteCounter = 0;
  public pendingExplosions: MiningExplosionEvent[] = [];

  public throwDynamite(
    session: MiningPlayerSession | undefined,
    target: MiningPosition,
    physicsConfig: ItemPhysicsConfig | undefined,
    forceRatio: number = 1.0,
    explosionRadius: number | undefined,
    itemId: string | undefined,
    soundEffects: ItemSoundEffectsConfig | null | undefined,
    dataManager: MiningDataManager,
    rigidWorld: MiningRigidWorld
  ): boolean {
    if (!session) return false;

    this.dynamiteCounter++;
    const dynamiteId = `dynamite_${session.characterId}_${this.dynamiteCounter}_${Date.now()}`;

    const startX = session.playerBody.position.x;
    const startY = session.playerBody.position.y;

    const config = physicsConfig ?? dataManager.getDynamiteItemPhysicsConfig();
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
    const vx = initialVel.x;
    const vy = initialVel.y;

    const resolvedExplosionRadius =
      explosionRadius !== undefined
        ? explosionRadius
        : dataManager.getItemExplosionRadius(itemId ?? 'dynamite');

    const resolvedSoundEffects =
      soundEffects !== undefined
        ? soundEffects
        : (itemId ? dataManager.getItemSoundEffects(itemId) : undefined) ??
          dataManager.getItemSoundEffects('dynamite') ??
          DEFAULT_DYNAMITE_SOUNDS;

    const dynamiteItem = itemId ? dataManager.getItemData(itemId) : dataManager.getItemData('dynamite');
    const dynamiteScale =
      typeof (dynamiteItem as any)?.inGameScale === 'number' && (dynamiteItem as any).inGameScale > 0
        ? (dynamiteItem as any).inGameScale
        : 1.0;

    const dynamite = new MiningDynamiteEntity(
      dynamiteId,
      { x: startX, y: startY },
      { x: vx, y: vy },
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
      }
    );
    this.activeDynamites.push(dynamite);
    return true;
  }

  public updateActiveDynamites(
    dt: number,
    onExplode: (dynamite: MiningDynamiteEntity) => void
  ): void {
    if (this.activeDynamites.length === 0) return;

    for (const dynamite of this.activeDynamites) {
      dynamite.update(dt);
      if (dynamite.hasExploded) {
        onExplode(dynamite);
      }
    }

    this.activeDynamites = this.activeDynamites.filter((d) => !d.hasExploded);
  }

  public explodeDynamite(
    dynamite: MiningDynamiteEntity,
    grid: ServerMiningGrid,
    rigidWorld: MiningRigidWorld,
    players: Iterable<MiningPlayerSession>,
    mobs: Iterable<{ id: string; mobBody: any }>,
    onSpawnBlockDrops: (tx: number, ty: number, previousType: MiningTileType) => void,
    onStopMining: (characterId: string) => void,
    onDamageMob: (mobId: string, damage: number) => void,
    onTriggerFallingRocks: (col: number, highestClearedY: number) => void,
    onPendingTile: (update: PendingTileUpdate) => void
  ): void {
    const radius = dynamite.explosionRadius;
    if (!radius || radius <= 0) {
      return;
    }

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
              onPendingTile({
                x: tx,
                y: ty,
                type: MiningTileType.EMPTY,
                damageStage: 0,
              });
              affectedCols.add(tx);
              onSpawnBlockDrops(tx, ty, previousType);
            }
          }
        }
      }
    }

    // 2. Interrupt any player currently mining a block inside the blast zone
    for (const session of players) {
      if (session.isMining && session.miningTarget) {
        const dtx = session.miningTarget.x - cx;
        const dty = session.miningTarget.y - cy;
        if (dtx * dtx + dty * dty <= radiusSq) {
          onStopMining(session.characterId);
        }
      }
    }

    // 2.5. Damage active mobs caught within blast radius
    for (const mob of mobs) {
      const mdx = mob.mobBody.position.x - cx;
      const mdy = mob.mobBody.position.y - cy;
      if (mdx * mdx + mdy * mdy <= radiusSq) {
        onDamageMob(mob.id, 50);
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
      onTriggerFallingRocks(col, highestClearedY);
    }

    // 4. Invalidate line of sight caches
    for (const session of players) {
      session.lastRevealGridPos = null;
    }
  }

  public consumePendingExplosions(): MiningExplosionEvent[] {
    const list = this.pendingExplosions;
    this.pendingExplosions = [];
    return list;
  }
}
