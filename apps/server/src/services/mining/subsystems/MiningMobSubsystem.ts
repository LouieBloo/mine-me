import {
  BaseMobAI,
  MINING_CONFIG,
  MiningMobBody,
  MiningTileType,
  MobAIRegistry,
  isTileMineable,
  isTileSolid,
  type MiningActiveMob,
  type MiningPosition,
  type MobAIContext,
  type Vector2D,
  knockbackAway,
  rollDropTable,
} from '@mine-me/shared';
import { isInBounds, type ServerMiningGrid } from '../../miningMap.service';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { MiningWorld } from '../MiningWorld';
import { isSegmentBlocked } from './miningGeometry';
import { toActiveMob } from '../MiningEntitySync';

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
  /** AI settings (from the mob's aiConfig, defaulting to MINING_CONFIG.MOB_DEFAULT_*). */
  canMine: boolean;
  aggroRange: number;
  attackRange: number;
  /** How long a hit takes control away from this mob (0 = can't be stunned). */
  hitStunMs: number;
  /** After a stun ends, how long until it can be stunned again. */
  stunImmunityMs: number;
  /** Time left in the current stun. */
  hitStunDurationMs?: number;
  /** Time left in the post-stun immunity window. */
  stunImmuneRemainingMs?: number;
  spriteUrl?: string;
  colliderWidth?: number;
  colliderHeight?: number;
  showHealthBar?: boolean;
  /** Dig feedback batching state (see MINING_CONFIG.MOB_DIG_HIT_INTERVAL). */
  digTargetKey?: string | null;
  digHitTimer?: number;
  digHitDamage?: number;
  /** Seconds left before a killed mob is removed (set when it dies). */
  deathTimer?: number;
}

export class MiningMobSubsystem {
  public activeMobs: Map<string, MiningActiveMobSession> = new Map();
  public mobCounter = 0;

  constructor(private readonly world: MiningWorld) {}

