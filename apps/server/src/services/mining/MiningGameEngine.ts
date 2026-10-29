import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  isInInterest,
  roundWire,
  MiningTileType,
  type BiomeClientDefinition,
  type BiomeField,
  type MiningBackpackItem,
  type MiningDroppedItem,
  type MiningFallingRock,
  type MiningGearLayer,
  type MiningGameMode,
  getGridDimensions,
  type MiningInputState,
  type MiningPosition,
  type MiningStateTickPayload,
  type Vector2D,
  MiningRigidWorld,
  type MiningActiveMob,
  type MiningBlockHitEvent,
  backpackWeight,
  type MiningCombatStats,
  type CarryStats,
  type MiningSessionEndedEvent,
  type DamageEvent,
  type DamageResult,
  type DamageTarget,
  type TileDamageResult,
  pickRunBiomes,
  sanitizeBiomeKeys,
  type MissionDefinition,
  type MissionRequirements,
  type ObjectiveDefinition,
  type MissionResultView,
} from '@mine-me/shared';
import * as planck from 'planck';
import {
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
  droppedItemDynamic,
  droppedListChanged,
  inView,
  dynamiteDynamic,
  mobDynamic,
  playerDynamic,
  projectileDynamic,
} from './MiningEntitySync';

// Subsystems
import { MiningBeltSubsystem } from './subsystems/MiningBeltSubsystem';
import { MiningExtractorSubsystem, type StashWriter } from './subsystems/MiningExtractorSubsystem';
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
import { MiningFluidSubsystem } from './subsystems/MiningFluidSubsystem';
import { MiningGasSubsystem } from './subsystems/MiningGasSubsystem';
import { MiningGasExplosionSubsystem } from './subsystems/MiningGasExplosionSubsystem';
import { buildMapForMode } from './mapSources';
import { SandboxTools } from './sandbox/SandboxTools';
import { getGameModeRules, type GameModeRules } from './gameModeRules';
import { MiningIgnitionSubsystem } from './subsystems/MiningIgnitionSubsystem';
import { MiningFireSubsystem } from './subsystems/MiningFireSubsystem';
import { MiningDoodadSubsystem } from './subsystems/MiningDoodadSubsystem';
import { MiningSurfaceState } from './subsystems/MiningSurfaceState';
import { MiningTickProfiler } from './MiningTickProfiler';
import { MiningBurningSubsystem } from './subsystems/MiningBurningSubsystem';
import { MiningMobSubsystem, type MiningActiveMobSession } from './subsystems/MiningMobSubsystem';
import { MissionTracker } from './missions/MissionTracker';
import { missionLookups, requirementsFor, rewardView } from './missions/missionContext';

export type { MiningPlayerSession, MiningActiveMobSession };

export interface MiningEngineOptions extends Partial<MiningCombatStats & CarryStats> {
  roomId?: string;
  gameMode?: MiningGameMode;
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
  /** Writes a player's deposits to the extractor's stash in the database (only modes that save to the character). */
  writeStash?: StashWriter;
  /** Called when the room is shut down after too many consecutive failing ticks. */
  onFatalError?: (roomId: string) => void;
  mapConfig?: Partial<import('@mine-me/shared').MiningMapConfigData>;
  /** Single Player only: biomes the player chose to see (keys, untrusted). Only those appear, at any depth. Absent or empty: a normal map. */
  biomeKeys?: string[];
  /** The mission this run plays (tickets 108-113): the map is made to hold what it needs. Absent: a run without a mission. */
  mission?: MissionDefinition;
}

/**
 * Composite MiningGameEngine orchestrating physics, terrain, players, combat, and mobs.
 * Acts as the master coordinator and backward-compatible facade for all mining subsystems.
 */
export class MiningGameEngine {
  public readonly roomId: string;
  public readonly gameMode: MiningGameMode;
  /** What this mode allows and saves (see gameModeRules). */
  public readonly rules: GameModeRules;
  public readonly cityId: string;
  public readonly seed: number;

  // The map and everything simulated on it. Only `rebuildWorld` assigns these (at start, and when the
  // sandbox is reset), so a subsystem always reaches the current ones through its world.
  /** Row of the ground surface (0 except in the sandbox, which has open sky above it). */
  public surfaceRow = 0;
  /** Which biome each cell is in (null in the sandbox: the whole map is the default biome). */
  public biomeField: BiomeField | null = null;
  /** The primary biome of every cell (one byte each), or null when the mine is one biome and nothing needs telling. */
  public biomeGrid: Uint8Array | null = null;
  public grid!: ServerMiningGrid;
  public rigidWorld!: MiningRigidWorld;
  public mapConfig?: Partial<import('@mine-me/shared').MiningMapConfigData>;
  /** The run's mission (null: none). The sandbox sets and clears it with its tools. */
  public mission: MissionDefinition | null = null;
  /** Follows the mission through the run (null without one). Rebuilt when the world is. */
  public missionTracker: MissionTracker | null = null;
  /** The mission step polls fluid and gas totals this often (ticks). */
  private static readonly MISSION_POLL_TICKS = 10;
  /** The biomes this run was started with (Single Player), as asked; empty for a normal map. Never stored. */
  public readonly runBiomeKeys: string[];

