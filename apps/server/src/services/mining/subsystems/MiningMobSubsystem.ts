import {
  BaseMobAI,
  MINING_CONFIG,
  advanceSwing,
  swingsPerSecond,
  canBreakBlock,
  deriveCombatStats,
  knockbackImpulse,
  type EffectEntry,
  type EntityCombatStats,
  type SwingState,
  MiningMobBody,
  MiningTileType,
  MobAIRegistry,
  isTileMineable,
  isTileSolid,
  type MiningActiveMob,
  type Mob,
  type MiningPosition,
  type MobAIContext,
  type Vector2D,
  knockbackAway,
  rollDropTable,
  type DropTableData,
  type PlayerTargetInfo,
  TickPathBudget,
  getMobSpriteUrl,
  type MobAIConfig,
  type MobAIType,
} from '@mine-me/shared';
import { isInBounds, type ServerMiningGrid } from '../../miningMap.service';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { MiningWorld } from '../MiningWorld';
import { isSegmentBlocked } from './miningGeometry';
import { toActiveMob } from '../MiningEntitySync';
import { separateBodies, type SeparationParticipant } from './mobSeparation';

export interface MiningActiveMobSession extends SwingState {
  id: string;
  mobId: string;
  name: string;
  mobBody: MiningMobBody;
  ai: BaseMobAI;
  health: number;
  maxHealth: number;
  defense: number;
  /** Mining Speed / Damage / Tool Damage / Pick Power / Knockback, from the mob's effects. */
  stats: EntityCombatStats;
  dropTable?: DropTableData | null;
  animations?: Mob['animations'];
  /** Playable sound slots resolved from the sound library; sent to clients with the mob. */
  sounds?: Mob['sounds'];
  animationState: 'idle' | 'walk' | 'mine' | 'attack' | 'jump' | 'damage' | 'death';
  isFacingLeft: boolean;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  miningProgress: number;
  mineRange: number;
  /** AI settings (from the mob's aiConfig, defaulting to MINING_CONFIG.MOB_DEFAULT_*). */
  canMine: boolean;
  aggroRange: number;
  attackRange: number;
  /** Telegraph time between starting an attack and it landing, in seconds (0 = instant). */
  attackWindupSeconds: number;
  /** Seconds left in the current attack wind-up (0 = not winding up). */
  attackWindupRemaining: number;
  /** Who the current wind-up is aimed at, and how far away they were when it began. */
  attackTargetId?: string;
  attackStartDistance: number;
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
  /** Seconds left before a killed mob is removed (set when it dies). */
  deathTimer?: number;
}

/** What `spawnMob` needs to know about a mob; a database `Mob` satisfies it, and so do test fixtures. */
export interface MobSpawnData {
  id?: string;
  name?: string;
  level?: number;
  health?: number;
  defense?: number;
  aiType?: MobAIType | string;
  moveSpeed?: number;
  jumpForce?: number;
  /** The mob's attached effects; every combat stat comes from here (see `deriveCombatStats`). */
  mobEffects?: readonly EffectEntry[];
  aiConfig?: MobAIConfig | null;
  mineRange?: number;
  hitStunMs?: number;
  stunImmunityMs?: number;
  animations?: Mob['animations'];
  sounds?: Mob['sounds'];
  dropTable?: DropTableData | null;
  spriteUrl?: string;
  colliderWidth?: number;
  colliderHeight?: number;
  showHealthBar?: boolean;
}

export class MiningMobSubsystem {
  public activeMobs: Map<string, MiningActiveMobSession> = new Map();
  public mobCounter = 0;
  /** Limits how many mobs may start an A* search in one tick. */
  private readonly pathBudget = new TickPathBudget(MINING_CONFIG.MOB_PATHS_PER_TICK);

  constructor(private readonly world: MiningWorld) {}

