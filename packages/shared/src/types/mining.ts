import type { GearSubType, ItemPhysicsConfig, DropTable, ItemSoundEffectsConfig, ItemLightConfig } from './index';
import type { ParticleEffect } from './particles';

// ============================================================================
// Mining Mini-Game Types & Constants
//
// Shared types used by both the server and client for the 2D grid-based
// mining mini-game. The server holds the authoritative state; the client
// receives a fog-of-war-filtered view.
// ============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MINING_CONFIG = {
  /** Grid dimensions (45x45, 50% larger than 30x30) */
  GRID_WIDTH: 45,
  GRID_HEIGHT: 45,

  /** Entrance tile position (top-center of the grid) */
  ENTRANCE_X: 22,
  ENTRANCE_Y: 0,

  /** Default vision range in tiles (cardinally adjacent) */
  DEFAULT_VISION_RANGE: 6,
  MAX_VISION_RANGE: 20, // Hard cap on tiles of vision (Manhattan radius); bounds the reveal loop cost

  /** Stamina cost per block mined */
  MINING_STAMINA_COST: 1,

  /** Time in milliseconds to mine each tile type */
  DIRT_MINE_TIME_MS: 500,
  MINERAL_MINE_TIME_MS: 1500,
  CHEST_MINE_TIME_MS: 1000,

  /** Melee hit box: pivot height above player center (shoulder), in tiles */
  MELEE_SHOULDER_OFFSET_Y: 0.35,
  /** Melee hit box: distance from shoulder pivot to weapon center along aim, in tiles */
  MELEE_WEAPON_OFFSET: 0.7,
  /** Melee hit box: half-width/height of the box around the weapon, in tiles */
  // Ranged weapons: server-side estimate of the barrel position (tiles from the shoulder along the aim)
  // Mob digging feedback: hit events are batched at this cadence (seconds) and only sent to players
  // within BLOCK_HIT_HEARING_RANGE tiles of the block (rough on-screen/earshot distance; tune as needed)
  EXPLOSION_MOB_DAMAGE: 50, // flat damage dynamite deals to mobs in its radius (data-driven in ticket 025)
  TOOL_NOTICE_COOLDOWN_SECONDS: 3.0, // minimum gap between "your pickaxe is too weak"-style messages
  // Defaults for a mob whose data leaves a stat out (a mob's own value always wins)
  MOB_DEFAULT_MOVE_SPEED: 3.2, // tiles/s
  MOB_DEFAULT_JUMP_FORCE: 8.8,
  MOB_DEFAULT_MINING_SPEED: 80, // percent of base mining rate
  MOB_DEFAULT_AGGRO_RANGE: 20, // tiles at which it notices a player
  MOB_DEFAULT_ATTACK_RANGE: 1.25, // tiles
  MOB_DEFAULT_ATTACK_COOLDOWN_MS: 1200,
  MOB_DEFAULT_MINE_RANGE: 2.0, // tiles
  MOB_HIT_STUN_MS: 250, // default time a mob loses control when hit (a mob's own hitStunMs overrides)
  MOB_STUN_IMMUNITY_MS: 500, // default time after a stun ends during which it can't be stunned again
  MAX_DROPPED_ITEMS: 1000, // hard safety limit per room (items never despawn); drops beyond it are skipped
  MOB_DEATH_LINGER_SECONDS: 1.0, // how long a killed mob stays (inert) so clients can play its death animation
  MOB_DIG_HIT_INTERVAL: 0.4,
  BLOCK_HIT_HEARING_RANGE: 14,
  GUN_MUZZLE_REACH: 0.9,
  // A client-reported muzzle is trusted only within this distance of the server estimate
  GUN_MUZZLE_MAX_DEVIATION: 1.0,
  MELEE_HIT_HALF_SIZE: 0.55,
  /** Extra tolerance so a mob's body (not just its center) can be struck, in tiles */
  MELEE_MOB_BODY_MARGIN: 0.3,

  /** Number of damage crack progression stages before a tile is destroyed (1..4) */
  DAMAGE_STAGES: 4,

  /** Baseline pickaxe mining speed efficiency (25% = 25) */
  BASE_PICKAXE_MINING_SPEED: 25,

  /** Minimum animation swing speed (swings/second) to prevent sluggish motion */
  MIN_SWING_SPEED: 1.0,

  /** Maximum animation swing speed (swings/second) to maintain puppet visual clarity */
  MAX_SWING_SPEED: 5.0,

  /** Damage taken when crushed by a falling rock */
  ROCK_CRUSH_DAMAGE: 50,
  // Player hit reaction: grace period after taking damage, and the knockback impulse (tiles/s, away from the source)
  SERVER_TICK_RATE: 30, // simulation steps per second (fixed timestep)
  MAX_CATCHUP_TICKS: 5, // most steps run in one loop wake-up; any more lag is dropped instead of spiralling
  DEFAULT_PLAYER_MAX_HEALTH: 100,
  PLAYER_HIT_INVULNERABILITY: 0.5,
  PLAYER_HIT_KNOCKBACK_X: 5.0,
  PLAYER_HIT_KNOCKBACK_Y: -4.0,
  PLAYER_HIT_KNOCKBACK_SECONDS: 0.2, // movement input is ignored this long after being hit

  /** Number of treasure chests per map */
  TREASURE_CHEST_COUNT: 4,

  /** Approximate percentage of tiles that are rocks */
  ROCK_PERCENTAGE: 12,

  /** Approximate percentage of tiles that are minerals */
  MINERAL_PERCENTAGE: 10,

  /** Continuous physics parameters */
  TILE_SIZE: 32,
  TILE_WORLD_PIXELS: 64, // Client viewport & rigid world rendering tile size in pixels (64px)
  PLAYER_RADIUS: 12,
  PLAYER_COLLIDER_WIDTH: 20, // Fall & movement rectangle collider width in pixels (~0.625 tiles)
  PLAYER_COLLIDER_HEIGHT: 28, // Fall & movement rectangle collider height in pixels (~0.875 tiles)
  PLAYER_MINING_REACH: 1.85, // Mining interaction reach radius in tiles (allows adjacent tiles regardless of player sub-tile position)
  MOVE_SPEED: 4.5, // Grid tiles per second
  GRAVITY: 28.0, // Grid tiles per second squared (snappy natural 2D gravity)
  TERMINAL_FALL_SPEED: 20.0, // Maximum downward velocity in tiles per second
  JUMP_FORCE: 8.5, // Initial upward velocity for jumping (~1.3 tiles height)
  SIMULATION_TICK_RATE_HZ: 30,

  /** Lighting system configuration */
  SUNLIGHT_MAX_DEPTH: 8, // tiles before sunlight fully fades
  SUNLIGHT_LATERAL_FALLOFF: 0.4, // multiplier per lateral tile
  FLASHLIGHT_RADIUS: 11.0, // tiles (scaled with doubled vision range)
  FLASHLIGHT_CONE_ANGLE: 75, // degrees
  FLASHLIGHT_AURA_RADIUS: 3.2, // small 360° aura so player is never blind behind (doubled from 1.6)
  TORCH_RADIUS: 3.8, // tiles
  TORCH_FLICKER_SPEED: 4.0, // Hz
  TORCH_FLICKER_AMOUNT: 0.15, // intensity variation
  TORCH_PLACEMENT_REACH: 1.85, // max center-to-center tile reach distance (allows adjacent tiles regardless of player sub-tile position)

  CLIMB_SPEED: 3.5, // Grid tiles per second while ascending or descending ladders
  LADDER_GRAB_WIDTH: 0.55, // Horizontal distance in tiles from ladder center within which player grips ladder

  /** Max session duration before server automatically closes session (15 minutes) */
  MAX_SESSION_DURATION_SECONDS: 15 * 60,
} as const;

