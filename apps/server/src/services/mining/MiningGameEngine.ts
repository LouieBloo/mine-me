import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  MiningTileType,
  type MiningBackpackItem,
  type MiningDroppedItem,
  type MiningFallingRock,
  type MiningGearLayer,
  type MiningInputState,
  type MiningPosition,
  type MiningStateTickPayload,
  type Vector2D,
  MiningRigidWorld,
  type MiningActiveMob,
  type MiningBlockHitEvent,
  type MiningCombatStats,
  type MiningSessionEndedEvent,
  type DamageEvent,
  type DamageResult,
  type DamageTarget,
  type TileDamageResult,
} from '@mine-me/shared';
import * as planck from 'planck';
import {
  generateMiningMap,
  getDamageStage,
  isInBounds,
  type ServerMiningGrid,
} from '../miningMap.service';
import { MiningRockEntity } from './physics/MiningRockEntity';
import { MiningDynamiteEntity } from './physics/MiningDynamiteEntity';
import { MiningProjectileEntity } from './physics/MiningProjectileEntity';
import { MiningDamageSystem } from './MiningDamageSystem';
import type { MiningWorld } from './MiningWorld';
import {
  collectSpawned,
  dynamiteDynamic,
  mobDynamic,
  playerDynamic,
  projectileDynamic,
} from './MiningEntitySync';

// Subsystems
import { MiningDataManager } from './subsystems/MiningDataManager';
import {
  MiningPlayerManager,
  type MiningPlayerSession,
} from './subsystems/MiningPlayerManager';
import { MiningBlockSubsystem } from './subsystems/MiningBlockSubsystem';
import { MiningDropSubsystem } from './subsystems/MiningDropSubsystem';
import { MiningRockSubsystem } from './subsystems/MiningRockSubsystem';
import { MiningExplosiveSubsystem, type ThrowRequest } from './subsystems/MiningExplosiveSubsystem';
import { MiningProjectileSubsystem, type ShootResult } from './subsystems/MiningProjectileSubsystem';
import { MiningMobSubsystem, type MiningActiveMobSession } from './subsystems/MiningMobSubsystem';

export type { MiningPlayerSession, MiningActiveMobSession };

export interface MiningEngineOptions extends Partial<MiningCombatStats> {
  roomId?: string;
  gameMode?: 'singleplayer' | 'multiplayer';
  characterId?: string;
  characterName?: string;
  cityId: string;
  seed?: number;
  socket?: Socket;
  miningSpeed?: number | (() => number);
  gearLayers?: MiningGearLayer[];
  equippedWeaponId?: string | null;
  /** Maximum health of the initial player (a run starts at full health). */
  maxHealth?: number;
  maxDurationSeconds?: number;
  onTimeout?: (roomId: string) => void;
  onRoomEmpty?: (roomId: string) => void;
  /** A player's health changed (damage taken). Used to keep the app's health bar in sync. */
  onPlayerHealthChanged?: (characterId: string, health: number, maxHealth: number) => void;
  /** A player died. Called after the tick finishes, so it is safe to remove them from the room. */
  onPlayerDeath?: (characterId: string) => void;
  /** Called when the room is shut down after too many consecutive failing ticks. */
  onFatalError?: (roomId: string) => void;
  mapConfig?: Partial<import('@mine-me/shared').MiningMapConfigData>;
}

/**
 * Composite MiningGameEngine orchestrating physics, terrain, players, combat, and mobs.
 * Acts as the master coordinator and backward-compatible facade for all mining subsystems.
 */
export class MiningGameEngine {
  public readonly roomId: string;
  public readonly gameMode: 'singleplayer' | 'multiplayer';
  public readonly cityId: string;
  public readonly seed: number;

  public grid: ServerMiningGrid;
  public rigidWorld: MiningRigidWorld;
  public mapConfig?: Partial<import('@mine-me/shared').MiningMapConfigData>;

  public maxDurationSeconds = MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
  public elapsedTimeSeconds = 0;
  private onTimeout?: (roomId: string) => void;
  private onRoomEmpty?: (roomId: string) => void;
  private onFatalError?: (roomId: string) => void;
  private onPlayerHealthChanged?: MiningEngineOptions['onPlayerHealthChanged'];
  private onPlayerDeath?: MiningEngineOptions['onPlayerDeath'];
  private pendingDeaths: string[] = [];