  public maxDurationSeconds = MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
  public elapsedTimeSeconds = 0;
  private onTimeout?: (roomId: string) => void;
  private onRoomEmpty?: (roomId: string) => void;
  private onFatalError?: (roomId: string) => void;
  private onPlayerHealthChanged?: MiningEngineOptions['onPlayerHealthChanged'];
  private onPlayerDeath?: MiningEngineOptions['onPlayerDeath'];
  private writeStash?: StashWriter;
  private pendingDeaths: string[] = [];
  /** The test tools, in a sandbox room (null elsewhere). */
  public readonly sandbox: SandboxTools | null;
  /** The one view of this room every subsystem is given (see buildWorld). */
  private readonly worldView: MiningWorld;

  /** Consecutive ticks in which at least one step threw; the room is ended at this limit. */
  public static readonly MAX_CONSECUTIVE_FAILED_TICKS = 10;
  private consecutiveFailedTicks = 0;
  private tickHadError = false;

  private tickCount = 0;
  /** Always-on timing of this room's ticks (see MiningTickProfiler); its summary goes to players about once a second. */
  public readonly profiler = new MiningTickProfiler(1000 / MINING_CONFIG.SERVER_TICK_RATE);
  private accumulatorSeconds = 0;
  private lastLoopAtMs = 0;
  /** Total ticks skipped because the loop fell too far behind (for diagnostics). */
  public droppedTicks = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isStopped = false;
  private pendingRevealedTiles: NonNullable<MiningStateTickPayload['revealedTiles']> = [];

  // Dedicated Subsystems
  public readonly dataManager: MiningDataManager;
  public readonly playerManager: MiningPlayerManager;
  public blockSubsystem!: MiningBlockSubsystem;
  public dropSubsystem!: MiningDropSubsystem;
  public rockSubsystem!: MiningRockSubsystem;
  public explosiveSubsystem!: MiningExplosiveSubsystem;
  public projectileSubsystem!: MiningProjectileSubsystem;
  public mobSubsystem!: MiningMobSubsystem;
  public fluidSubsystem!: MiningFluidSubsystem;
  public gasSubsystem!: MiningGasSubsystem;
  /** The extractor on the surface (null in modes without one). */
  public extractorSubsystem: MiningExtractorSubsystem | null = null;
  /** The sandbox asked for an extractor (a mode without one has none until it is spawned; a reset takes it away). */
  public extractorRequested = false;
  /** Sandbox: the generator's doodad pass runs on the map (a toggle in the tool panel; survives a reset). */
  public sandboxDoodadsRequested = false;
  /** The conveyor belt going down from the extractor (null in modes without one). */
  public beltSubsystem: MiningBeltSubsystem | null = null;
  public gasExplosionSubsystem!: MiningGasExplosionSubsystem;
  public ignitionSubsystem!: MiningIgnitionSubsystem;
  public fireSubsystem!: MiningFireSubsystem;
  /** The scenery (tickets 100-105). */
  public doodadSubsystem!: MiningDoodadSubsystem;
  /** The sky, scenery and weather above the ground (tickets 129-135). */
  public readonly surface: MiningSurfaceState;
  public burningSubsystem!: MiningBurningSubsystem;
  /** The single place hits are applied (see MiningDamageSystem). */
  public damageSystem!: MiningDamageSystem;