export const MINING_TILE_WORLD_PIXELS = 64;

// ---------------------------------------------------------------------------
// Tile Types
// ---------------------------------------------------------------------------

export const MiningTileType = {
  EMPTY: 0,
  DIRT: 1,
  ROCK: 2,
  MINERAL: 3,
  CHEST: 4,
  ENTRANCE: 5,
  LADDER: 6,
  TORCH: 7,
  COPPERIUM: 8,
  SILVERIUM: 9,
} as const;

export type MiningTileType = (typeof MiningTileType)[keyof typeof MiningTileType];

export type MiningBlockTypeKey = 'DIRT' | 'ROCK' | 'MINERAL' | 'CHEST' | 'ENTRANCE' | 'COPPERIUM' | 'SILVERIUM';

export interface MiningBlockConfig {
  id: string;
  typeKey: MiningBlockTypeKey;
  name: string;
  description?: string | null;
  textureUrl?: string | null;
  soundEffectUrl?: string | null;
  health: number;
  mineTimeMs?: number;
  staminaCost: number;
  /** Pick power a tool needs to damage this block (0 = any tool). */
  requiredPickPower?: number;
  idleParticleEffectId?: string | null;
  idleParticleEffect?: ParticleEffect | null;
  dropTable?: DropTable | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface MiningTileDefinition {
  type: MiningTileType;
  name: string;
  /** Whether the tile can take damage and display crack overlays */
  canBeDamaged: boolean;
  /** Whether the tile can be mined with a pickaxe */
  isMineable: boolean;
  /** Whether the tile is solid terrain that blocks movement and physics colliders */
  isSolid: boolean;
  /** Whether the player can climb on this tile (ladder physics) */
  isClimbable: boolean;
  /** Whether light (sunlight and ambient) passes through this tile */
  isTransparent: boolean;
  /** Default block health (HP) if not configured dynamically in database */
  health?: number;
  /** Default duration in ms (deprecated in favor of health) */
  defaultMineTimeMs?: number;
  /** Name of the particle effect to emit from this tile */
  particleEffect?: string;
}

export const MINING_TILE_DEFINITIONS: Record<MiningTileType, MiningTileDefinition> = {
  [MiningTileType.EMPTY]: {
    type: MiningTileType.EMPTY,
    name: 'Empty',
    canBeDamaged: false,
    isMineable: false,
    isSolid: false,
    isClimbable: false,
    isTransparent: true,
  },
  [MiningTileType.DIRT]: {
    type: MiningTileType.DIRT,
    name: 'Dirt',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 100,
    defaultMineTimeMs: MINING_CONFIG.DIRT_MINE_TIME_MS,
  },
  [MiningTileType.ROCK]: {
    type: MiningTileType.ROCK,
    name: 'Rock',
    canBeDamaged: false,
    isMineable: false,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
  },
  [MiningTileType.MINERAL]: {
    type: MiningTileType.MINERAL,
    name: 'Mineral',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 300,
    defaultMineTimeMs: MINING_CONFIG.MINERAL_MINE_TIME_MS,
  },
  [MiningTileType.CHEST]: {
    type: MiningTileType.CHEST,
    name: 'Chest',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 200,
    defaultMineTimeMs: MINING_CONFIG.CHEST_MINE_TIME_MS,
  },
  [MiningTileType.ENTRANCE]: {
    type: MiningTileType.ENTRANCE,
    name: 'Entrance',
    canBeDamaged: false,
    isMineable: false,
    isSolid: false,
    isClimbable: false,
    isTransparent: true,
  },
  [MiningTileType.LADDER]: {
    type: MiningTileType.LADDER,
    name: 'Ladder',
    canBeDamaged: false,
    isMineable: false,
    isSolid: false,
    isClimbable: true,
    isTransparent: true,
  },
  [MiningTileType.TORCH]: {
    type: MiningTileType.TORCH,
    name: 'Torch',
    canBeDamaged: false,
    isMineable: false,
    isSolid: false,
    isClimbable: false,
    isTransparent: true,
  },
  [MiningTileType.COPPERIUM]: {
    type: MiningTileType.COPPERIUM,
    name: 'Copperium',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 240,
    defaultMineTimeMs: 1200,
  },
  [MiningTileType.SILVERIUM]: {
    type: MiningTileType.SILVERIUM,
    name: 'Silverium',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 400,
    defaultMineTimeMs: 2000,
  },
};

export function getTileDefinition(type: MiningTileType): MiningTileDefinition {
  return MINING_TILE_DEFINITIONS[type] ?? MINING_TILE_DEFINITIONS[MiningTileType.EMPTY];
}

export function canTileBeDamaged(type: MiningTileType): boolean {
  return getTileDefinition(type).canBeDamaged;
}

export function isTileMineable(type: MiningTileType): boolean {
  return getTileDefinition(type).isMineable;
}

export function isTileSolid(type: MiningTileType): boolean {
  return getTileDefinition(type).isSolid;
}

export function isTileClimbable(type: MiningTileType): boolean {
  return getTileDefinition(type).isClimbable;
}

export function isTileTransparent(type: MiningTileType): boolean {
  return getTileDefinition(type).isTransparent;
}

/**
 * Dynamically resolves a tile's maximum health from active database block configurations,
 * falling back to the tile definition default if not yet loaded.
 */
export function getTileMaxHealth(
  type: MiningTileType,
  blockConfigs?: Map<MiningTileType, MiningBlockConfig> | Record<string, any>
): number {
  if (blockConfigs) {
    const config = blockConfigs instanceof Map ? blockConfigs.get(type) : blockConfigs[type];
    if (typeof config?.health === 'number' && config.health > 0) {
      return config.health;
    }
  }
  return getTileDefinition(type).health ?? 100;
}

export function getTileMineTime(
  type: MiningTileType,
  blockConfigs?: Map<MiningTileType, MiningBlockConfig> | Record<string, any>
): number {
  return getTileMaxHealth(type, blockConfigs);
}

export function getTileParticleEffect(
  type: MiningTileType,
  blockConfigs?: Map<MiningTileType, MiningBlockConfig> | Record<string, any>
): string | undefined {
  if (blockConfigs) {
    const config = blockConfigs instanceof Map ? blockConfigs.get(type) : blockConfigs[type];
    if (config?.idleParticleEffect?.name) {
      return config.idleParticleEffect.name;
    }
    if (config?.idleParticleEffectId) {
      return config.idleParticleEffectId;
    }
  }
  return getTileDefinition(type).particleEffect;
}

export function canPlaceBuildable(buildableType: MiningTileType, targetType: MiningTileType): boolean {
  if (targetType === MiningTileType.ENTRANCE) return false;
  if (targetType === buildableType) return false;
  return true;
}

/**
 * Defines the trigger mode for mouse actions, tools, and usable items.
 * - SINGLE: Triggers once per click (requires releasing and clicking again to re-trigger).
 * - HOLD: Triggers repeatedly / continuously as long as the mouse button is held down and conditions are met.
 */
export const MouseActionTriggerMode = {
  SINGLE: 'SINGLE',
  HOLD: 'HOLD',
} as const;

export type MouseActionTriggerMode = (typeof MouseActionTriggerMode)[keyof typeof MouseActionTriggerMode];


// ---------------------------------------------------------------------------
// Shared Data Structures
// ---------------------------------------------------------------------------

/** A position on the mining grid. */
export interface MiningPosition {
  x: number;
  y: number;
}

/** Movement direction for the mining grid. */
export type MiningDirection = 'up' | 'down' | 'left' | 'right';

/**
 * A single tile as seen by the client.
 * - `revealed` is false if the tile is hidden by fog of war.
 * - When `revealed` is false, `type` is always `DIRT` (to prevent leaking info).
 */
export interface MiningClientTile {
  type: MiningTileType;
  revealed: boolean;
  /** Crack damage stage (0 = undamaged, 1 = 25%, 2 = 50%, 3 = 75%, 4 = 90% cracked) */
  damageStage?: number;
}


/**
 * An item dropped on the ground (e.g. from dynamite explosions).
 * The player must walk over the tile to pick it up.
 */
export interface MiningDroppedItem {
  id?: string;
  position: MiningPosition;
  velocity?: Vector2D;
  itemId: string;
  itemName: string;
  iconUrl: string | null;
  inGameSpriteUrl?: string | null;
  quantity: number;
  physicsConfig?: ItemPhysicsConfig;
  particleEffectId?: string | null;
  lightConfig?: ItemLightConfig | null;
  inGameScale?: number;
}

/**
 * A single item in the temporary mining backpack.
 */
export interface MiningBackpackItem {
  itemId: string;
  itemName: string;
  iconUrl: string | null;
  quantity: number;
}

/**
 * A dynamic falling rock rendered in continuous space.
 */
export interface MiningFallingRock {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  angle?: number;
  angularVelocity?: number;
}

/**
 * A dynamic thrown dynamite stick with burning fuse rendered in continuous space.
 */
export interface MiningActiveDynamite {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  angle?: number;
  angularVelocity?: number;
  fuseRemainingSeconds: number;
  physicsConfig?: ItemPhysicsConfig;
  explosionRadius?: number;
  itemId?: string;
  soundEffects?: ItemSoundEffectsConfig | null;
  inGameScale?: number;
}

/**
 * An equipped gear layer to be attached to the character's skeletal sprite.
 */
export interface MiningGearLayer {
  url: string;
  subType: GearSubType;
}

/**
 * State of another player in the same mining session.
 */
export interface MiningRemotePlayer {
  characterId: string;
  characterName: string;
  position: Vector2D;
  velocity: Vector2D;
  isMining: boolean;
  miningTarget?: MiningPosition;
  isFacingLeft: boolean;
  aimDirection?: Vector2D;
  flashlightOn?: boolean;
  animationState: 'idle' | 'walk' | 'mine' | 'jump' | 'climb';
  gearLayers?: MiningGearLayer[];
}

/**
 * The full mining session state as seen by the client.
 * Sent on session start and after each state-changing action.
 */
export interface MiningSessionClientState {
  /** The visible grid (fog of war applied). */
  grid: MiningClientTile[][];
  /** Current player position on the grid. */
  position: MiningPosition;
  /** Items on the ground that can be picked up. */
  droppedItems: MiningDroppedItem[];
  /** Items collected during this mining session. */
  temporaryBackpack: MiningBackpackItem[];
  /** Current vision range (tiles in each cardinal direction). */
  visionRange: number;
  /** Whether the player is currently at the entrance and can extract. */
  canExtract: boolean;
  /** Whether the player is currently mining a block. */
  isMining: boolean;
  /** If mining, the target tile coordinates. */
  miningTarget?: MiningPosition;
  /** If mining, the total time required in ms. */
  miningTimeMs?: number;
  /** If mining, the server timestamp when mining started. */
  miningStartedAt?: number;
  /** Current game mode ('singleplayer' or 'multiplayer'). */
  gameMode?: 'singleplayer' | 'multiplayer';
  /** Other players in the shared mining room (if multiplayer). An empty array means "none". */
  otherPlayers?: MiningRemotePlayer[];
  /** Active thrown dynamites in the cavern world. */
  activeDynamites?: MiningActiveDynamite[];
  /** Active mobs/NPCs in the mining cavern. An empty array means "none". */
  mobs?: MiningActiveMob[];
}

/**
 * Result data specific to mining events, sent in GameEventResult.data.
 */
export interface MiningEventResultData {
  /** Updated session state after the action. */
  sessionState?: MiningSessionClientState;
  /** Items that were added to temp backpack this action (for notifications). */
  itemsGained?: MiningBackpackItem[];
  /** Damage taken this action (e.g. from falling rocks). */
  damageTaken?: number;
  /** Items transferred to real inventory on successful extraction. */
  extractedItems?: MiningBackpackItem[];
  /** Message to display to the player. */
  message?: string;
}

/** 2D Vector representation for continuous physics. */
export interface Vector2D {
  x: number;
  y: number;
}

/** Input state payload sent from client to server on input changes. */
export interface MiningInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  jump?: boolean;
  miningKey: boolean;
  miningTarget?: MiningPosition | null;
  aimDirection?: Vector2D;
  isFacingLeft?: boolean;
  flashlightOn?: boolean;
  sequence: number;
}