  /** Consecutive ticks in which at least one step threw; the room is ended at this limit. */
  public static readonly MAX_CONSECUTIVE_FAILED_TICKS = 10;
  private consecutiveFailedTicks = 0;
  private tickHadError = false;

  private tickCount = 0;
  private accumulatorSeconds = 0;
  private lastLoopAtMs = 0;
  /** Total ticks skipped because the loop fell too far behind (for diagnostics). */
  public droppedTicks = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isStopped = false;
  private pendingRevealedTiles: { x: number; y: number; type: MiningTileType; damageStage?: number }[] = [];

  // Dedicated Subsystems
  public readonly dataManager: MiningDataManager;
  public readonly playerManager: MiningPlayerManager;
  public readonly blockSubsystem: MiningBlockSubsystem;
  public readonly dropSubsystem: MiningDropSubsystem;
  public readonly rockSubsystem: MiningRockSubsystem;
  public readonly explosiveSubsystem: MiningExplosiveSubsystem;
  public readonly projectileSubsystem: MiningProjectileSubsystem;
  public readonly mobSubsystem: MiningMobSubsystem;
  /** The single place hits are applied (see MiningDamageSystem). */
  public readonly damageSystem: MiningDamageSystem;

  constructor(options: MiningEngineOptions) {
    this.roomId =
      options.roomId ??
      (options.characterId ? `solo_${options.characterId}` : `room_${Math.random().toString(36).substring(2, 9)}`);
    this.gameMode = options.gameMode ?? 'singleplayer';
    this.cityId = options.cityId;
    this.seed = options.seed ?? Math.floor(Math.random() * 2147483647);
    this.maxDurationSeconds = options.maxDurationSeconds ?? MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
    this.onTimeout = options.onTimeout;
    this.onRoomEmpty = options.onRoomEmpty;
    this.onFatalError = options.onFatalError;
    this.onPlayerHealthChanged = options.onPlayerHealthChanged;
    this.onPlayerDeath = options.onPlayerDeath;
    this.mapConfig = options.mapConfig;

    // Generate authoritative grid
    this.grid = generateMiningMap({ seed: this.seed, config: options.mapConfig });

    // Initialize Planck.js rigid body physics world
    this.rigidWorld = new MiningRigidWorld({
      width: options.mapConfig?.gridWidth ?? MINING_CONFIG.GRID_WIDTH,
      height: options.mapConfig?.gridHeight ?? MINING_CONFIG.GRID_HEIGHT,
      gravityEnabled: options.mapConfig?.gravityEnabled ?? true,
      gravity: options.mapConfig?.gravity ?? MINING_CONFIG.GRAVITY,
      dynamiteBounciness: options.mapConfig?.dynamiteBounciness,
      dynamiteFriction: options.mapConfig?.dynamiteFriction,
      dynamiteThrowPower: options.mapConfig?.dynamiteThrowPower,
      rockGravityScale: options.mapConfig?.rockGravityScale,
      rockRestitution: options.mapConfig?.rockRestitution,
    });
    this.rigidWorld.setGrid(this.grid);

    // Initialize subsystems. Each one is given the same world (its view of this room) and reaches
    // its collaborators through it, so none of them needs the engine or each other's constructors.
    this.dataManager = MiningDataManager.getInstance();
    const world = this.buildWorld();
    this.playerManager = new MiningPlayerManager(world);
    this.blockSubsystem = new MiningBlockSubsystem(world);
    this.dropSubsystem = new MiningDropSubsystem(world);
    this.rockSubsystem = new MiningRockSubsystem(world);
    this.explosiveSubsystem = new MiningExplosiveSubsystem(world);
    this.projectileSubsystem = new MiningProjectileSubsystem(world);
    this.mobSubsystem = new MiningMobSubsystem(world);
    this.damageSystem = new MiningDamageSystem(world);
    this.blockSubsystem.onToolTooWeak = (session, blockName) =>
      this.playerManager.sendNotice(session, 'tool_too_weak', `Your tool isn't strong enough to break ${blockName}.`);

    // Automatically spawn cavern mobs if configured
    this.populateCavernMobs();
    this.spawnSurfaceTargetDummy();

    // If options included an initial character and socket, initialize player session
    if (options.characterId && options.socket) {
      this.addPlayer({
        characterId: options.characterId,
        characterName: options.characterName,
        socket: options.socket,
        miningSpeed: options.miningSpeed,
        toolDamage: options.toolDamage,
        weaponDamage: options.weaponDamage,
        pickPower: options.pickPower,
        knockback: options.knockback,
        gearLayers: options.gearLayers,
        equippedWeaponId: options.equippedWeaponId,
        maxHealth: options.maxHealth,
      });
    }
  }

