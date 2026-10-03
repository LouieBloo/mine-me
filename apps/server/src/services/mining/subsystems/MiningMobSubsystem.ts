import {
  BaseMobAI,
  MINING_CONFIG,
  MiningMobBody,
  MiningTileType,
  MobAIRegistry,
  getTileMineTime,
  isTileMineable,
  isTileSolid,
  type MiningActiveMob,
  type MiningPosition,
  type MiningRigidWorld,
  type MobAIContext,
  type Vector2D,
} from '@mine-me/shared';
import { getDamageStage, isInBounds, type ServerMiningGrid } from '../../miningMap.service';
import type { MiningDataManager } from './MiningDataManager';
import type { MiningDropSubsystem } from './MiningDropSubsystem';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { PendingTileUpdate } from './MiningBlockSubsystem';

export interface MiningActiveMobSession {
  id: string;
  mobId: string;
  name: string;
  mobBody: MiningMobBody;
  ai: BaseMobAI;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  miningSpeed: number;
  attackCooldownMs: number;
  dropTable?: any;
  animations?: any;
  animationState: 'idle' | 'walk' | 'mine' | 'attack' | 'jump' | 'damage' | 'death';
  isFacingLeft: boolean;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  miningProgressMs: number;
  mineRange: number;
  hitStunDurationMs?: number;
}

export class MiningMobSubsystem {
  public activeMobs: Map<string, MiningActiveMobSession> = new Map();
  public mobCounter = 0;

  public spawnMob(
    mobData: {
      id?: string;
      name?: string;
      level?: number;
      health?: number;
      attack?: number;
      defense?: number;
      aiType?: string;
      moveSpeed?: number;
      jumpForce?: number;
      miningSpeed?: number;
      aiConfig?: any;
      mineRange?: number;
      animations?: any;
      dropTable?: any;
    },
    position: Vector2D
  ): MiningActiveMobSession {
    this.mobCounter++;
    const instanceId = `mob_${Date.now()}_${this.mobCounter}`;
    const mobId = mobData.id || `mob_custom_${this.mobCounter}`;
    const name = mobData.name || 'Mob';

    const halfHeight = MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / (2 * MINING_CONFIG.TILE_SIZE);
    const mobBody = new MiningMobBody({
      position: { x: position.x, y: position.y - halfHeight },
      moveSpeed: mobData.moveSpeed && mobData.moveSpeed >= 2.8 ? mobData.moveSpeed : 3.2,
      jumpForce: mobData.jumpForce && mobData.jumpForce >= 8.0 ? mobData.jumpForce : 8.8,
    });

    const ai = MobAIRegistry.create(mobData.aiType, mobId, instanceId);

    const session: MiningActiveMobSession = {
      id: instanceId,
      mobId,
      name,
      mobBody,
      ai,
      health: mobData.health ?? 50,
      maxHealth: mobData.health ?? 50,
      attack: mobData.attack ?? 10,
      defense: mobData.defense ?? 2,
      miningSpeed:
        mobData.miningSpeed !== undefined && mobData.miningSpeed <= 10
          ? mobData.miningSpeed * 100
          : (mobData.miningSpeed ?? 80.0),
      attackCooldownMs: 1200,
      dropTable: mobData.dropTable,
      animations: mobData.animations,
      animationState: 'idle',
      isFacingLeft: false,
      isMining: false,
      miningTarget: null,
      miningProgressMs: 0,
      mineRange: mobData.aiConfig?.mineRange ?? (mobData as any).mineRange ?? 2.0,
    };

    this.activeMobs.set(instanceId, session);
    return session;
  }

  public findValidCavernSpawnPosition(grid: ServerMiningGrid, minDepth = 5): Vector2D {
    const candidates: Vector2D[] = [];
    const startY = Math.max(2, minDepth);
    for (let y = startY; y < MINING_CONFIG.GRID_HEIGHT - 3; y++) {
      for (let x = 2; x < MINING_CONFIG.GRID_WIDTH - 2; x++) {
        if (Math.abs(x - MINING_CONFIG.ENTRANCE_X) <= 3 && y <= 5) continue;
        const tile = grid[y]?.[x];
        const floor = grid[y + 1]?.[x];
        if (tile && tile.type === MiningTileType.EMPTY && floor && isTileSolid(floor.type)) {
          candidates.push({ x: x + 0.5, y: y + 1.0 });
        }
      }
    }

    if (candidates.length > 0) {
      const idx = Math.floor(Math.random() * candidates.length);
      return candidates[idx];
    }

    return { x: 22.5, y: Math.max(15, minDepth + 5) };
  }