/** Emitted to a player when they take damage in the mine. */
export interface MiningPlayerDamagedEvent {
  damage: number;
  /** Health after the hit. */
  health: number;
  maxHealth: number;
  sourceId?: string;
  sourceName?: string;
  /** Impulse (tiles/s) the client should apply to its predicted body. */
  knockback: { x: number; y: number };
  knockbackSeconds: number;
  invulnerableSeconds: number;
}

/** A short message to the player about their tool or action (shown as a toast). */
export interface MiningNoticeEvent {
  kind: 'tool_too_weak';
  message: string;
}

/** Emitted when the server ends a player's run for a reason other than the time limit. */
export interface MiningSessionEndedEvent {
  reason: 'death';
  title: string;
  message: string;
}

/** Authoritative block hit event emitted when a block takes mining damage. */
export interface MiningBlockHitEvent {
  x: number;
  y: number;
  tileType: MiningTileType;
  damage?: number;
  /** Who dealt the hit. Absent means a player. Mob hits are only sent to nearby players. */
  source?: 'player' | 'mob';
}

/**
 * What changes every tick for an entity. The rest of its description (sprites, animations,
 * physics config, gear...) is static and arrives once, in `MiningStateTickPayload.spawned` or in the
 * session snapshot; clients merge the two (see the client's EntityDefinitionCache).
 */