  // ============================================================================
  // Backwards-Compatible Property Accessors
  // ============================================================================

  public get activeRocks(): MiningRockEntity[] {
    return this.rockSubsystem.activeRocks;
  }
  public set activeRocks(val: MiningRockEntity[]) {
    this.rockSubsystem.activeRocks = val;
  }

  public get activeDynamites(): MiningDynamiteEntity[] {
    return this.explosiveSubsystem.activeDynamites;
  }
  public set activeDynamites(val: MiningDynamiteEntity[]) {
    this.explosiveSubsystem.activeDynamites = val;
  }

  public get activeProjectiles(): MiningProjectileEntity[] {
    return this.projectileSubsystem.activeProjectiles;
  }
  public set activeProjectiles(val: MiningProjectileEntity[]) {
    this.projectileSubsystem.activeProjectiles = val;
  }

  public get players(): Map<string, MiningPlayerSession> {
    return this.playerManager.players;
  }

  public get activeMobs(): Map<string, MiningActiveMobSession> {
    return this.mobSubsystem.activeMobs;
  }

  public get droppedItems(): MiningDroppedItem[] {
    return this.dropSubsystem.droppedItems;
  }
  public set droppedItems(val: MiningDroppedItem[]) {
    this.dropSubsystem.droppedItems = val;
  }

  public get activeItemBodies(): Map<string, planck.Body> {
    return this.dropSubsystem.activeItemBodies;
  }

  public get playerCount(): number {
    return this.playerManager.playerCount;
  }

  // ============================================================================
  // Player Management
  // ============================================================================

  public addPlayer(options: {
    characterId: string;
    characterName?: string;
    socket: Socket;
    miningSpeed?: number | (() => number);
    gearLayers?: MiningGearLayer[];
    equippedWeaponId?: string | null;
    maxHealth?: number;
  } & Partial<MiningCombatStats>): MiningPlayerSession {
    const session = this.playerManager.addPlayer(options);
    this.revealAndTrackTiles(session.playerBody.position, session.visionRange);
    return session;
  }

  public removePlayer(characterId: string): { extractedItems: MiningBackpackItem[] } | null {
    const res = this.playerManager.removePlayer(characterId);
    this.projectileSubsystem.magazines.removeCharacter(characterId);
    if (this.playerManager.playerCount === 0 && this.onRoomEmpty) {
      this.onRoomEmpty(this.roomId);
    }
    return res;
  }

  public getPlayer(characterId: string): MiningPlayerSession | undefined {
    return this.playerManager.getPlayer(characterId);
  }

  public increaseVisionRange(characterId: string, amount: number = 1): number {
    return this.playerManager.increaseVisionRange(characterId, amount);
  }

  public setMiningSpeed(characterId: string, speed: number | (() => number)): void {
    this.playerManager.setMiningSpeed(characterId, speed);
  }

  public setLoadout(
    characterId: string,
    loadout: {
      miningSpeed: number;
      gearLayers: MiningGearLayer[];
      equippedWeaponId: string | null;
    } & MiningCombatStats
  ): void {
    const previousWeaponId = this.players.get(characterId)?.equippedWeaponId ?? null;
    this.playerManager.setLoadout(characterId, loadout);
    // Swapping away from a gun cancels its reload (rounds in the gun are kept)
    if (previousWeaponId && previousWeaponId !== loadout.equippedWeaponId) {
      this.projectileSubsystem.magazines.cancelReload(characterId, previousWeaponId);
    }
  }

  public setSocket(characterId: string, socket: Socket): void {
    this.playerManager.setSocket(characterId, socket);
  }

  public handleInput(characterId: string, input: MiningInputState): void {
    this.playerManager.handleInput(characterId, input);
  }

  // ============================================================================
  // Simulation Loop Lifecycle
  // ============================================================================

  /** Length of one simulation step in seconds. */
  public static readonly TICK_SECONDS = 1 / MINING_CONFIG.SERVER_TICK_RATE;