  constructor(options: MiningEngineOptions) {
    this.roomId =
      options.roomId ??
      (options.characterId ? `solo_${options.characterId}` : `room_${Math.random().toString(36).substring(2, 9)}`);
    this.gameMode = options.gameMode ?? 'singleplayer';
    this.rules = getGameModeRules(this.gameMode);
    this.cityId = options.cityId;
    this.seed = options.seed ?? Math.floor(Math.random() * 2147483647);
    this.maxDurationSeconds = options.maxDurationSeconds ?? MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
    this.onTimeout = options.onTimeout;
    this.onRoomEmpty = options.onRoomEmpty;
    this.onFatalError = options.onFatalError;
    this.onPlayerHealthChanged = options.onPlayerHealthChanged;
    this.writeStash = options.writeStash;
    this.onPlayerDeath = options.onPlayerDeath;
    this.mapConfig = options.mapConfig;
    this.mission = options.mission ?? null;
    this.runBiomeKeys = options.gameMode === 'singleplayer' || options.gameMode === undefined ? sanitizeBiomeKeys(options.biomeKeys) : [];

    // Initialize subsystems. Each one is given the same world (its view of this room) and reaches
    // its collaborators through it, so none of them needs the engine or each other's constructors.
    this.dataManager = MiningDataManager.getInstance();
    this.worldView = this.buildWorld();
    this.playerManager = new MiningPlayerManager(this.worldView);
    // The sandbox always starts on the default environment (so a problem can be reproduced from the same sky); a run picks by seed
    const environments = this.dataManager.getSurfaceEnvironments();
    this.surface = new MiningSurfaceState({
      seed: this.seed,
      environments,
      preferredKey: this.gameMode === 'sandbox' ? environments.find((e) => e.isDefault)?.key : undefined,
    });
    this.sandbox = this.rules.hasSandboxTools ? new SandboxTools(this) : null;
    this.rebuildWorld();

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
        carryCapacity: options.carryCapacity,
        gearLayers: options.gearLayers,
        equippedWeaponId: options.equippedWeaponId,
        maxHealth: options.maxHealth,
      });
    }
  }

  /**
   * (Re)builds the map and everything simulated on it: the grid, the physics world, every subsystem
   * and the starting fluid and mobs. Players are kept (see `resetSandbox`).
   */
  private rebuildWorld(): void {
    const mapConfig = this.mapConfig;
    // A run that picked biomes uses only those (any depth), so the map's own biome weights do not apply
    const allBiomes = MiningDataManager.getInstance().getBiomes();
    const picking = this.runBiomeKeys.some((key) => allBiomes.some((b) => b.key === key));
    const pickedBiomes = picking ? pickRunBiomes(allBiomes, this.runBiomeKeys) : allBiomes;
    const generatorConfig = picking ? { ...mapConfig, biomeWeights: null } : mapConfig;
    const built = buildMapForMode(this.gameMode, {
      seed: this.seed,
      mapConfig: generatorConfig,
      fluids: MiningDataManager.getInstance().getFluids(),
      gases: MiningDataManager.getInstance().getGases(),
      biomes: pickedBiomes,
      doodads: MiningDataManager.getInstance().getDoodads(),
      sandboxDoodads: this.sandboxDoodadsRequested,
      surface: { environment: this.surface.environment, extractor: this.rules.hasExtractor || this.extractorRequested ? this.dataManager.getDefaultExtractor() : null },
      mission: this.mission && this.gameMode !== 'sandbox' ? requirementsFor(this.mission, this.dataManager) : undefined,
    });
    this.grid = built.grid;
    this.surfaceRow = built.surfaceRow ?? 0;
    this.biomeField = built.biomeField ?? null;
    this.biomeGrid = this.biomeField?.hasBiomes ? this.biomeField.primaryGrid() : null;
    const gridSize = getGridDimensions(this.grid);

    this.rigidWorld = new MiningRigidWorld({
      width: gridSize.width,
      height: gridSize.height,
      gravityEnabled: mapConfig?.gravityEnabled ?? true,
      gravity: mapConfig?.gravity ?? MINING_CONFIG.GRAVITY,
      dynamiteBounciness: mapConfig?.dynamiteBounciness,
      dynamiteFriction: mapConfig?.dynamiteFriction,
      dynamiteThrowPower: mapConfig?.dynamiteThrowPower,
      rockGravityScale: mapConfig?.rockGravityScale,
      rockRestitution: mapConfig?.rockRestitution,
    });
    this.rigidWorld.setGrid(this.grid);

    const world = this.worldView;
    this.blockSubsystem = new MiningBlockSubsystem(world);
    this.dropSubsystem = new MiningDropSubsystem(world);
    this.rockSubsystem = new MiningRockSubsystem(world);
    this.explosiveSubsystem = new MiningExplosiveSubsystem(world);
    this.projectileSubsystem = new MiningProjectileSubsystem(world);
    this.mobSubsystem = new MiningMobSubsystem(world);
    this.fluidSubsystem = new MiningFluidSubsystem(world);
    this.gasSubsystem = new MiningGasSubsystem(world);
    this.gasExplosionSubsystem = new MiningGasExplosionSubsystem(world);
    this.ignitionSubsystem = new MiningIgnitionSubsystem(world);
    this.fireSubsystem = new MiningFireSubsystem(world);
    this.burningSubsystem = new MiningBurningSubsystem(world);
    this.extractorSubsystem = this.rules.hasExtractor || this.extractorRequested ? new MiningExtractorSubsystem(world) : null;
    if (this.extractorSubsystem) this.extractorSubsystem.writeStash = this.writeStash ?? null;
    this.beltSubsystem = this.extractorSubsystem ? new MiningBeltSubsystem(world) : null;
    this.doodadSubsystem = new MiningDoodadSubsystem(world, MiningDataManager.getInstance().getDoodads(), built.doodads);
    for (const cell of built.fluidCells) this.fluidSubsystem.placeFluid(cell.x, cell.y, cell.typeKey, cell.level);
    for (const cell of built.gasCells ?? []) this.gasSubsystem.placeGas(cell.x, cell.y, cell.typeKey, cell.concentration);
    this.damageSystem = new MiningDamageSystem(world);
    this.blockSubsystem.onToolTooWeak = (session, blockName) =>
      this.playerManager.sendNotice(session, 'tool_too_weak', `Your tool isn't strong enough to break ${blockName}.`);

    // Starting mobs: the map's own list, or the usual cavern mobs plus the surface dummy
    if (built.mobs) {
      for (const mob of built.mobs) this.spawnSurfaceTargetDummy({ x: mob.x, y: mob.y });
    } else {
      this.populateCavernMobs();
      // Mission guarantee: enough mobs in the caves for a kill goal (before the target dummy, which is not one)
      if (this.mission && this.gameMode !== 'sandbox') this.mobSubsystem.ensureMissionMobs(requirementsFor(this.mission, this.dataManager).mobs);
      this.spawnSurfaceTargetDummy();
    }
    this.startMissionTracker();
  }

  /** (Re)starts the tracker for the run's mission against the world as it is now (the baselines for fluid and gas are taken here). */
  public startMissionTracker(): void {
    if (!this.mission) {
      this.missionTracker = null;
      this.sendMissionState();
      return;
    }
    const data = this.dataManager;
    const fluidId = (typeKey: string) => this.fluidSubsystem.registry.idOf(typeKey);
    const gasId = (typeKey: string) => this.gasSubsystem.registry.idOf(typeKey);
    this.missionTracker = new MissionTracker(this.mission, {
      lookups: missionLookups(data),
      fluidTypeKey: (id) => data.getFluid(id)?.typeKey,
      gasTypeKey: (id) => data.getGas(id)?.typeKey,
      fluidTotal: (typeKey) => (fluidId(typeKey) === undefined ? 0 : this.fluidSubsystem.grid.totalVolume(fluidId(typeKey))),
      gasTotal: (typeKey) => (gasId(typeKey) === undefined ? 0 : this.gasSubsystem.grid.totalVolume(gasId(typeKey))),
      mapDepth: this.grid.length - this.surfaceRow,
      playerName: (characterId) => this.players.get(characterId)?.characterName ?? this.missionNames.get(characterId) ?? 'Miner',
      reward: rewardView(this.mission, data),
    });
    this.sendMissionState();
  }

  /** Tells every player the mission as it stands now (a new, restarted or dropped mission), in full. */
  private sendMissionState(): void {
    for (const session of this.players.values()) {
      if (session.socket?.connected) session.socket.emit('mining_mission_state', { mission: this.missionTracker?.clientState() ?? null });
    }
  }

  /** Names of players who left, so a result can still say who did what. */
  private readonly missionNames = new Map<string, string>();

  /** Gives the room a mission (the sandbox's tool) and starts following it. */
  public setMission(mission: MissionDefinition | null): void {
    this.mission = mission;
    this.startMissionTracker();
  }

  /** Adds an objective to the run's mission as it goes (any source). False when the run has no mission. */
  public addMissionObjective(def: ObjectiveDefinition): boolean {
    if (!this.missionTracker) return false;
    this.missionTracker.addObjective(def);
    return true;
  }

  /** How the run's mission stands for a player ending their run, or undefined when the run had none. */
  public missionResultFor(characterId: string, outcome: MissionResultView['outcome'], reason?: string): MissionResultView | undefined {
    const tracker = this.missionTracker;
    if (!tracker) return undefined;
    return tracker.result([...this.players.keys(), characterId], outcome, reason);
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
    /** A real client is loading: the extractor lands when it says it is ready, not the moment it joins. */
    deferLanding?: boolean;
  } & Partial<MiningCombatStats & CarryStats>): MiningPlayerSession {
    const session = this.playerManager.addPlayer(options);
    if (options.deferLanding) this.extractorSubsystem?.expectClient();
    else this.extractorSubsystem?.begin();
    this.revealAndTrackTiles(session.playerBody.position, session.visionRange);
    return session;
  }

  /** A client has finished loading and is showing the mine: the extractor can land now. */
  public clientReady(): void {
    this.extractorSubsystem?.begin();
  }

  /** Writes every player's unsaved deposits to the database now (the run is ending). */
  public flushStashes(): void {
    for (const session of this.players.values()) this.extractorSubsystem?.flushStash(session);
  }

  public removePlayer(characterId: string): { extractedItems: MiningBackpackItem[] } | null {
    const leaving = this.players.get(characterId);
    if (leaving) this.extractorSubsystem?.flushStash(leaving);
    // Items still on the belt never reached the extractor: they go with the player
    this.beltSubsystem?.removeItemsOf(characterId);
    const res = this.playerManager.removePlayer(characterId);
    this.projectileSubsystem.magazines.removeCharacter(characterId);
    if (this.playerManager.playerCount === 0 && this.onRoomEmpty) {
      this.onRoomEmpty(this.roomId);
    }
    return res;
  }

  /**
   * Rebuilds the map and everything on it from scratch and sends every player back to the start
   * (sandbox reset). Nothing but the players survives, so a reset always matches a fresh room.
   */
  /**
   * Puts an extractor (and its belt) in a room whose mode does not have one, landing now (sandbox tool). Returns false if
   * the room already has one. The extractor's first player-joined clock starts at once.
   */
  public spawnExtractorNow(): boolean {
    if (this.extractorSubsystem) return false;
    this.extractorRequested = true;
    this.extractorSubsystem = new MiningExtractorSubsystem(this.worldView);
    this.extractorSubsystem.writeStash = this.writeStash ?? null;
    this.beltSubsystem = new MiningBeltSubsystem(this.worldView);
    // Clients rebuild their view after this, so the landing waits until they say they are ready
    this.extractorSubsystem.expectClient();
    return true;
  }

  public resetWorld(): void {
    this.pendingRevealedTiles = [];
    this.pendingDeaths = [];
    this.rebuildWorld();
    for (const session of this.players.values()) this.playerManager.resetForNewWorld(session);
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
    } & MiningCombatStats & Partial<CarryStats>
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
  /** The performance summary goes out every this many ticks (about once a second). */
  private static readonly PERF_REPORT_TICKS = MINING_CONFIG.SERVER_TICK_RATE;
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
    this.profiler.noteLoop();
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
    if (this.rules.timeLimited && this.elapsedTimeSeconds >= this.maxDurationSeconds) {
      this.handleSessionTimeout();
      return;
    }

    this.tickHadError = false;
    this.profiler.beginTick();
    this.runTickSteps(dt);
    this.runStep('deaths', () => this.processDeaths());
    this.profiler.endTick();

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
      this.profiler.time(name, step);
    } catch (err) {
      this.tickHadError = true;
      console.error(`[Mining] Room ${this.roomId} tick ${this.tickCount} step "${name}" failed:`, err);
    }
  }

  private runTickSteps(dt: number): void {
    // 1. Process physics, animations, FoW, and item pickups for all players
    this.runStep('players', () => this.playerManager.updatePlayerPhysicsAndFoW(dt));

    // 1.1 The extractor lands on the clock (nothing of it works before)
    this.runStep('extractor', () => {
      this.extractorSubsystem?.update();
      this.extractorSubsystem?.updateDeposits(dt);
    });

    // 1.2 The belt digs and lays its next segment once the extractor is down
    this.runStep('belt', () => this.beltSubsystem?.update(dt));

    // 1.5 Fluids push and brake loose bodies, then the rigid world steps
    this.runStep('fluidForces', () => this.fluidSubsystem.applyBodyForces());

    // 2. Step Planck rigid world
    this.runStep('rigidWorld', () => this.rigidWorld.step(dt));

    // 3. Update dropped items physics
    this.runStep('drops', () => this.dropSubsystem.updateDroppedItemsPhysics());

    // 4. Falling rocks simulation
    this.runStep('rocks', () => this.rockSubsystem.updateFallingRocks(dt));

    // 4.1 Falling stalactites and other ceiling doodads that lost their hold
    this.runStep('doodads', () => this.doodadSubsystem.falling.update(dt));

    // 4.5 Fluids flow (every Nth tick; the sandbox can pause, step and change the speed)
    const worldSteps = this.sandbox
      ? this.sandbox.clock.stepsForTick(this.tickCount % MINING_CONFIG.FLUID_STEP_TICKS === 0)
      : null;
    this.runStep('fluids', () => {
      if (worldSteps === null) this.fluidSubsystem.update();
      else for (let i = 0; i < worldSteps; i++) this.fluidSubsystem.step();
    });

    // 4.55 Gas drifts (same beat as fluids, right after them: fluid wins any cell they both want)
    this.runStep('gases', () => {
      if (worldSteps === null) this.gasSubsystem.update();
      else for (let i = 0; i < worldSteps; i++) this.gasSubsystem.step();
    });
    // 4.56 Explosive gas that has been set alight goes off, a few cells further each step
    this.runStep('gasExplosions', () => {
      if (worldSteps === null) this.gasExplosionSubsystem.update();
      else for (let i = 0; i < worldSteps; i++) this.gasExplosionSubsystem.step();
    });

    // 4.6 Fire takes new sparks, spreads and burns (same beat as fluids, right after them)
    this.runStep('fire', () => {
      if (worldSteps === null) this.fireSubsystem.update();
      else for (let i = 0; i < worldSteps; i++) this.fireSubsystem.step();
    });

    // 4.7 Fire hurts: burning and heat on everyone in the room
    this.runStep('burning', () => this.burningSubsystem.update(dt));

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

    // 9.4 Who just walked into or out of a gas cloud (for sounds)
    this.runStep('gasBodies', () => this.gasSubsystem.trackBodies());

    // 9.5 Who just waded into or out of a fluid (for splash sounds)
    this.runStep('fluidSplashes', () => this.fluidSubsystem.trackSplashes());

    // 9.6 Mission progress: how deep everyone is, and (a few times a second) how much fluid and gas is left
    this.runStep('missions', () => this.updateMission());

    // 10. Broadcast 30 Hz State Tick
    this.runStep('broadcast', () => this.broadcastStateTick());
  }

  private updateMission(): void {
    const tracker = this.missionTracker;
    if (!tracker) return;
    for (const session of this.players.values()) {
      const depth = Math.floor(session.playerBody.position.y - this.surfaceRow);
      if (depth > 0) tracker.onDepth(session.characterId, depth);
      this.missionNames.set(session.characterId, session.characterName ?? 'Miner');
    }
    if (this.tickCount % MiningGameEngine.MISSION_POLL_TICKS === 0) tracker.poll();
  }

  /** Ends the run of every player who died this tick (after the simulation steps, so it is safe). */
  private processDeaths(): void {
    if (this.pendingDeaths.length === 0) return;
    const dead = this.pendingDeaths;
    this.pendingDeaths = [];
    for (const characterId of dead) {
      const session = this.players.get(characterId);
      if (!session) continue;
      // Whatever they had on the belt never reached the extractor, however the run goes on from here
      this.beltSubsystem?.removeItemsOf(characterId);
      if (!this.rules.endsRunOnDeath) {
        this.playerManager.respawnPlayer(session);
        continue;
      }
      if (session.socket && session.socket.connected) {
        const ended: MiningSessionEndedEvent = {
          reason: 'death',
          title: 'You Were Knocked Out',
          message: 'You were knocked out in the mine. You have been returned to the surface and the contents of your backpack were lost.',
          mission: this.missionResultFor(characterId, 'failed', 'You were knocked out before you reached the exit.'),
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

  public bridgePlacementProblem(characterId: string, target: MiningPosition) {
    return this.blockSubsystem.bridgePlacementProblem(this.players.get(characterId), target);
  }

  public canPlaceBridge(characterId: string, target: MiningPosition): boolean {
    return this.blockSubsystem.validateBridgePlacement(this.players.get(characterId), target);
  }

  public placeBridge(characterId: string, target: MiningPosition): boolean {
    return this.blockSubsystem.placeBridge(this.players.get(characterId), target);
  }

  public canPlaceTorch(characterId: string, target: MiningPosition): boolean {
    return this.blockSubsystem.validateTorchPlacement(this.players.get(characterId), target);
  }

  /** Without a target, the ladder goes on the tile the player is standing in. */
  public placeLadder(characterId: string, target?: MiningPosition): boolean {
    return this.blockSubsystem.placeLadder(this.players.get(characterId), target);
  }

  public placeTorch(characterId: string, target: MiningPosition, itemId?: string): boolean {
    return this.blockSubsystem.placeTorch(this.players.get(characterId), target, itemId);
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
      get missions() {
        return engine.missionTracker;
      },
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
      get tick() {
        return engine.tickCount;
      },
      get surfaceRow() {
        return engine.surfaceRow;
      },
      get biomeField() {
        return engine.biomeField;
      },
      get spawnPoint() {
        return { x: MINING_CONFIG.ENTRANCE_X, y: engine.surfaceRow + MINING_CONFIG.ENTRANCE_Y };
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
      get fluids() {
        return engine.fluidSubsystem;
      },
      get gases() {
        return engine.gasSubsystem;
      },
      get extractor() {
        return engine.extractorSubsystem;
      },
      get burning() {
        return engine.burningSubsystem;
      },
      get belt() {
        return engine.beltSubsystem;
      },
      get gasExplosions() {
        return engine.gasExplosionSubsystem;
      },
      get fire() {
        return engine.fireSubsystem;
      },
      get doodads() {
        return engine.doodadSubsystem;
      },
      get ignition() {
        return engine.ignitionSubsystem;
      },
      get damage() {
        return engine.damageSystem;
      },
      pushTileUpdate: (update) => {
        engine.pendingRevealedTiles.push(update);
        engine.fluidSubsystem.onTileChanged(update.x, update.y);
        engine.gasSubsystem.onTileChanged(update.x, update.y);
        engine.doodadSubsystem.onTileChanged(update.x, update.y, update.type);
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

  public handleMobMining(mob: MiningActiveMobSession, target: MiningPosition): void {
    this.mobSubsystem.handleMobMining(mob, target);
  }

  public killMob(mob: MiningActiveMobSession): void {
    this.mobSubsystem.killMob(mob);
  }

  /** The biomes in this mine as the client needs them (look and light), sent once. Undefined when the mine is one biome. */
  public clientBiomes(): BiomeClientDefinition[] | undefined {
    const field = this.biomeField;
    if (!field?.hasBiomes) return undefined;
    return field.biomes.map((b, index) => ({ index, key: b.key, name: b.name, ambient: { ...(b.ambient ?? {}) } }));
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
        if (isInBounds(nx, ny, this.grid) && !this.grid[ny][nx].revealed) {
          this.grid[ny][nx].revealed = true;
          this.doodadSubsystem.onTileRevealed(nx, ny);
          const fluid = this.fluidSubsystem.contentsAt(nx, ny);
          const gas = this.gasSubsystem.wireContentsAt(nx, ny);
          this.pendingRevealedTiles.push({
            x: nx,
            y: ny,
            type: this.grid[ny][nx].type,
            damageStage: getDamageStage(this.grid[ny][nx]),
            ...(this.biomeGrid ? { biome: this.biomeGrid[ny * this.grid[0].length + nx] } : {}),
            ...(this.grid[ny][nx].piece ? { piece: this.grid[ny][nx].piece } : {}),
            ...(fluid ? { fluid } : {}),
            ...(gas ? { gas } : {}),
            ...(this.fireSubsystem.isBurning(nx, ny) ? { fire: 1 as const } : {}),
          });
        }
      }
    }
  }

  private broadcastStateTick(): void {
    const mobSessions = Array.from(this.activeMobs.values());
    const allDroppedItems = this.droppedItems.filter(
      (i): i is typeof i & { id: string } => typeof i.id === 'string'
    );
    const explosionsToSend = this.explosiveSubsystem.consumePendingExplosions();
    const gunshotsToSend = this.projectileSubsystem.consumePendingGunshots();
    const allBlockHits = this.blockSubsystem.consumePendingBlockHits();
    const dropsDirty = this.dropSubsystem.droppedItemsDirty;
    // Taken every tick even with nobody connected, so changes never pile up
    const fluidChanges = this.fluidSubsystem.takeVisibleChanges();
    const gasChanges = this.gasSubsystem.takeVisibleChanges();
    const gasExplosions = this.gasExplosionSubsystem.takeVisibleDetonations();
    const gasEventsToSend = this.gasSubsystem.takeEvents();
    const fireChanges = this.fireSubsystem.takeVisibleChanges();
    const splashesToSend = this.fluidSubsystem.takeSplashes();
    const pickupsToSend = this.dropSubsystem.takePickups();
    const extractorUpdate = this.extractorSubsystem?.takeUpdate();
    const beltUpdate = this.beltSubsystem?.takeUpdate();
    const beltItemChanges = this.beltSubsystem?.takeItemChanges();
    const doodadChanges = this.doodadSubsystem.takeChanges();
    const surfaceUpdate = this.surface.takeUpdate();
    const doodadsShattered = this.doodadSubsystem.falling.takeShattered();
    const missionDelta = this.missionTracker?.takeDelta() ?? undefined;

    // About once a second every player is also told what the server is spending on this room
    const sendPerf = this.tickCount % MiningGameEngine.PERF_REPORT_TICKS === 0;
    const perf = sendPerf ? this.profiler.snapshot(this.droppedTicks, this.perfCounts()) : undefined;
    let emitMs = 0;

    for (const session of this.players.values()) {
      if (!session.socket || !session.socket.connected) continue;

      // Interest management: this client is only told about what is near its player, and only
      // dynamic fields (static descriptions are sent once, in `spawned`; see MiningEntitySync)
      const center = session.playerBody.position;
      const known = session.known;
      const mobsNear = inView(center, mobSessions, (m) => m.mobBody.position, (m) => known.mobs.has(m.id));
      const projectilesNear = inView(center, this.activeProjectiles, (p) => p.position, (p) => known.projectiles.has(p.id));
      const dynamitesNear = inView(center, this.activeDynamites, (d) => d.position, (d) => known.dynamites.has(d.id));
      const dropsNear = inView(center, allDroppedItems, (i) => i.position, (i) => known.droppedItems.has(i.id));
      const rocksNear = inView(center, this.activeRocks, (r) => r.position);
      const others = inView(
        center,
        Array.from(this.players.values()).filter((p) => p.characterId !== session.characterId),
        (p) => p.playerBody.position,
        (p) => known.players.has(p.characterId)
      );
      const fallingDoodadsNear = inView(center, this.doodadSubsystem.falling.list, (f) => ({ x: f.state.x + f.state.width / 2, y: f.state.y + f.state.height / 2 }));
      const doodadsShatteredNear = doodadsShattered.filter((d) => isInInterest(center, { x: d[3], y: d[4] }));
      const fallingRockPayloads: MiningFallingRock[] = rocksNear.map((r) => ({
        id: r.id,
        position: { x: roundWire(r.position.x), y: roundWire(r.position.y) },
        velocity: { x: roundWire(r.velocity.x), y: roundWire(r.velocity.y) },
        angle: roundWire(r.angle),
        // Only a rock bigger than one cell says its size
        ...(r.cellsWide > 1 || r.cellsHigh > 1 ? { width: r.cellsWide, height: r.cellsHigh } : {}),
      }));
      const dynamitePayloads = dynamitesNear.map(dynamiteDynamic);
      const projectilePayloads = projectilesNear.map(projectileDynamic);
      const otherPlayers = others.map(playerDynamic);
      const explosionsNear = explosionsToSend.filter((e) => isInInterest(center, e.position));
      const gunshotsNear = gunshotsToSend.filter((g) => isInInterest(center, g.position));
      const splashesNear = splashesToSend.filter((s) => isInInterest(center, { x: s.x, y: s.y }));
      const pickupsNear = pickupsToSend.filter((e) => isInInterest(center, e));
      const gasEventsNear = gasEventsToSend.filter((e) => isInInterest(center, { x: e.x, y: e.y }));

      const spawned = collectSpawned(known, {
        mobs: mobsNear,
        projectiles: projectilesNear,
        dynamites: dynamitesNear,
        droppedItems: dropsNear,
        others,
      });

      // Where the items in view are: sent when one moved/appeared/left, or when the view moved over others
      const dropIds = dropsNear.map((i) => i.id);
      const sendDrops = dropsDirty || droppedListChanged(known, dropIds);
      const droppedItemsPayload = sendDrops ? dropsNear.map(droppedItemDynamic) : undefined;
      if (sendDrops) known.droppedItemsSent = new Set(dropIds);

      const blockHitsToSend = this.blockHitsFor(session, allBlockHits);

      const ammo = this.projectileSubsystem.getAmmoStatus(session);
      const ammoKey = ammo ? `${ammo.current}/${ammo.max}/${ammo.isReloading}` : null;
      const weaponAmmoPayload = ammo && ammoKey !== known.weaponAmmoSent ? ammo : null;
      known.weaponAmmoSent = ammoKey;

      const payload: MiningStateTickPayload = {
        tick: this.tickCount,
        position: { x: session.playerBody.position.x, y: session.playerBody.position.y },
        velocity: { x: session.playerBody.velocity.x, y: session.playerBody.velocity.y },
        ackSequence: session.inputs.sequence,
        ackAge: session.inputAge,
        bodyState: {
          isGrounded: session.playerBody.isGrounded,
          isOnLadder: session.playerBody.isOnLadder,
          knockbackRemaining: session.playerBody.knockbackRemaining,
        },
        isMining: session.isMining,
        ...(session.burning ? { burning: true } : {}),
        miningTarget: session.miningTarget ?? undefined,
        revealedTiles: this.pendingRevealedTiles.length > 0 ? this.pendingRevealedTiles : undefined,
        fluidCells: fluidChanges.length > 0 ? fluidChanges : undefined,
        ...(missionDelta ? { missionProgress: missionDelta } : {}),
        surface: surfaceUpdate,
        doodadsAdded: doodadChanges.added.length > 0 ? doodadChanges.added : undefined,
        doodadsRemoved: doodadChanges.removed.length > 0 ? doodadChanges.removed : undefined,
        doodadsHit: doodadChanges.hit.length > 0 ? doodadChanges.hit : undefined,
        doodadsKilled: doodadChanges.killed.length > 0 ? doodadChanges.killed : undefined,
        fallingDoodads: fallingDoodadsNear.length > 0 ? fallingDoodadsNear.map((f) => this.doodadSubsystem.falling.toWire(f)) : undefined,
        doodadsShattered: doodadsShatteredNear.length > 0 ? doodadsShatteredNear : undefined,
        gasCells: gasChanges.length > 0 ? gasChanges : undefined,
        gasExplosions: gasExplosions.length > 0 ? gasExplosions : undefined,
        gasEvents: gasEventsNear.length > 0 ? gasEventsNear : undefined,
        fireCells: fireChanges.length > 0 ? fireChanges : undefined,
        fluidSplashes: splashesNear.length > 0 ? splashesNear : undefined,
        itemPickups: pickupsNear.length > 0 ? pickupsNear : undefined,
        ...(extractorUpdate ? { extractor: extractorUpdate } : {}),
        ...(beltUpdate ? { belt: beltUpdate } : {}),
        ...(beltItemChanges ? { beltItems: beltItemChanges } : {}),
        fallingRocks: fallingRockPayloads.length > 0 ? fallingRockPayloads : undefined,
        activeDynamites: dynamitePayloads.length > 0 ? dynamitePayloads : undefined,
        activeProjectiles: projectilePayloads.length > 0 ? projectilePayloads : undefined,
        // Always sent (even when empty) so clients can tell "none" from "unchanged"
        mobs: mobsNear.map(mobDynamic),
        explosions: explosionsNear.length > 0 ? explosionsNear : undefined,
        gunshots: gunshotsNear.length > 0 ? gunshotsNear : undefined,
        blockHits: blockHitsToSend.length > 0 ? blockHitsToSend : undefined,
        otherPlayers,
        spawned,
        weaponAmmo: weaponAmmoPayload ?? undefined,
        droppedItems: droppedItemsPayload,
        temporaryBackpack: session.backpackDirty ? session.temporaryBackpack : undefined,
        ...(session.backpackDirty
          ? { backpackWeight: backpackWeight(session.temporaryBackpack, (id) => this.dataManager.getItemData(id)), backpackCapacity: session.carryCapacity }
          : {}),
        ...(session.backpackFullPending ? { backpackFull: true } : {}),
        ...(session.stashDirty ? { stash: session.stash } : {}),
      };

      if (sendPerf) payload.perf = perf;
      const emitStart = performance.now();
      session.socket.emit('mining_state_tick', payload);
      emitMs += performance.now() - emitStart;
      if (sendPerf) this.profiler.notePayloadBytes(JSON.stringify(payload).length);
      session.backpackDirty = false;
      session.backpackFullPending = false;
      session.stashDirty = false;
    }

    this.profiler.recordStep('broadcast (socket emit)', emitMs);
    this.dropSubsystem.droppedItemsDirty = false;
    this.pendingRevealedTiles = [];
  }

  /** What the server is simulating right now, for the performance report. */
  private perfCounts(): Record<string, number> {
    return {
      players: this.players.size,
      mobs: this.activeMobs.size,
      droppedItems: this.droppedItems.length,
      beltSegments: this.beltSubsystem?.rows ?? 0,
      beltItems: this.beltSubsystem?.items.length ?? 0,
      doodads: this.doodadSubsystem.count,
      fallingRocks: this.rockSubsystem.activeRocks.length,
      projectiles: this.projectileSubsystem.activeProjectiles.length,
      dynamites: this.explosiveSubsystem.activeDynamites.length,
      tilesChangedThisTick: this.pendingRevealedTiles.length,
      gridCells: this.grid.length * (this.grid[0]?.length ?? 0),
    };
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
          mission: this.missionResultFor(session.characterId, 'failed', 'The time limit ran out before you reached the exit.'),
        });
      }
    }

    // Rooms are keyed by roomId (solo rooms are `solo_<characterId>`), so always pass it.
    this.onTimeout?.(this.roomId);
  }
}