export type MiningMobDynamic = Pick<
  MiningActiveMob,
  'id' | 'position' | 'velocity' | 'health' | 'isFacingLeft' | 'isMining' | 'miningTarget' | 'animationState'
>;

export type MiningRemotePlayerDynamic = Pick<
  MiningRemotePlayer,
  | 'characterId'
  | 'position'
  | 'velocity'
  | 'isMining'
  | 'miningTarget'
  | 'isFacingLeft'
  | 'aimDirection'
  | 'flashlightOn'
  | 'animationState'
>;

export type MiningProjectileDynamic = Pick<MiningActiveProjectile, 'id' | 'position' | 'velocity' | 'angle'>;

export type MiningDynamiteDynamic = Pick<
  MiningActiveDynamite,
  'id' | 'position' | 'velocity' | 'angle' | 'angularVelocity' | 'fuseRemainingSeconds'
>;

/** Full entity descriptions for entities a client has not seen yet (or whose static data changed). */
export interface MiningSpawnedEntities {
  mobs?: MiningActiveMob[];
  players?: MiningRemotePlayer[];
  projectiles?: MiningActiveProjectile[];
  dynamites?: MiningActiveDynamite[];
}

/** 30 Hz real-time simulation snapshot emitted by server to client. */
export interface MiningStateTickPayload {
  tick: number;
  position: Vector2D;
  velocity: Vector2D;
  isMining: boolean;
  miningTarget?: MiningPosition;
  miningProgressMs?: number;
  temporaryBackpack?: MiningBackpackItem[];
  droppedItems?: MiningDroppedItem[];
  fallingRocks?: MiningFallingRock[];
  /** Thrown dynamites in flight (dynamic fields only; definitions arrive once in `spawned`). */
  activeDynamites?: MiningDynamiteDynamic[];
  /** Projectiles actively simulated in flight (dynamic fields only; definitions arrive once in `spawned`). */
  activeProjectiles?: MiningProjectileDynamic[];
  /**
   * Full definitions (sprites, animations, physics config, gear...) of entities this client has not
   * been told about yet. Sent once per entity; later ticks only carry the dynamic fields.
   */
  spawned?: MiningSpawnedEntities;
  /** Gunshot muzzle flash and audio events triggered during this tick. */
  gunshots?: MiningGunshotEvent[];
  /** Explosions that detonated during this simulation tick. */
  explosions?: MiningExplosionEvent[];
  /** Block damage hit events (e.g. tool swing hits dealing damage) triggered during this tick. */
  blockHits?: MiningBlockHitEvent[];
  revealedTiles?: { x: number; y: number; type: MiningTileType; damageStage?: number }[];
  /** Other players in the shared room (dynamic fields only). An empty array means "none". */
  otherPlayers?: MiningRemotePlayerDynamic[];
  /** Active mobs and NPCs (dynamic fields only). An empty array means "none". */
  mobs?: MiningMobDynamic[];
  /** Current vision discovery range in tiles. */
  visionRange?: number;
  /** Authoritative weapon ammo and reload status for the character. */
  weaponAmmo?: {
    current: number;
    max: number;
    isReloading: boolean;
  };
}