  /** How often the loop checks the clock; finer than a tick so steps start close to on time. */
  private static readonly LOOP_POLL_MS = 1000 / 60;

  public start(): void {
    if (this.intervalId) return;
    this.isStopped = false;
    this.accumulatorSeconds = 0;
    this.lastLoopAtMs = performance.now();
    this.intervalId = setInterval(() => {
      const nowMs = performance.now();
      const elapsedSeconds = (nowMs - this.lastLoopAtMs) / 1000;
      this.lastLoopAtMs = nowMs;
      this.advance(elapsedSeconds);
    }, MiningGameEngine.LOOP_POLL_MS);
  }

  /**
   * Advances the simulation by `elapsedSeconds` of real time using fixed steps, so game speed
   * doesn't depend on timer jitter or event-loop lag: a late wake-up runs the missed steps.
   * At most MAX_CATCHUP_TICKS run per call; anything beyond that is dropped (the game hitches
   * instead of freezing the server in a catch-up spiral). Returns how many steps ran.
   */
  public advance(elapsedSeconds: number): number {
    if (this.isStopped || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;

    const step = MiningGameEngine.TICK_SECONDS;
    this.accumulatorSeconds += elapsedSeconds;

    let ticks = 0;
    while (this.accumulatorSeconds >= step - 1e-9 && ticks < MINING_CONFIG.MAX_CATCHUP_TICKS) {
      this.tick(step);
      this.accumulatorSeconds -= step;
      ticks++;
      if (this.isStopped) return ticks;
    }

    if (this.accumulatorSeconds >= step - 1e-9) {
      // Fell too far behind: drop the backlog (keep the partial step) rather than spiral
      const droppedSteps = Math.floor((this.accumulatorSeconds + 1e-9) / step);
      this.accumulatorSeconds -= droppedSteps * step;
      this.droppedTicks += droppedSteps;
      console.warn(`[Mining] Room ${this.roomId} fell behind; dropped ${droppedSteps} ticks (${this.droppedTicks} total)`);
    }
    this.accumulatorSeconds = Math.max(0, this.accumulatorSeconds);
    return ticks;
  }

  public stop(): void {
    this.isStopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const rock of this.rockSubsystem.activeRocks) {
      if (rock.rigidBody) {
        this.rigidWorld.destroyBody(rock.rigidBody);
      }
    }
    this.rockSubsystem.activeRocks = [];
  }

  /**
   * Main 30 Hz simulation tick execution.
   */
  private tick(dt: number): void {
    if (this.isStopped) return;
    this.tickCount++;
    this.elapsedTimeSeconds += dt;

    // Check max session duration limit
    if (this.elapsedTimeSeconds >= this.maxDurationSeconds) {
      this.handleSessionTimeout();
      return;
    }

    this.tickHadError = false;
    this.runTickSteps(dt);
    this.processDeaths();

    if (this.tickHadError) {
      this.consecutiveFailedTicks++;
      if (this.consecutiveFailedTicks >= MiningGameEngine.MAX_CONSECUTIVE_FAILED_TICKS) {
        this.handleFatalError();
      }
    } else {
      this.consecutiveFailedTicks = 0;
    }
  }

  /**
   * Runs one simulation step in isolation so a failure in one subsystem is logged
   * but cannot take down the process or the other subsystems.
   */
  private runStep(name: string, step: () => void): void {
    try {
      step();
    } catch (err) {
      this.tickHadError = true;
      console.error(`[Mining] Room ${this.roomId} tick ${this.tickCount} step "${name}" failed:`, err);
    }
  }