  public populateCavernMobs(
    grid: ServerMiningGrid,
    dataManager: MiningDataManager,
    mapConfig?: { mobSpawnCount?: number; mobSpawnMinDepth?: number; allowedMobIds?: string[] },
    options?: { count?: number; minDepth?: number; mobIds?: string[] }
  ): void {
    const mobCount = options?.count ?? mapConfig?.mobSpawnCount ?? 3;
    if (mobCount <= 0) return;

    const minDepth = options?.minDepth ?? mapConfig?.mobSpawnMinDepth ?? 5;
    const allowedMobIds = options?.mobIds ?? mapConfig?.allowedMobIds ?? ['cmn_mole_person_001'];
    if (!allowedMobIds || allowedMobIds.length === 0) return;

    for (let i = 0; i < mobCount; i++) {
      const mobId = allowedMobIds[i % allowedMobIds.length];
      const mobDef = dataManager.getMobData(mobId);
      if (!mobDef) continue;

      const spawnPos = this.findValidCavernSpawnPosition(grid, minDepth);
      this.spawnMob(mobDef, spawnPos);
    }
  }

  public updateActiveMobs(
    dt: number,
    grid: ServerMiningGrid,
    players: Map<string, MiningPlayerSession>,
    rigidWorld: MiningRigidWorld,
    dropSubsystem: MiningDropSubsystem,
    dataManager: MiningDataManager,
    onPendingTile: (update: PendingTileUpdate) => void
  ): void {
    if (this.activeMobs.size === 0) return;

    for (const mob of this.activeMobs.values()) {
      if (mob.health <= 0) continue;

      if (mob.hitStunDurationMs && mob.hitStunDurationMs > 0) {
        mob.hitStunDurationMs -= dt * 1000;
        mob.animationState = 'damage';
        mob.mobBody.velocity.x *= 0.92;
        mob.mobBody.update(dt, grid);
        continue;
      }

      const aiContext: MobAIContext = {
        mobId: mob.mobId,
        instanceId: mob.id,
        position: { x: mob.mobBody.position.x, y: mob.mobBody.position.y },
        velocity: { x: mob.mobBody.velocity.x, y: mob.mobBody.velocity.y },
        health: mob.health,
        maxHealth: mob.maxHealth,
        attack: mob.attack,
        defense: mob.defense,
        isGrounded: mob.mobBody.isGrounded,
        isOnLadder: mob.mobBody.isOnLadder,
        grid,
        players: Array.from(players.values()).map((p) => ({
          characterId: p.characterId,
          characterName: p.characterName,
          position: { x: p.playerBody.position.x, y: p.playerBody.position.y },
          health: 100,
        })),
        config: {
          canMine: true,
          mineRange: mob.mineRange,
          aggroRange: 20,
          attackRange: 1.25,
          attackCooldownMs: mob.attackCooldownMs,
        },
      };

      const intent = mob.ai.update(dt, aiContext);

      mob.mobBody.processMovement(
        intent.moveX,
        intent.jump,
        intent.climbUp,
        intent.climbDown,
        grid
      );
      mob.mobBody.update(dt, grid);
      mob.isFacingLeft = mob.mobBody.isFacingLeft;

      if (intent.isAttacking && intent.attackTargetId) {
        mob.animationState = 'attack';
        const targetPlayer = players.get(intent.attackTargetId);
        if (targetPlayer) {
          this.handleMobAttackPlayer(mob, targetPlayer);
        }
      } else if (intent.isMining && intent.miningTarget) {
        const inReach = BaseMobAI.isWithinReach(
          mob.mobBody.position,
          intent.miningTarget,
          mob.mineRange
        );
        if (inReach) {
          mob.isMining = true;
          mob.miningTarget = intent.miningTarget;
          mob.animationState = 'mine';
          if (intent.miningTarget.x < mob.mobBody.position.x) {
            mob.isFacingLeft = true;
            mob.mobBody.isFacingLeft = true;
          } else if (intent.miningTarget.x > mob.mobBody.position.x) {
            mob.isFacingLeft = false;
            mob.mobBody.isFacingLeft = false;
          }
          this.handleMobMining(
            mob,
            intent.miningTarget,
            dt,
            grid,
            rigidWorld,
            dropSubsystem,
            dataManager,
            onPendingTile
          );
        } else {
          mob.isMining = false;
          mob.miningTarget = null;
          mob.animationState = 'walk';
        }
      } else {
        mob.isMining = false;
        mob.miningTarget = null;
        mob.animationState = intent.animationState;
      }
    }
  }