/** Supported AI behaviors for mobs. */
export type MobAIType = 'CHASE_AND_MINE' | 'PATROL' | 'PASSIVE' | 'STATIONARY' | 'TUNNELER';

/** Configurable parameters for mob AI decisions. */
export interface MobAIConfig {
  aggroRange?: number;
  attackRange?: number;
  attackCooldownMs?: number;
  canMine?: boolean;
  mineRange?: number;
  maxJumpTiles?: number;
  patrolRadius?: number;
  fleeHealthThreshold?: number;
}

/** Waypoint in an A* navigation path across the mine grid. */
export interface MiningPathWaypoint {
  x: number;
  y: number;
  action: 'WALK' | 'JUMP' | 'CLIMB' | 'FALL' | 'MINE';
}

/** State of an active mob within a mining cavern session. */
export interface MiningActiveMob {
  id: string; // Instance ID e.g. "mob_123_1"
  mobId: string; // Database Mob ID
  name: string;
  position: Vector2D;
  velocity: Vector2D;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  isFacingLeft: boolean;
  isMining: boolean;
  miningTarget?: MiningPosition | null;
  animationState: 'idle' | 'walk' | 'mine' | 'attack' | 'jump' | 'damage' | 'death';
  animations?: any;
  spriteUrl?: string;
  colliderWidth?: number;
  colliderHeight?: number;
  showHealthBar?: boolean;
}