  private runTickSteps(dt: number): void {
    // 1. Process physics, animations, FoW, and item pickups for all players
    this.runStep('players', () => this.playerManager.updatePlayerPhysicsAndFoW(dt));

    // 2. Step Planck rigid world
    this.runStep('rigidWorld', () => this.rigidWorld.step(dt));

    // 3. Update dropped items physics
    this.runStep('drops', () => this.dropSubsystem.updateDroppedItemsPhysics());

    // 4. Falling rocks simulation
    this.runStep('rocks', () => this.rockSubsystem.updateFallingRocks(dt));

    // 5. Dynamite continuous physics & fuse countdown simulation
    this.runStep('explosives', () => this.explosiveSubsystem.updateActiveDynamites(dt));

    // 6. Projectiles continuous physics, collision detection & ammo reloading
    this.runStep('projectiles', () => this.projectileSubsystem.updateActiveProjectiles(dt));

    // 6.5 Advance each player's swing timer (one swing drives both block damage and melee)
    this.runStep('swings', () => this.playerManager.advanceSwings(dt));

    // 7. Validate & trigger mining actions for each player & cooperative progress
    this.runStep('mining', () => this.blockSubsystem.updateMiningProgress(dt));

    // 8. Player Melee Attack against Mobs (Terraria-style localized cursor hit scan with obstacle shielding)
    this.runStep('melee', () => this.playerManager.handleMeleeAttacks());

    // 9. Update Active Mobs (AI, Physics, Mining, Combat)
    this.runStep('mobs', () => this.mobSubsystem.updateActiveMobs(dt));

    // 10. Broadcast 30 Hz State Tick
    this.runStep('broadcast', () => this.broadcastStateTick());
  }

  /** Ends the run of every player who died this tick (after the simulation steps, so it is safe). */
  private processDeaths(): void {
    if (this.pendingDeaths.length === 0) return;
    const dead = this.pendingDeaths;
    this.pendingDeaths = [];
    for (const characterId of dead) {
      const session = this.players.get(characterId);
      if (!session) continue;
      if (session.socket && session.socket.connected) {
        const ended: MiningSessionEndedEvent = {
          reason: 'death',
          title: 'You Were Knocked Out',
          message: 'You were knocked out in the mine. You have been returned to the surface and the contents of your backpack were lost.',
        };
        session.socket.emit('mining_session_ended', ended);
      }
      this.onPlayerDeath?.(characterId);
    }
  }

  private handleFatalError(): void {
    console.error(
      `[Mining] Room ${this.roomId} ended after ${this.consecutiveFailedTicks} consecutive failing ticks`
    );
    this.stop();

    for (const session of this.players.values()) {
      if (session.socket && session.socket.connected) {
        // Reuses the timeout event so existing clients return to the surface.
        session.socket.emit('mining_session_timeout', {
          message: 'The mine became unstable and collapsed. You have been returned to the surface and the contents of your backpack were lost.',
        });
      }
    }

    const notify = this.onFatalError ?? this.onTimeout;
    notify?.(this.roomId);
  }

  // ============================================================================
  // Mining Block Excavation & Placement
  // ============================================================================

  public startMining(characterId: string, target: MiningPosition): boolean {
    return this.blockSubsystem.startMining(this.players.get(characterId), target);
  }

  public stopMining(characterId: string): void {
    this.blockSubsystem.stopMining(this.players.get(characterId));
  }

  /** Validation-only check; lets callers consume an item before committing the placement. */
  public canPlaceLadder(characterId: string, target?: MiningPosition): boolean {
    return this.blockSubsystem.validateLadderPlacement(this.players.get(characterId), target) !== null;
  }

  public canPlaceTorch(characterId: string, target: MiningPosition): boolean {
    return this.blockSubsystem.validateTorchPlacement(this.players.get(characterId), target);
  }

  /** Without a target, the ladder goes on the tile the player is standing in. */
  public placeLadder(characterId: string, target?: MiningPosition): boolean {
    return this.blockSubsystem.placeLadder(this.players.get(characterId), target);
  }

  public placeTorch(characterId: string, target: MiningPosition): boolean {
    return this.blockSubsystem.placeTorch(this.players.get(characterId), target);
  }

  public spawnBlockDrops(tx: number, ty: number, tileType: MiningTileType): void {
    this.dropSubsystem.spawnBlockDrops(tx, ty, tileType);
  }

  // ============================================================================
  // Explosives & Combat
  // ============================================================================

  public throwDynamite(characterId: string, request: ThrowRequest): boolean {
    return this.explosiveSubsystem.throwDynamite(this.players.get(characterId), request);
  }

  public explodeDynamite(dynamite: MiningDynamiteEntity): void {
    this.explosiveSubsystem.explodeDynamite(dynamite);
  }

  public shootProjectile(characterId: string, target: Vector2D, muzzlePosition?: Vector2D): ShootResult {
    return this.projectileSubsystem.shootProjectile(this.players.get(characterId), target, muzzlePosition);
  }

  public reloadWeapon(characterId: string): ShootResult {
    return this.projectileSubsystem.reloadWeapon(this.players.get(characterId));
  }