  private static nonNegative(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

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
      hitStunMs?: number;
      stunImmunityMs?: number;
      animations?: any;
      dropTable?: any;
      spriteUrl?: string;
      colliderWidth?: number;
      colliderHeight?: number;
      showHealthBar?: boolean;
    },
    position: Vector2D
  ): MiningActiveMobSession {
    this.mobCounter++;
    const instanceId = `mob_${Date.now()}_${this.mobCounter}`;
    const mobId = mobData.id || `mob_custom_${this.mobCounter}`;
    const name = mobData.name || 'Mob';

    const colW =
      mobData.colliderWidth ??
      mobData.aiConfig?.colliderWidth ??
      (MINING_CONFIG.PLAYER_COLLIDER_WIDTH / MINING_CONFIG.TILE_SIZE);
    const colH =
      mobData.colliderHeight ??
      mobData.aiConfig?.colliderHeight ??
      (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / MINING_CONFIG.TILE_SIZE);
    const halfHeight = colH / 2;
    // A mob's own numbers always win; the defaults only fill in what its data leaves out.
    // (Stationary mobs such as target dummies default to not moving at all.)
    const isStationary = mobData.aiType === 'STATIONARY';
    const mobBody = new MiningMobBody({
      position: { x: position.x, y: position.y - halfHeight },
      width: colW,
      height: colH,
      moveSpeed: MiningMobSubsystem.nonNegative(
        mobData.moveSpeed,
        isStationary ? 0 : MINING_CONFIG.MOB_DEFAULT_MOVE_SPEED
      ),
      jumpForce: MiningMobSubsystem.nonNegative(
        mobData.jumpForce,
        isStationary ? 0 : MINING_CONFIG.MOB_DEFAULT_JUMP_FORCE
      ),
    });

    const aiConfig = mobData.aiConfig ?? {};

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
      miningSpeed: MiningMobSubsystem.nonNegative(mobData.miningSpeed, MINING_CONFIG.MOB_DEFAULT_MINING_SPEED),
      attackCooldownMs: MiningMobSubsystem.nonNegative(
        aiConfig.attackCooldownMs,
        MINING_CONFIG.MOB_DEFAULT_ATTACK_COOLDOWN_MS
      ),
      canMine: aiConfig.canMine !== false,
      aggroRange: MiningMobSubsystem.nonNegative(aiConfig.aggroRange, MINING_CONFIG.MOB_DEFAULT_AGGRO_RANGE),
      attackRange: MiningMobSubsystem.nonNegative(aiConfig.attackRange, MINING_CONFIG.MOB_DEFAULT_ATTACK_RANGE),
      hitStunMs: MiningMobSubsystem.nonNegative(mobData.hitStunMs, MINING_CONFIG.MOB_HIT_STUN_MS),
      stunImmunityMs: MiningMobSubsystem.nonNegative(mobData.stunImmunityMs, MINING_CONFIG.MOB_STUN_IMMUNITY_MS),
      dropTable: mobData.dropTable,
      animations: mobData.animations,
      animationState: 'idle',
      isFacingLeft: false,
      isMining: false,
      miningTarget: null,
      miningProgressMs: 0,
      mineRange: MiningMobSubsystem.nonNegative(
        aiConfig.mineRange ?? (mobData as any).mineRange,
        MINING_CONFIG.MOB_DEFAULT_MINE_RANGE
      ),
      spriteUrl:
        mobData.spriteUrl ??
        (mobData as any).animations?.url ??
        mobData.aiConfig?.spriteUrl,
      colliderWidth: colW,
      colliderHeight: colH,
      showHealthBar:
        mobData.showHealthBar ??
        (mobData.aiConfig?.showHealthBar !== undefined
          ? mobData.aiConfig.showHealthBar
          : true),
    };

    this.activeMobs.set(instanceId, session);
    return session;
  }

  public findValidCavernSpawnPosition(minDepth = 5): Vector2D {
    const grid = this.world.grid;
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

  public populateCavernMobs(options?: { count?: number; minDepth?: number; mobIds?: string[] }): void {
    const mapConfig = this.world.mapConfig;
    const mobCount = options?.count ?? mapConfig?.mobSpawnCount ?? 3;
    if (mobCount <= 0) return;

    const minDepth = options?.minDepth ?? mapConfig?.mobSpawnMinDepth ?? 5;
    const allowedMobIds = options?.mobIds ?? mapConfig?.allowedMobIds ?? [];
    if (!allowedMobIds || allowedMobIds.length === 0) return;

    for (let i = 0; i < mobCount; i++) {
      const mobId = allowedMobIds[i % allowedMobIds.length];
      const mobDef = this.world.data.getMobData(mobId);
      if (!mobDef) continue;

      const spawnPos = this.findValidCavernSpawnPosition(minDepth);
      this.spawnMob(mobDef, spawnPos);
    }
  }

  public updateActiveMobs(dt: number): void {
    if (this.activeMobs.size === 0) return;
    const { grid, players } = this.world;

    for (const mob of this.activeMobs.values()) {
      if (mob.health <= 0) {
        this.updateDyingMob(mob, dt, grid);
        continue;
      }

      if (mob.stunImmuneRemainingMs && mob.stunImmuneRemainingMs > 0) {
        mob.stunImmuneRemainingMs = Math.max(0, mob.stunImmuneRemainingMs - dt * 1000);
      }

      if (mob.hitStunDurationMs && mob.hitStunDurationMs > 0) {
        mob.hitStunDurationMs -= dt * 1000;
        mob.animationState = 'damage';
        mob.mobBody.velocity.x *= 0.92;
        mob.mobBody.update(dt, grid);
        if (mob.hitStunDurationMs <= 0) {
          // Control returns, but the mob can't be stunned again for a moment (no stun-lock)
          mob.hitStunDurationMs = 0;
          mob.stunImmuneRemainingMs = mob.stunImmunityMs;
        }
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
          health: p.health,
        })),
        config: {
          canMine: mob.canMine,
          mineRange: mob.mineRange,
          aggroRange: mob.aggroRange,
          attackRange: mob.attackRange,
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
        // Solid tiles between the mob and the player block the attack (no hitting through walls)
        if (
          targetPlayer &&
          !targetPlayer.isDead &&
          !isSegmentBlocked(grid, mob.mobBody.position, targetPlayer.playerBody.position)
        ) {
          this.attackPlayer(mob, targetPlayer);
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
          this.handleMobMining(mob, intent.miningTarget, dt);
        } else {
          this.stopMobMining(mob);
          mob.animationState = 'walk';
        }
      } else {
        this.stopMobMining(mob);
        mob.animationState = intent.animationState;
      }
    }
  }

  /**
   * A killed mob lingers briefly so clients can play its death animation. It is inert: no AI, no
   * attacks, and it cannot be damaged (every damage path ignores mobs at 0 health). It still obeys
   * gravity so it doesn't hang in mid-air, then it is removed.
   */
  private updateDyingMob(mob: MiningActiveMobSession, dt: number, grid: ServerMiningGrid): void {
    mob.deathTimer = (mob.deathTimer ?? 0) - dt;
    mob.mobBody.velocity.x *= 0.9;
    mob.mobBody.update(dt, grid);
    if (mob.deathTimer <= 0) {
      this.activeMobs.delete(mob.id);
    }
  }

  private canBeStunned(mob: MiningActiveMobSession): boolean {
    if (mob.hitStunMs <= 0) return false;
    if ((mob.hitStunDurationMs ?? 0) > 0) return false;
    if ((mob.stunImmuneRemainingMs ?? 0) > 0) return false;
    return true;
  }

  private stopMobMining(mob: MiningActiveMobSession): void {
    mob.isMining = false;
    mob.miningTarget = null;
    mob.digTargetKey = null;
    mob.digHitTimer = 0;
    mob.digHitDamage = 0;
  }

  public handleMobMining(mob: MiningActiveMobSession, target: MiningPosition, dt: number): void {
    const grid = this.world.grid;
    if (!isInBounds(target.x, target.y)) {
      this.stopMobMining(mob);
      return;
    }

    if (!BaseMobAI.isWithinReach(mob.mobBody.position, target, mob.mineRange)) {
      this.stopMobMining(mob);
      mob.miningProgressMs = 0;
      return;
    }

    const tile = grid[target.y][target.x];
    if (!tile || !isTileMineable(tile.type)) {
      this.stopMobMining(mob);
      return;
    }

    const tileType = tile.type;
    const damageDealt = (mob.miningSpeed || 80) * 2 * dt;
    const result = this.world.damage.damageTile(target.x, target.y, {
      amount: damageDealt,
      type: 'mining',
      source: { kind: 'mob', id: mob.id, name: mob.name, position: { x: mob.mobBody.position.x, y: mob.mobBody.position.y } },
    });
    if (!result.applied) {
      this.stopMobMining(mob);
      return;
    }
    mob.miningProgressMs = result.tileDamage;

    // Batch digging feedback so nearby players hear/see it without a 30 Hz event stream
    const key = `${target.x},${target.y}`;
    if (mob.digTargetKey !== key) {
      mob.digTargetKey = key;
      mob.digHitTimer = 0;
      mob.digHitDamage = 0;
    }
    mob.digHitTimer = (mob.digHitTimer ?? 0) + dt;
    mob.digHitDamage = (mob.digHitDamage ?? 0) + damageDealt;

    if (mob.digHitTimer >= MINING_CONFIG.MOB_DIG_HIT_INTERVAL || result.destroyed) {
      this.world.blocks.queueBlockHit({
        x: target.x,
        y: target.y,
        tileType,
        damage: mob.digHitDamage,
        source: 'mob',
      });
      mob.digHitTimer = 0;
      mob.digHitDamage = 0;
    }

    if (result.destroyed) {
      this.stopMobMining(mob);
      mob.miningProgressMs = 0;
    }
  }

  /** A mob's melee attack connects: damage plus a push away from the mob. */
  private attackPlayer(mob: MiningActiveMobSession, player: MiningPlayerSession): void {
    const from = mob.mobBody.position;
    this.world.damage.applyDamage(
      { kind: 'player', id: player.characterId },
      {
        amount: Math.max(1, mob.attack),
        type: 'melee',
        source: { kind: 'mob', id: mob.id, name: mob.name, position: { x: from.x, y: from.y } },
        knockback: knockbackAway(
          from.x,
          player.playerBody.position.x,
          { x: MINING_CONFIG.PLAYER_HIT_KNOCKBACK_X, y: MINING_CONFIG.PLAYER_HIT_KNOCKBACK_Y },
          player.isFacingLeft ? 1 : -1
        ),
      }
    );
  }

  /**
   * Removes health from a mob. Not for gameplay code: hits go through `world.damage.applyDamage`,
   * which calls this after its own checks.
   */
  public damageMob(instanceId: string, damage: number): void {
    const mob = this.activeMobs.get(instanceId);
    if (!mob || mob.health <= 0) return;

    mob.health -= damage;

    // A hit only costs the mob control if it isn't already stunned or still immune from a recent
    // stun, so sustained fire can't stun-lock it. Damage and knockback apply regardless.
    if (mob.health > 0 && this.canBeStunned(mob)) {
      mob.hitStunDurationMs = mob.hitStunMs;
      mob.animationState = 'damage';
      // Being hit interrupts whatever the mob was doing
      this.stopMobMining(mob);
    }

    if (mob.health <= 0) {
      this.killMob(mob);
    }
  }

  public killMob(mob: MiningActiveMobSession): void {
    if (mob.deathTimer !== undefined) return; // already dying: never drop loot twice

    mob.health = 0;
    mob.animationState = 'death';
    mob.deathTimer = MINING_CONFIG.MOB_DEATH_LINGER_SECONDS;
    mob.hitStunDurationMs = 0;
    this.stopMobMining(mob);
    // Loot drops immediately; the lingering body is purely visual
    this.spawnMobDrops(mob);
  }

  public spawnMobDrops(mob: MiningActiveMobSession): void {
    const drops = rollDropTable(mob.dropTable, { currencyItemId: this.world.data.getCurrencyItem()?.id });
    this.world.drops.spawnDrops(drops, { x: mob.mobBody.position.x, y: mob.mobBody.position.y });
  }

  /** Spawns the map config's surface dummy mob, if the config names one. */
  public spawnSurfaceTargetDummy(position?: Vector2D): MiningActiveMobSession | null {
    const dummyMobId = this.world.mapConfig?.surfaceDummyMobId;
    if (!dummyMobId) return null;
    const dummyDef = this.world.data.getMobData(dummyMobId);
    if (!dummyDef) return null;
    const spawnPos = position ?? { x: MINING_CONFIG.ENTRANCE_X + 2.5, y: 0.0 };
    return this.spawnMob(dummyDef, spawnPos);
  }

  public getActiveMobs(): MiningActiveMob[] {
    return Array.from(this.activeMobs.values(), toActiveMob);
  }
}