/**
 * Event emitted when an explosive item detonates in the cavern world.
 */
export interface MiningExplosionEvent {
  id: string;
  position: Vector2D;
  radius: number;
  soundUrl?: string | null;
}

/**
 * Real-time projectile entity flying through the cavern (e.g. revolver bullet).
 */
export interface MiningActiveProjectile {
  id: string;
  characterId?: string;
  itemId?: string;
  weaponItemId?: string;
  position: Vector2D;
  velocity: Vector2D;
  angle: number;
  speed?: number;
  damage?: number;
  spriteUrl?: string | null;
  spawnPosition?: Vector2D;
  distanceTraveled?: number;
  lifeTime?: number;
  hasHit?: boolean;
  impactTimer?: number;
  alpha?: number;
  inGameScale?: number;
}

/**
 * Event emitted when a projectile weapon fires in the cavern world.
 */
export interface MiningGunshotEvent {
  id: string;
  characterId: string;
  position: Vector2D;
  muzzlePosition?: Vector2D;
  target?: Vector2D;
  direction?: Vector2D;
  angle?: number;
  weaponItemId?: string;
  soundUrl?: string | null;
}

/**
 * Configuration parameters for procedural mining map generation.
 */
export interface MiningMapConfigData {
  id?: string;
  name?: string;
  gridWidth: number;
  gridHeight: number;
  cavernDensity: number;
  cavernIterations: number;
  cavernMinDepth: number;
  tunnelCount: number;
  tunnelMinLength: number;
  tunnelMaxLength: number;
  tunnelWidth: number;
  tunnelMinDepth: number;
  rockPercentage: number;
  mineralPercentage: number;
  chestCount: number;
  copperiumPercentage: number;
  silveriumPercentage: number;
  silveriumMinDepth: number;
  oreClusterChance: number;
  /** Physics & RigidBody Settings */
  gravityEnabled?: boolean;
  gravity?: number;
  dynamiteBounciness?: number;
  dynamiteFriction?: number;
  dynamiteThrowPower?: number;
  dynamiteFuseSeconds?: number;
  rockGravityScale?: number;
  rockRestitution?: number;
  /** Hostile NPC / Mob Spawning */
  mobSpawnCount?: number;
  mobSpawnMinDepth?: number;
  allowedMobIds?: string[];
  /** Mob that stands on the surface as a target dummy; empty/absent means none. */
  surfaceDummyMobId?: string | null;
}