  // ============================================================================
  // Mob Subsystem Delegations
  // ============================================================================

  public spawnMob(
    mobData: Parameters<MiningMobSubsystem['spawnMob']>[0],
    position?: Vector2D
  ): MiningActiveMobSession {
    const spawnPos = position || this.findValidCavernSpawnPosition();
    return this.mobSubsystem.spawnMob(mobData, spawnPos);
  }

  public findValidCavernSpawnPosition(minDepth = 5): Vector2D {
    return this.mobSubsystem.findValidCavernSpawnPosition(minDepth);
  }

  public populateCavernMobs(options?: { count?: number; minDepth?: number; mobIds?: string[] }): void {
    this.mobSubsystem.populateCavernMobs(options);
  }

  public spawnSurfaceTargetDummy(position?: Vector2D): MiningActiveMobSession | null {
    return this.mobSubsystem.spawnSurfaceTargetDummy(position);
  }

  /**
   * Applies a hit to a mob or player. Every source of damage goes through here (melee, bullets,
   * explosions, mob attacks) so immunity, knockback and future modifiers live in one place.
   */
  public applyDamage(target: DamageTarget, event: DamageEvent): DamageResult {
    return this.damageSystem.applyDamage(target, event);
  }

  /** Applies a hit to a block, mining it through when its health is used up. */
  public damageTile(x: number, y: number, event: DamageEvent, miners?: MiningPlayerSession[]): TileDamageResult {
    return this.damageSystem.damageTile(x, y, event, miners);
  }

  /**
   * The view of this room that every subsystem is given. Properties are read lazily (getters), so
   * a subsystem always sees the room's current state, including systems created after it.
   */
  private buildWorld(): MiningWorld {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;
    return {
      get grid() {
        return engine.grid;
      },
      get rigidWorld() {
        return engine.rigidWorld;
      },
      get data() {
        return engine.dataManager;
      },
      get mapConfig() {
        return engine.mapConfig;
      },
      get players() {
        return engine.playerManager.players;
      },
      get simTime() {
        return engine.elapsedTimeSeconds;
      },
      get playerManager() {
        return engine.playerManager;
      },
      get blocks() {
        return engine.blockSubsystem;
      },
      get drops() {
        return engine.dropSubsystem;
      },
      get rocks() {
        return engine.rockSubsystem;
      },
      get explosives() {
        return engine.explosiveSubsystem;
      },
      get projectiles() {
        return engine.projectileSubsystem;
      },
      get mobs() {
        return engine.mobSubsystem;
      },
      get damage() {
        return engine.damageSystem;
      },
      pushTileUpdate: (update) => {
        engine.pendingRevealedTiles.push(update);
      },
      revealAround: (position, visionRange) => engine.revealAndTrackTiles(position, visionRange),
      notifyPlayerHealth: (characterId, health, maxHealth) =>
        engine.onPlayerHealthChanged?.(characterId, health, maxHealth),
      queuePlayerDeath: (characterId) => {
        engine.pendingDeaths.push(characterId);
      },
    };
  }

  public updateActiveMobs(dt: number): void {
    this.mobSubsystem.updateActiveMobs(dt);
  }

  public handleMobMining(mob: MiningActiveMobSession, target: MiningPosition, dt: number): void {
    this.mobSubsystem.handleMobMining(mob, target, dt);
  }

  public killMob(mob: MiningActiveMobSession): void {
    this.mobSubsystem.killMob(mob);
  }

  public getActiveMobs(): MiningActiveMob[] {
    return this.mobSubsystem.getActiveMobs();
  }

  // ============================================================================
  // FoW Revelation & State Tick Broadcast
  // ============================================================================