  private static nonNegative(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  public spawnMob(
    mobData: MobSpawnData,
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
      defense: mobData.defense ?? 2,
      stats: deriveCombatStats(mobData.mobEffects),
      swingCooldown: 0,
      swungThisTick: false,
      canMine: aiConfig.canMine !== false,
      aggroRange: MiningMobSubsystem.nonNegative(aiConfig.aggroRange, MINING_CONFIG.MOB_DEFAULT_AGGRO_RANGE),
      attackRange: MiningMobSubsystem.nonNegative(aiConfig.attackRange, MINING_CONFIG.MOB_DEFAULT_ATTACK_RANGE),
      attackWindupSeconds: MiningMobSubsystem.nonNegative(
        aiConfig.attackWindupMs !== undefined ? aiConfig.attackWindupMs / 1000 : undefined,
        MINING_CONFIG.MOB_ATTACK_WINDUP_SECONDS
      ),
      attackWindupRemaining: 0,
      attackStartDistance: 0,
      hitStunMs: MiningMobSubsystem.nonNegative(mobData.hitStunMs, MINING_CONFIG.MOB_HIT_STUN_MS),
      stunImmunityMs: MiningMobSubsystem.nonNegative(mobData.stunImmunityMs, MINING_CONFIG.MOB_STUN_IMMUNITY_MS),
      dropTable: mobData.dropTable,
      animations: mobData.animations,
      sounds: mobData.sounds,
      animationState: 'idle',
      isFacingLeft: false,
      isMining: false,
      miningTarget: null,
      miningProgress: 0,
      mineRange: MiningMobSubsystem.nonNegative(
        aiConfig.mineRange ?? mobData.mineRange,
        MINING_CONFIG.MOB_DEFAULT_MINE_RANGE
      ),
      spriteUrl:
        mobData.spriteUrl ??
        getMobSpriteUrl(mobData.animations) ??
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
    this.pathBudget.reset();
    // One snapshot of the players for every mob this tick, rather than one array per mob
    const playerTargets: PlayerTargetInfo[] = Array.from(players.values()).map((p) => ({
      characterId: p.characterId,
      characterName: p.characterName,
      position: { x: p.playerBody.position.x, y: p.playerBody.position.y },
      health: p.health,
    }));

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
        this.cancelAttack(mob); // a stunned mob loses its attack
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

      if (mob.attackWindupRemaining > 0) {
        this.updateAttackWindup(mob, dt);
        continue;
      }

      const aiContext: MobAIContext = {
        mobId: mob.mobId,
        instanceId: mob.id,
        position: { x: mob.mobBody.position.x, y: mob.mobBody.position.y },
        velocity: { x: mob.mobBody.velocity.x, y: mob.mobBody.velocity.y },
        health: mob.health,
        maxHealth: mob.maxHealth,
        defense: mob.defense,
        isGrounded: mob.mobBody.isGrounded,
        isOnLadder: mob.mobBody.isOnLadder,
        grid,
        players: playerTargets,
        pathBudget: this.pathBudget,
        config: {
          canMine: mob.canMine,
          mineRange: mob.mineRange,
          aggroRange: mob.aggroRange,
          attackRange: mob.attackRange,
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

      // What the mob wants to hit this tick: a player in reach, else a block in reach.
      const targetPlayer = intent.isAttacking && intent.attackTargetId ? players.get(intent.attackTargetId) : undefined;
      const canAttack = Boolean(targetPlayer && !targetPlayer.isDead);
      const mineTarget =
        !canAttack && intent.isMining && intent.miningTarget &&
        BaseMobAI.isWithinReach(mob.mobBody.position, intent.miningTarget, mob.mineRange)
          ? intent.miningTarget
          : null;

      // One swing timer for both (the same Mining Speed stat players use).
      advanceSwing(mob, dt, canAttack || mineTarget !== null, mob.stats.miningSpeed);

      if (canAttack && targetPlayer) {
        this.stopMobMining(mob);
        this.faceToward(mob, targetPlayer.playerBody.position.x);
        mob.animationState = mob.swungThisTick ? 'attack' : 'idle';
        if (mob.swungThisTick) this.beginAttack(mob, targetPlayer);
      } else if (mineTarget) {
        mob.isMining = true;
        mob.miningTarget = mineTarget;
        mob.animationState = 'mine';
        this.faceToward(mob, mineTarget.x);
        this.handleMobMining(mob, mineTarget);
      } else if (intent.isMining && intent.miningTarget) {
        // Wants to dig but the block is out of reach
        this.stopMobMining(mob);
        mob.animationState = 'walk';
      } else {
        this.stopMobMining(mob);
        mob.animationState = intent.animationState;
      }
    }

    this.separateMobs(dt);
  }

  /** Starts an attack: instantly for a 0 wind-up, otherwise a telegraph during which the mob stands still. */
  private beginAttack(mob: MiningActiveMobSession, target: MiningPlayerSession): void {
    // Never longer than most of one swing, so the telegraph can't throttle the mob's attack rate
    const windup = Math.min(mob.attackWindupSeconds, 0.8 / swingsPerSecond(mob.stats.miningSpeed));
    mob.attackTargetId = target.characterId;
    mob.attackStartDistance = this.distanceBetween(mob, target);
    if (windup <= 0) {
      this.resolveAttack(mob);
      return;
    }
    mob.attackWindupRemaining = windup;
    mob.mobBody.velocity.x = 0;
  }

  /** Counts down the telegraph; the hit lands (or whiffs) when it ends. The mob is rooted meanwhile. */
  private updateAttackWindup(mob: MiningActiveMobSession, dt: number): void {
    const { grid, players } = this.world;
    advanceSwing(mob, dt, false, mob.stats.miningSpeed); // the swing clock keeps running
    mob.attackWindupRemaining -= dt;
    mob.animationState = 'attack';
    mob.mobBody.velocity.x = 0;
    mob.mobBody.update(dt, grid);
    const target = mob.attackTargetId ? players.get(mob.attackTargetId) : undefined;
    if (target && !target.isDead) this.faceToward(mob, target.playerBody.position.x);
    if (mob.attackWindupRemaining <= 0) {
      mob.attackWindupRemaining = 0;
      this.resolveAttack(mob);
    }
  }

  private cancelAttack(mob: MiningActiveMobSession): void {
    mob.attackWindupRemaining = 0;
    mob.attackTargetId = undefined;
  }

  /**
   * The attack lands only if its target is still alive, still reachable (they may have dodged out
   * of range during the wind-up), and no solid tile is in between.
   */
  private resolveAttack(mob: MiningActiveMobSession): void {
    const target = mob.attackTargetId ? this.world.players.get(mob.attackTargetId) : undefined;
    this.cancelAttack(mob);
    if (!target || target.isDead) return;
    const reach = Math.max(mob.attackRange, mob.attackStartDistance) + MINING_CONFIG.MOB_ATTACK_DODGE_MARGIN;
    if (this.distanceBetween(mob, target) > reach) return;
    // Solid tiles between the mob and the player block the attack (no hitting through walls)
    if (isSegmentBlocked(this.world.grid, mob.mobBody.position, target.playerBody.position)) return;
    this.attackPlayer(mob, target);
  }

  private distanceBetween(mob: MiningActiveMobSession, player: MiningPlayerSession): number {
    return Math.hypot(
      player.playerBody.position.x - mob.mobBody.position.x,
      player.playerBody.position.y - mob.mobBody.position.y
    );
  }

  /** Soft collision so mobs spread out instead of stacking on each other or on a player. */
  private separateMobs(dt: number): void {
    const participants: SeparationParticipant[] = [];
    for (const mob of this.activeMobs.values()) {
      if (mob.health <= 0) continue;
      participants.push({ id: mob.id, body: mob.mobBody, movable: mob.mobBody.moveSpeed > 0 });
    }
    for (const player of this.world.players.values()) {
      if (player.isDead) continue;
      participants.push({ id: player.characterId, body: player.playerBody, movable: false });
    }
    separateBodies(participants, dt, this.world.grid);
  }

  private faceToward(mob: MiningActiveMobSession, targetX: number): void {
    if (targetX < mob.mobBody.position.x) {
      mob.isFacingLeft = true;
      mob.mobBody.isFacingLeft = true;
    } else if (targetX > mob.mobBody.position.x) {
      mob.isFacingLeft = false;
      mob.mobBody.isFacingLeft = false;
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
  }

  /**
   * Digs `target` if the mob swung this tick: one swing deals the mob's Tool Damage, exactly as a
   * player's swing does. Out-of-reach or unmineable targets (and blocks too hard for the mob's
   * Pick Power) stop the dig without damage.
   */
  public handleMobMining(mob: MiningActiveMobSession, target: MiningPosition): void {
    const grid = this.world.grid;
    if (!isInBounds(target.x, target.y)) {
      this.stopMobMining(mob);
      return;
    }

    if (!BaseMobAI.isWithinReach(mob.mobBody.position, target, mob.mineRange)) {
      this.stopMobMining(mob);
      mob.miningProgress = 0;
      return;
    }

    const tile = grid[target.y][target.x];
    if (!tile || !isTileMineable(tile.type)) {
      this.stopMobMining(mob);
      return;
    }

    const required = this.world.data.getBlockRequiredPickPower(tile.type);
    if (!canBreakBlock(mob.stats.pickPower, required)) {
      this.stopMobMining(mob);
      return;
    }

    if (!mob.swungThisTick || mob.stats.toolDamage <= 0) return;

    const tileType = tile.type;
    const result = this.world.damage.damageTile(target.x, target.y, {
      amount: mob.stats.toolDamage,
      type: 'mining',
      source: { kind: 'mob', id: mob.id, name: mob.name, position: { x: mob.mobBody.position.x, y: mob.mobBody.position.y } },
    });
    if (!result.applied) {
      this.stopMobMining(mob);
      return;
    }
    mob.miningProgress = result.tileDamage;

    // One hit of feedback per swing so nearby players hear/see it
    this.world.blocks.queueBlockHit({
      x: target.x,
      y: target.y,
      tileType,
      damage: mob.stats.toolDamage,
      source: 'mob',
    });

    if (result.destroyed) {
      this.stopMobMining(mob);
      mob.miningProgress = 0;
    }
  }

  /** A mob's melee attack connects: damage plus a push away from the mob. */
  private attackPlayer(mob: MiningActiveMobSession, player: MiningPlayerSession): void {
    if (mob.stats.weaponDamage <= 0) return;
    const from = mob.mobBody.position;
    const dir = Math.sign(player.playerBody.position.x - from.x) || (player.isFacingLeft ? 1 : -1);
    this.world.damage.applyDamage(
      { kind: 'player', id: player.characterId },
      {
        amount: mob.stats.weaponDamage,
        type: 'melee',
        source: { kind: 'mob', id: mob.id, name: mob.name, position: { x: from.x, y: from.y } },
        knockback:
          mob.stats.knockback > 0
            ? knockbackImpulse(mob.stats.knockback, dir > 0 ? 1 : -1)
            : knockbackAway(
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