export const DEFAULT_MINING_MAP_CONFIG: MiningMapConfigData = {
  gridWidth: MINING_CONFIG.GRID_WIDTH,
  gridHeight: MINING_CONFIG.GRID_HEIGHT,
  cavernDensity: 42,
  cavernIterations: 3,
  cavernMinDepth: 4,
  tunnelCount: 5,
  tunnelMinLength: 15,
  tunnelMaxLength: 30,
  tunnelWidth: 1,
  tunnelMinDepth: 2,
  rockPercentage: MINING_CONFIG.ROCK_PERCENTAGE,
  mineralPercentage: MINING_CONFIG.MINERAL_PERCENTAGE,
  chestCount: MINING_CONFIG.TREASURE_CHEST_COUNT,
  copperiumPercentage: 4,
  silveriumPercentage: 2,
  silveriumMinDepth: 12,
  oreClusterChance: 65,
  gravityEnabled: true,
  gravity: 28.0,
  dynamiteBounciness: 0.45,
  dynamiteFriction: 0.4,
  dynamiteThrowPower: 14.0,
  dynamiteFuseSeconds: 4.0,
  rockGravityScale: 1.2,
  rockRestitution: 0.1,
  mobSpawnCount: 3,
  mobSpawnMinDepth: 5,
  // No built-in mobs: the active map config (database) says which mobs live in the mine
  allowedMobIds: [],
  surfaceDummyMobId: null,
};