  private revealAndTrackTiles(position: MiningPosition, visionRange: number): void {
    const cx = Math.floor(position.x);
    const cy = Math.floor(position.y);
    for (let dy = -visionRange; dy <= visionRange; dy++) {
      for (let dx = -visionRange; dx <= visionRange; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > visionRange) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (isInBounds(nx, ny) && !this.grid[ny][nx].revealed) {
          this.grid[ny][nx].revealed = true;
          this.pendingRevealedTiles.push({
            x: nx,
            y: ny,
            type: this.grid[ny][nx].type,
            damageStage: getDamageStage(this.grid[ny][nx]),
          });
        }
      }
    }
  }

  private broadcastStateTick(): void {
    const fallingRockPayloads: MiningFallingRock[] = this.activeRocks.map((r) => ({
      id: r.id,
      position: { x: r.position.x, y: r.position.y },
      velocity: { x: r.velocity.x, y: r.velocity.y },
      angle: r.angle,
    }));

    // Dynamic fields only: static descriptions are sent once per client in `spawned` (MiningEntitySync)
    const dynamitePayloads = this.activeDynamites.map(dynamiteDynamic);
    const projectilePayloads = this.activeProjectiles.map(projectileDynamic);
    const mobSessions = Array.from(this.activeMobs.values());
    const activeMobsPayload = mobSessions.map(mobDynamic);
    const explosionsToSend = this.explosiveSubsystem.consumePendingExplosions();
    const gunshotsToSend = this.projectileSubsystem.consumePendingGunshots();
    const allBlockHits = this.blockSubsystem.consumePendingBlockHits();

    for (const session of this.players.values()) {
      if (!session.socket || !session.socket.connected) continue;

      const others = Array.from(this.players.values()).filter((p) => p.characterId !== session.characterId);
      const otherPlayers = others.map(playerDynamic);
      const spawned = collectSpawned(session.known, {
        mobs: mobSessions,
        projectiles: this.activeProjectiles,
        dynamites: this.activeDynamites,
        others,
      });

      const blockHitsToSend = this.blockHitsFor(session, allBlockHits);

      const weaponAmmoPayload = this.projectileSubsystem.getAmmoStatus(session);

      const payload: MiningStateTickPayload = {
        tick: this.tickCount,
        position: { x: session.playerBody.position.x, y: session.playerBody.position.y },
        velocity: { x: session.playerBody.velocity.x, y: session.playerBody.velocity.y },
        isMining: session.isMining,
        miningTarget: session.miningTarget ?? undefined,
        revealedTiles: this.pendingRevealedTiles.length > 0 ? this.pendingRevealedTiles : undefined,
        fallingRocks: fallingRockPayloads.length > 0 ? fallingRockPayloads : undefined,
        activeDynamites: dynamitePayloads.length > 0 ? dynamitePayloads : undefined,
        activeProjectiles: projectilePayloads.length > 0 ? projectilePayloads : undefined,
        // Always sent (even when empty) so clients can tell "none" from "unchanged"
        mobs: activeMobsPayload,
        explosions: explosionsToSend.length > 0 ? explosionsToSend : undefined,
        gunshots: gunshotsToSend.length > 0 ? gunshotsToSend : undefined,
        blockHits: blockHitsToSend.length > 0 ? blockHitsToSend : undefined,
        otherPlayers,
        spawned,
        weaponAmmo: weaponAmmoPayload ?? undefined,
        droppedItems: this.dropSubsystem.droppedItemsDirty ? this.droppedItems : undefined,
        temporaryBackpack: session.backpackDirty ? session.temporaryBackpack : undefined,
      };

      session.socket.emit('mining_state_tick', payload);
      session.backpackDirty = false;
    }

    this.dropSubsystem.droppedItemsDirty = false;
    this.pendingRevealedTiles = [];
  }

  /**
   * Player-caused hits go to everyone in the room. Mob-caused hits (digging) are only sent to
   * players close enough to see/hear them.
   */
  private blockHitsFor(session: MiningPlayerSession, hits: MiningBlockHitEvent[]): MiningBlockHitEvent[] {
    if (hits.length === 0) return hits;
    const { x: px, y: py } = session.playerBody.position;
    const range = MINING_CONFIG.BLOCK_HIT_HEARING_RANGE;
    return hits.filter(
      (h) => h.source !== 'mob' || Math.hypot(h.x + 0.5 - px, h.y + 0.5 - py) <= range
    );
  }

  private handleSessionTimeout(): void {
    console.log(`[Mining] Room ${this.roomId} timed out (${this.elapsedTimeSeconds.toFixed(1)}s elapsed)`);
    this.stop();

    for (const session of this.players.values()) {
      if (session.socket && session.socket.connected) {
        session.socket.emit('mining_session_timeout', {
          message: 'Your mining session has reached the 15-minute time limit. You have been returned to the surface and the contents of your backpack were lost.',
        });
      }
    }

    // Rooms are keyed by roomId (solo rooms are `solo_<characterId>`), so always pass it.
    this.onTimeout?.(this.roomId);
  }
}