  public handleMobMining(
    mob: MiningActiveMobSession,
    target: MiningPosition,
    dt: number,
    grid: ServerMiningGrid,
    rigidWorld: MiningRigidWorld,
    dropSubsystem: MiningDropSubsystem,
    dataManager: MiningDataManager,
    onPendingTile: (update: PendingTileUpdate) => void
  ): void {
    if (!isInBounds(target.x, target.y)) {
      mob.isMining = false;
      mob.miningTarget = null;
      return;
    }

    if (!BaseMobAI.isWithinReach(mob.mobBody.position, target, mob.mineRange)) {
      mob.isMining = false;
      mob.miningTarget = null;
      mob.miningProgressMs = 0;
      return;
    }

    const tile = grid[target.y][target.x];
    if (!tile || !isTileMineable(tile.type)) {
      mob.isMining = false;
      mob.miningTarget = null;
      return;
    }

    const prevStage = getDamageStage(tile);
    const speedMultiplier = mob.miningSpeed / 100;
    tile.damageMs = (tile.damageMs || 0) + dt * 1000 * speedMultiplier;
    mob.miningProgressMs = tile.damageMs;

    const newStage = getDamageStage(tile);
    if (newStage !== prevStage) {
      onPendingTile({
        x: target.x,
        y: target.y,
        type: tile.type,
        damageStage: newStage,
      });
    }

    const requiredTime = getTileMineTime(tile.type);
    if (tile.damageMs >= requiredTime) {
      const previousType = tile.type;
      tile.type = MiningTileType.EMPTY;
      tile.revealed = true;
      tile.damageMs = 0;

      rigidWorld.removeTileCollider(target.x, target.y);
      onPendingTile({
        x: target.x,
        y: target.y,
        type: MiningTileType.EMPTY,
        damageStage: 0,
      });

      dropSubsystem.spawnBlockDrops(
        target.x,
        target.y,
        previousType,
        (t) => dataManager.getBlockConfig(t),
        (id) => dataManager.getItemData(id),
        rigidWorld
      );

      mob.isMining = false;
      mob.miningTarget = null;
      mob.miningProgressMs = 0;
    }
  }

  public handleMobAttackPlayer(mob: MiningActiveMobSession, player: MiningPlayerSession): void {
    const damage = Math.max(1, mob.attack);
    if (player.socket && player.socket.connected) {
      player.socket.emit('player_damaged', {
        damage,
        mobId: mob.id,
        mobName: mob.name,
      });
    }
  }

  public damageMob(
    instanceId: string,
    damage: number,
    rigidWorld: MiningRigidWorld,
    dropSubsystem: MiningDropSubsystem,
    dataManager: MiningDataManager
  ): void {
    const mob = this.activeMobs.get(instanceId);
    if (!mob || mob.health <= 0) return;

    mob.health -= damage;
    mob.animationState = 'damage';
    mob.hitStunDurationMs = 250;

    if (mob.health <= 0) {
      this.killMob(mob, rigidWorld, dropSubsystem, dataManager);
    }
  }

  public killMob(
    mob: MiningActiveMobSession,
    rigidWorld: MiningRigidWorld,
    dropSubsystem: MiningDropSubsystem,
    dataManager: MiningDataManager
  ): void {
    mob.health = 0;
    mob.animationState = 'death';
    this.spawnMobDrops(mob, rigidWorld, dropSubsystem, dataManager);
    this.activeMobs.delete(mob.id);
  }

  public spawnMobDrops(
    mob: MiningActiveMobSession,
    rigidWorld: MiningRigidWorld,
    dropSubsystem: MiningDropSubsystem,
    dataManager: MiningDataManager
  ): void {
    const dropTable = mob.dropTable;
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
    }

    if (dropTable && (dropTable.solMin > 0 || dropTable.solMax > 0)) {
      const minSol = dropTable.solMin || 0;
      const maxSol = dropTable.solMax || minSol;
      const solQty = Math.floor(Math.random() * (maxSol - minSol + 1)) + minSol;
      if (solQty > 0) {
        dropsToSpawn.push({ itemId: 'sol', quantity: solQty });
      }
    }

    if (dropsToSpawn.length === 0) return;

    const N = dropsToSpawn.length;
    const tx = mob.mobBody.position.x;
    const ty = mob.mobBody.position.y;

    dropsToSpawn.forEach((drop, idx) => {
      dropSubsystem.droppedItemCounter++;
      const id = `mob_drop_${Date.now()}_${dropSubsystem.droppedItemCounter}_${idx}`;
      const itemData = dataManager.getItemData(drop.itemId);

      const offsetX = N > 1 ? (idx - (N - 1) / 2) * 0.25 : 0;
      const posX = tx + offsetX;
      const posY = ty;

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
      dropSubsystem.activeItemBodies.set(id, rigidBody);

      dropSubsystem.droppedItems.push({
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

    dropSubsystem.droppedItemsDirty = true;
  }

  public getActiveMobs(): MiningActiveMob[] {
    const list: MiningActiveMob[] = [];
    for (const mob of this.activeMobs.values()) {
      list.push({
        id: mob.id,
        mobId: mob.mobId,
        name: mob.name,
        position: { x: mob.mobBody.position.x, y: mob.mobBody.position.y },
        velocity: { x: mob.mobBody.velocity.x, y: mob.mobBody.velocity.y },
        health: mob.health,
        maxHealth: mob.maxHealth,
        attack: mob.attack,
        defense: mob.defense,
        isFacingLeft: mob.isFacingLeft,
        isMining: mob.isMining,
        animationState: mob.animationState,
        miningTarget: mob.miningTarget ?? undefined,
        animations: mob.animations,
      });
    }
    return list;
  }
}
