import type { PieceOffset } from '../gameLogic/pieces';
import type { AutotileConfig } from '../gameLogic/autotile';
import type { GearSubType, ItemPhysicsConfig, DropTable, MobAtlas, ItemSoundEffectsConfig, MobSoundEffectsConfig, ItemLightConfig, HeldLightConfig, CharacterSoundEffectsConfig, FluidSoundEffectsConfig, ExtractorSoundEffectsConfig } from './index';
import type { ParticleEffect, ParticleEffectConfig } from './particles';
import type { Flammability, FluidAppearance } from './fluid';
import type { BiomeClientDefinition } from './biome';
import type { GasClientDefinition, GasEvent, GasExplosionCell, GasWireCell } from '../gameLogic/gas/gasWire';
import type { SkeletonManifest } from './modularRig';

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

/**
 * How many blocks make up one side of the original 64px tile: 1 is the original game, 2 and 3 are the smaller-block
 * experiments (tickets 085-090). Every distance, speed, radius and depth below is written as its original value times
 * this, so changing it rescales the whole game. The block data in the database must be rescaled to match
 * (`prisma/migrate-half-size-blocks.ts`).
 */
export const BLOCK_SCALE = 3;
const S = BLOCK_SCALE;

/** One block on screen, in pixels (the original 64px tile divided by the scale). */
export const MINING_TILE_PIXELS = Math.round(64 / BLOCK_SCALE);
const TILE_PX = MINING_TILE_PIXELS;

export const MINING_CONFIG = {
  /** Grid dimensions: 90x90 half-size blocks (the same area the old 45x45 grid covered; ticket 085) */
  GRID_WIDTH: 45 * S,
  GRID_HEIGHT: 45 * S,

  /** Entrance tile position (top-center of the grid) */
  ENTRANCE_X: 22 * S,
  ENTRANCE_Y: 0,

  /** Default vision range in tiles (cardinally adjacent) */
  DEFAULT_VISION_RANGE: 18 * S,
  /** How far (tiles) either side of the entrance, and above/below it, still counts as standing on the exit */
  ENTRANCE_EXIT_RADIUS: Math.ceil(S / 2),
  MAX_VISION_RANGE: 40 * S, // Hard cap on tiles of vision (Manhattan radius); bounds the reveal loop cost

  /** Stamina cost per block mined */
  MINING_STAMINA_COST: 1,

  /** Time in milliseconds to mine each tile type */
  DIRT_MINE_TIME_MS: 500,

  /** Melee hit box: pivot height above player center (shoulder), in tiles */
  MELEE_SHOULDER_OFFSET_Y: 0.35 * S,
  /** Melee hit box: distance from shoulder pivot to weapon center along aim, in tiles */
  MELEE_WEAPON_OFFSET: 0.7 * S,
  /** Melee hit box: half-width/height of the box around the weapon, in tiles */
  // Ranged weapons: server-side estimate of the barrel position (tiles from the shoulder along the aim)
  // Mob digging feedback: hit events are batched at this cadence (seconds) and only sent to players
  // within BLOCK_HIT_HEARING_RANGE tiles of the block (rough on-screen/earshot distance; tune as needed)
  EXPLOSION_DEFAULT_DAMAGE: 50, // blast damage at the centre when the explosive item has no Damage effect
  EXPLOSION_MIN_DAMAGE_FRACTION: 0.25, // fraction of that damage left at the very edge of the radius (linear falloff)
  EXPLOSION_KNOCKBACK_X: 8.0 * S, // push (tiles/s) away from the centre on anything the blast moves
  EXPLOSION_KNOCKBACK_Y: -6.0 * S,
  BACKPACK_FULL_NOTICE_COOLDOWN_SECONDS: 3.0, // minimum gap between "backpack full" notices while standing on items that don't fit
  TOOL_NOTICE_COOLDOWN_SECONDS: 3.0, // minimum gap between "your pickaxe is too weak"-style messages
  // Defaults for a mob whose data leaves a stat out (a mob's own value always wins)
  MOB_DEFAULT_MOVE_SPEED: 3.2 * S, // tiles/s
  MOB_DEFAULT_JUMP_FORCE: 8.8 * S,
  MOB_DEFAULT_CLIMB_SPEED: 3.0 * S, // tiles/s
  MOB_DEFAULT_AGGRO_RANGE: 20 * S, // tiles at which it notices a player
  MOB_DEFAULT_ATTACK_RANGE: 1.25 * S, // tiles
  MOB_DEFAULT_MINE_RANGE: 2.0 * S, // tiles
  MOB_PATHS_PER_TICK: 4, // most A* searches all mobs together may start in one tick (the rest wait a tick)
  MOB_ATTACK_WINDUP_SECONDS: 0.3, // default telegraph between a mob starting an attack and it landing (aiConfig.attackWindupMs overrides)
  MOB_ATTACK_DODGE_MARGIN: 0.75 * S, // tiles a target must get beyond the attack's start distance during wind-up to dodge it
  MOB_SEPARATION_SPEED: 4.0 * S, // tiles/s at which overlapping mobs/players are pushed apart (soft collision)
  MOB_HIT_STUN_MS: 250, // default time a mob loses control when hit (a mob's own hitStunMs overrides)
  MOB_STUN_IMMUNITY_MS: 500, // default time after a stun ends during which it can't be stunned again
  MAX_DROPPED_ITEMS: 1000, // hard safety limit per room (items never despawn); drops beyond it are skipped
  MOB_DEATH_LINGER_SECONDS: 1.0, // how long a killed mob stays (inert) so clients can play its death animation
  BLOCK_HIT_HEARING_RANGE: 14 * S,
  // Interest management: a client is only told about entities inside this box around its player
  // (more than the screen shows even on a wide monitor, and about as far as a sound carries).
  INTEREST_RADIUS_X: 28 * S, // tiles either side of the player
  INTEREST_RADIUS_Y: 20 * S, // tiles above/below
  INTEREST_HYSTERESIS: 6 * S, // extra tiles an entity already known to the client may drift out before it is dropped
  GUN_MUZZLE_REACH: 0.9 * S,
  // A client-reported muzzle is trusted only within this distance of the server estimate
  GUN_MUZZLE_MAX_DEVIATION: 1.0 * S,
  MELEE_HIT_HALF_SIZE: 0.55 * S,
  /** Extra tolerance so a mob's body (not just its center) can be struck, in tiles */
  MELEE_MOB_BODY_MARGIN: 0.3 * S,

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
  FLUID_BODY_DRAG: 6, // per second: how hard a fluid brakes a thrown or dropped body, scaled by viscosity and depth
  FLUID_SPLASH_ENTER_DEPTH: 0.3, // a body counts as in a fluid once this much of its height is under
  FLUID_SPLASH_EXIT_DEPTH: 0.1, // ...and as out once less than this is (the gap stops splash spam at the surface)
  FLUID_SPLASH_COOLDOWN_SECONDS: 0.4, // fewest seconds between splashes of the same body
  FLUID_MIN_FALL_FACTOR: 0.2, // fluid never slows a fall below this share of the normal top speed
  FLUID_STEP_TICKS: Math.max(1, Math.round(3 / S)), // the fluid simulation steps every Nth tick: 10 Hz for the original blocks, and faster for smaller ones so a pour crosses the same screen distance in the same time (every tick at 3x)
  GAS_STEP_TICKS: Math.max(1, Math.round(3 / S)), // the gas simulation steps every Nth tick (like the fluid)
  EXPLOSION_STEP_TICKS: 3, // a gas explosion's front moves every Nth tick (10 Hz); `frontSpeed` is the cells it moves in one such beat, so it is already in the current block size
  GAS_ENTER_CONCENTRATION: 0.3, // a body counts as in a gas cloud once the gas around it is this thick
  GAS_EXIT_CONCENTRATION: 0.1, // ...and as out once it is thinner than this (the gap stops sound spam at the edge of a cloud)
  GAS_EVENT_COOLDOWN_SECONDS: 0.5, // fewest seconds between enter/exit sounds of the same body
  GAS_VENT_EVENT_MIN_CONCENTRATION: 0.2, // gas thinner than this does not make a venting sound when the roof opens
  MAX_CATCHUP_TICKS: 5, // most steps run in one loop wake-up; any more lag is dropped instead of spiralling
  DEFAULT_PLAYER_MAX_HEALTH: 100,
  PLAYER_HIT_INVULNERABILITY: 0.5,
  PLAYER_HIT_KNOCKBACK_X: 5.0 * S,
  PLAYER_HIT_KNOCKBACK_Y: -4.0 * S,
  PLAYER_HIT_KNOCKBACK_SECONDS: 0.2, // movement input is ignored this long after being hit

  /** Approximate percentage of tiles that are rocks */
  ROCK_PERCENTAGE: 6,

  /** Continuous physics parameters */
  PLAYER_RADIUS: 12, // pixels: the character sprite's foot offset below the body centre
  PLAYER_COLLIDER_WIDTH_TILES: 40 / TILE_PX, // Fall & movement rectangle collider width in tiles (40px)
  PLAYER_COLLIDER_HEIGHT_TILES: 56 / TILE_PX, // Fall & movement rectangle collider height in tiles (56px)
  /** How tall the character is drawn, in tiles (a little taller than its collider, about 69px) */
  CHARACTER_HEIGHT_TILES: 69.12 / TILE_PX,
  /** How tall a mob is drawn relative to its collider height */
  MOB_DRAW_HEIGHT_FACTOR: 1.05,
  /** Height (tiles) a mob is drawn at when its data gives no collider height */
  MOB_DEFAULT_DRAW_COLLIDER_HEIGHT: 1.25 * S,
  PLAYER_MINING_REACH: 4, // Mining reach radius in blocks, from the player centre: about three blocks past the body, so three blocks fit in every direction (the third block down is ~3.85 from the centre)
  MOVE_SPEED: 4.5 * S, // Grid tiles per second
  GRAVITY: 28.0 * S, // Grid tiles per second squared (snappy natural 2D gravity)
  MAX_ENTITY_SPEED: 60.0 * S, // Hard cap on any body's speed per axis (tiles/s); keeps knockback/blasts sane
  MAX_STEP_UP_TILES: 1, // A grounded body walks up a ledge this high (tiles) without jumping; 0 turns it off
  MAX_STEP_DISPLACEMENT: 0.4, // A body never moves more than this in one collision step (tiles); smaller than any collider half-extent
  TERMINAL_FALL_SPEED: 20.0 * S, // Maximum downward velocity in tiles per second
  JUMP_FORCE: 8.5 * S, // Initial upward velocity for jumping (~1.3 tiles height)
  SIMULATION_TICK_RATE_HZ: 30,

  /** Lighting system configuration */
  SUNLIGHT_MAX_DEPTH: 8 * S, // tiles before sunlight fully fades
  SUNLIGHT_LATERAL_FALLOFF: Math.pow(0.6, 1 / S), // multiplier per lateral tile (gentle so overhang penumbras span ~6 tiles; the square root of the old 0.6 at double the cell count)
  FLASHLIGHT_RADIUS: 11.0 * S, // tiles (scaled with doubled vision range)
  FLASHLIGHT_CONE_ANGLE: 75, // degrees
  FLASHLIGHT_AURA_RADIUS: 3.2 * S, // small 360° aura so player is never blind behind (doubled from 1.6)
  TORCH_RADIUS: 3.8 * S, // tiles
  TORCH_FLICKER_SPEED: 4.0, // Hz
  TORCH_FLICKER_AMOUNT: 0.15, // intensity variation
  /** Extra reach (tiles) the server allows when placing, because the player's server position trails what they see while running (about 130 ms at MOVE_SPEED). */
  PLACEMENT_LAG_SLACK: 0.6 * S,
  TORCH_PLACEMENT_REACH: 1.85 * S, // max center-to-center tile reach distance (allows adjacent tiles regardless of player sub-tile position)

  CLIMB_SPEED: 3.5 * S, // Grid tiles per second while ascending or descending ladders
  LADDER_GRAB_WIDTH: 0.55 * S, // Horizontal distance in tiles from ladder center within which player grips ladder

  /** Max session duration before server automatically closes session (15 minutes) */
  MAX_SESSION_DURATION_SECONDS: 15 * 60,
} as const;

/** Whether (x, y) is standing on the mine's exit. `surfaceRow` is the first ground row (the sandbox has sky above it). */
export function isOnEntrance(x: number, y: number, surfaceRow: number = 0): boolean {
  const r = MINING_CONFIG.ENTRANCE_EXIT_RADIUS;
  return Math.abs(x - MINING_CONFIG.ENTRANCE_X) <= r && Math.abs(y - surfaceRow - MINING_CONFIG.ENTRANCE_Y) <= r;
}

// ---------------------------------------------------------------------------
// Tile Types
// ---------------------------------------------------------------------------

export const MiningTileType = {
  EMPTY: 0,
  DIRT: 1,
  ROCK: 2,
  LADDER: 6,
  TORCH: 7,
  COPPERIUM: 8,
  SILVERIUM: 9,
  BRIDGE: 10,
  LAVAROCK: 11,
  // Basic terrain (ticket 140): plain solid blocks that differ by hardness and look; biomes swap them in
  STONE: 12,
  CLAY: 13,
  SANDSTONE: 14,
  GRAVEL: 15,
  ICE: 16,
  BEDROCK: 17,
} as const;

export type MiningTileType = (typeof MiningTileType)[keyof typeof MiningTileType];

export type MiningBlockTypeKey = 'DIRT' | 'ROCK' | 'COPPERIUM' | 'SILVERIUM' | 'LAVAROCK' | 'STONE' | 'CLAY' | 'SANDSTONE' | 'GRAVEL' | 'ICE' | 'BEDROCK';

export interface MiningBlockConfig {
  id: string;
  typeKey: MiningBlockTypeKey;
  name: string;
  description?: string | null;
  textureUrl?: string | null;
  soundEffectUrl?: string | null;
  /** Volume of the mining sound, 0 to 1 (1 when absent). */
  soundEffectVolume?: number;
  health: number;
  mineTimeMs?: number;
  staminaCost: number;
  /** Pick power a tool needs to damage this block (0 = any tool). */
  requiredPickPower?: number;
  idleParticleEffectId?: string | null;
  idleParticleEffect?: ParticleEffect | null;
  /** How the block burns; null/absent means it does not. */
  flammability?: Flammability | null;
  /** Edge look overrides for this block (fields left out use the map's); null/absent: the map's look (ticket 094). */
  autotile?: AutotileConfig | null;
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
  /** Survives explosions, and shields what is behind it from the blast (bedrock-like) */
  isBlastProof?: boolean;
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
  // A placed bridge: solid from every side (walk on it, cannot pass up through it) and breaks in a hit or two
  [MiningTileType.BRIDGE]: {
    type: MiningTileType.BRIDGE,
    name: 'Bridge',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 20,
    defaultMineTimeMs: 200,
  },
  // Lava that water cooled (ticket 076): solid, hard and slow to mine, tougher than any ore
  [MiningTileType.LAVAROCK]: {
    type: MiningTileType.LAVAROCK,
    name: 'Lavarock',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 500,
    defaultMineTimeMs: 2500,
  },
  // Basic terrain (ticket 140). The database health is what the game uses; these are the fallbacks.
  [MiningTileType.STONE]: {
    type: MiningTileType.STONE,
    name: 'Stone',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 150,
    defaultMineTimeMs: 1500,
  },
  [MiningTileType.CLAY]: {
    type: MiningTileType.CLAY,
    name: 'Clay',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 25,
    defaultMineTimeMs: 250,
  },
  [MiningTileType.SANDSTONE]: {
    type: MiningTileType.SANDSTONE,
    name: 'Sandstone',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 60,
    defaultMineTimeMs: 600,
  },
  [MiningTileType.GRAVEL]: {
    type: MiningTileType.GRAVEL,
    name: 'Gravel',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 20,
    defaultMineTimeMs: 200,
  },
  [MiningTileType.ICE]: {
    type: MiningTileType.ICE,
    name: 'Ice',
    canBeDamaged: true,
    isMineable: true,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    health: 80,
    defaultMineTimeMs: 800,
  },
  // The unbreakable floor: cannot be damaged or mined, and survives (and stops) explosions
  [MiningTileType.BEDROCK]: {
    type: MiningTileType.BEDROCK,
    name: 'Bedrock',
    canBeDamaged: false,
    isMineable: false,
    isSolid: true,
    isClimbable: false,
    isTransparent: false,
    isBlastProof: true,
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

export function isTileBlastProof(type: MiningTileType): boolean {
  return getTileDefinition(type).isBlastProof === true;
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

/**
 * Whether a block whose middle is (dx, dy) from the player's centre is within mining reach. Reach is a circle, the same
 * one the debug overlay draws, so a block on the diagonal is no further away than one straight ahead.
 */
export function isWithinMiningReach(dx: number, dy: number, reach: number = MINING_CONFIG.PLAYER_MINING_REACH): boolean {
  return Math.hypot(dx, dy) <= reach;
}

/** Buildables (ladders, torches, bridges) can only go into empty space, never over a block, ore, chest, ladder or entrance. */
export function canPlaceBuildable(_buildableType: MiningTileType, targetType: MiningTileType): boolean {
  return targetType === MiningTileType.EMPTY;
}

/** Whether a body (centre `position`, half extents) overlaps tile cell (x, y). A body resting exactly against the cell does not count. */
export function bodyOverlapsCell(
  position: Vector2D,
  halfWidth: number,
  halfHeight: number,
  x: number,
  y: number
): boolean {
  const EDGE = 0.01;
  return (
    Math.abs(position.x - (x + 0.5)) < halfWidth + 0.5 - EDGE &&
    Math.abs(position.y - (y + 0.5)) < halfHeight + 0.5 - EDGE
  );
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
/** How a mining room is run: a private mine, the shared lobby, or the shared test sandbox. */
export type MiningGameMode = 'singleplayer' | 'multiplayer' | 'sandbox';

/** Speeds the sandbox can run the fluid and fire simulation at (1 = normal). */
export const SANDBOX_SIM_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

/** A mob the sandbox can spawn. */
export interface SandboxMobOption {
  id: string;
  name: string;
}

/** The sandbox settings that change while it runs. */
export interface SandboxStatus {
  /** The viewing player takes no damage. */
  godMode: boolean;
  /** The fluid and fire simulation is paused (it can still be single-stepped). */
  paused: boolean;
  /** Fluid and fire simulation speed (one of SANDBOX_SIM_SPEEDS). */
  speed: number;
}

/** What a sandbox client needs to build its tool panel (fluids come with the session's `fluids`). */
export interface SandboxClientInfo {
  mobs: SandboxMobOption[];
  /** The named extractor test scenes that can be loaded. */
  extractorScenes?: SandboxMobOption[];
  status: SandboxStatus;
}

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
  /** Set on a cell of a multi-cell piece (ladder, torch, bridge, rock): [column, row] inside the piece, from its top-left cell, plus its size when pieces of the type vary. */
  piece?: PieceOffset;
  /** Index of the cell's biome in the state's `biomes` list. Only sent for revealed cells, and only when the mine has biomes. */
  biome?: number;
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
 * The extractor as a client needs it, sent once with the run (the join state). Its changes after that are
 * `MiningExtractorUpdate`s in the tick. A client that joins late is told how long is left of the landing (usually none),
 * so it never replays an intro that already happened.
 */
export interface MiningExtractorClientState {
  id: string;
  key: string;
  name: string;
  /** `/assets/...` art, or null for the placeholder. */
  textureUrl: string | null;
  /** Top-left cell of the footprint and its size in cells. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** How long the landing intro takes, and how much of it is left now (0: already landed). */
  landingSeconds: number;
  landingRemaining: number;
  landingEffect?: ParticleEffectConfig | null;
  /** Landing and running sounds, resolved to urls, each with its own volume. */
  sounds?: ExtractorSoundEffectsConfig | null;
}

/** Why the belt is not growing right now (it carries on by itself when this clears, except at the bottom). */
export type BeltBlockedReason = 'fluid' | 'gas' | 'fire' | 'rock' | 'solid' | 'bottom';

/** The belt as a client draws it: a shaft of `rows` segments going down from the ground, `shaftWidth` cells wide. */
export interface MiningBeltClientState {
  shaftX: number;
  shaftWidth: number;
  /** The first row of the shaft (the ground row). */
  startRow: number;
  /** Segments laid so far; segment `i` is on row `startRow + i`. */
  rows: number;
  blockedBy: BeltBlockedReason | null;
  /** Damage stage of each segment: 0 whole to 4 nearly gone, -1 broken (a gap the belt rebuilds). Absent: all whole. */
  stages?: number[];
  /** How fast things ride the belt, in cells per second (the belt's stripes move at this speed). */
  beltSpeed: number;
  /** Art for one segment, or null for the placeholder. */
  textureUrl: string | null;
}

/** An item riding the belt. It moves up at the belt's speed, so only where it starts is sent. */
export interface MiningBeltItem {
  id: string;
  itemId: string;
  itemName: string;
  iconUrl: string | null;
  /** The player who loaded it (it goes to their stash when it arrives). */
  ownerId: string;
  /** Distance from the top of the belt (the extractor) in cells when it was sent; 0 is the top. */
  pos: number;
}

/** The belt's changes since the last tick (sent only on the tick it changes). */
export interface MiningBeltUpdate {
  rows: number;
  blockedBy: BeltBlockedReason | null;
  /** Damage stage of every segment, sent when any changes (see `MiningBeltClientState.stages`). */
  stages?: number[];
  /** Segments that broke since the last update (for the break sound and dust). */
  broke?: number[];
}

/** Items that went onto the belt and items that reached the top (or were lost), since the last tick. */
export interface MiningBeltItemsUpdate {
  added?: MiningBeltItem[];
  removed?: string[];
}

/** What changed about the extractor since the last tick (sent only on the tick it changes). */
export interface MiningExtractorUpdate {
  landed: boolean;
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
  /** Cells wide and high; omitted for a 1x1 rock. */
  width?: number;
  height?: number;
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
  shootsProjectiles?: boolean;
  throwable?: boolean;
  holdOffsetX?: number;
  holdOffsetY?: number;
  holdRotation?: number;
  muzzleOffsetX?: number;
  muzzleOffsetY?: number;
  /** Particle effect (by id) emitted from the layer while it is held, and where. */
  heldParticleEffectId?: string | null;
  heldParticleOffsetX?: number;
  heldParticleOffsetY?: number;
  /** Light given off while the layer is held. */
  heldLightConfig?: HeldLightConfig | null;
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
  /** On fire. Absent when not (it is only sent while true). */
  burning?: boolean;
}

/**
 * The full mining session state as seen by the client.
 * Sent on session start and after each state-changing action.
 */
export interface MiningSessionClientState {
  /** The visible grid (fog of war applied). */
  grid: MiningClientTile[][];
  /** How to draw each fluid in the mine, sent once. Missing means the mine has no fluids. */
  fluids?: { id: number; typeKey: string; name: string; color: string; opacity: number; viscosity: number; density: number; appearance?: FluidAppearance; flame?: { effect: ParticleEffectConfig | null; light: ItemLightConfig | null }; sounds?: FluidSoundEffectsConfig }[];
  /** Fluid in the cells already revealed, as [x, y, fluidId, level]; later changes arrive in each tick's `fluidCells`. */
  fluidCells?: [x: number, y: number, fluidId: number, level: number, falling?: number][];
  /** The mine's biomes (look and ambient light), sent once. Missing means the whole mine is one biome. Cells and revealed tiles carry an index into this list. */
  biomes?: BiomeClientDefinition[];
  /** How to draw each gas in the mine, sent once. Missing means the mine has no gases. */
  gases?: GasClientDefinition[];
  /** Gas in the cells already revealed, as [x, y, gasId, concentration]; later changes arrive in each tick's `gasCells`. */
  gasCells?: GasWireCell[];
  /** Cells already on fire in the revealed part of the mine, as [x, y, 1]; later changes arrive in each tick's `fireCells`. */
  fireCells?: [x: number, y: number, burning: 0 | 1][];
  /** The particle effect drawn on anything that is on fire (a player or a mob). Absent: none. */
  burningEffect?: ParticleEffectConfig | null;
  /** The map's default edge look for terrain blocks, sent once. Absent: the built-in default. */
  autotileStyle?: AutotileConfig | null;
  /** How burning blocks look, by tile type, for the block types that can burn. */
  blockFlames?: { tileType: number; flame: { effect: ParticleEffectConfig | null; light: ItemLightConfig | null } }[];
  /** Current player position on the grid. */
  position: MiningPosition;
  /** Items on the ground that can be picked up. */
  droppedItems: MiningDroppedItem[];
  /** Items collected during this mining session. */
  temporaryBackpack: MiningBackpackItem[];
  /** What this player has handed to the extractor so far (kept if they die). */
  stash?: MiningBackpackItem[];
  /** The belt going down from the extractor (absent in modes without one). */
  belt?: MiningBeltClientState;
  /** What is riding the belt right now. */
  beltItems?: MiningBeltItem[];
  /** The extractor standing on the surface (absent in modes without one). */
  extractor?: MiningExtractorClientState;
  /** Total weight of the backpack and the most it can hold (Carry Capacity effects). */
  backpackWeight?: number;
  backpackCapacity?: number;
  /** Current vision range (tiles in each cardinal direction). */
  visionRange: number;
  /** Whether the player is currently at the entrance and can extract. */
  canExtract: boolean;
  /** Whether the player is currently mining a block. */
  isMining: boolean;
  /** If mining, the target tile coordinates. */
  miningTarget?: MiningPosition;
  /** If mining, the total time required in ms. */
  miningTotal?: number;
  /** If mining, the server timestamp when mining started. */
  miningStartedAt?: number;
  /** Current game mode. */
  gameMode?: MiningGameMode;
  /** Row of the ground surface (0 in the normal mine; the sandbox has open sky rows above it). */
  surfaceRow?: number;
  /** Sandbox tool options and settings (sandbox rooms only). */
  sandbox?: SandboxClientInfo;
  /** Other players in the shared mining room (if multiplayer). An empty array means "none". */
  otherPlayers?: MiningRemotePlayer[];
  /** Active thrown dynamites in the cavern world. */
  activeDynamites?: MiningActiveDynamite[];
  /** Active mobs/NPCs in the mining cavern. An empty array means "none". */
  mobs?: MiningActiveMob[];
  /** The player character's sounds (hurt, jump...), resolved from the sound library. Sent once when the run starts. */
  characterSounds?: CharacterSoundEffectsConfig;
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
  /** The cell under the cursor. The server decides which block that means (see selectMiningTargets). */
  miningTarget?: MiningPosition | null;
  /** Ctrl held: mine only the block under the cursor instead of the next blocks along the line to it. */
  preciseMining?: boolean;
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
  /** Server tick the hit happened on (lets the client tell which position snapshots already include it). */
  tick: number;
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
  'id' | 'position' | 'velocity' | 'health' | 'isFacingLeft' | 'isMining' | 'miningTarget' | 'animationState' | 'burning'
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
  | 'burning'
>;

/** A dropped item as ticks carry it: where it is. Its description arrives once in `spawned`. */
export type MiningDroppedItemDynamic = Pick<MiningDroppedItem, 'position' | 'velocity'> & { id: string };

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
  droppedItems?: MiningDroppedItem[];
}

/** A body crossing the surface of a fluid: `fluidId` is the fluid's cell id (see `FluidClientDefinition`). */
export interface MiningFluidSplashEvent {
  kind: 'enter' | 'exit';
  fluidId: number;
  x: number;
  y: number;
}

/** A player picking up items from the ground, at where they stand (for the pickup sound). */
export interface MiningItemPickupEvent {
  x: number;
  y: number;
}

/** 30 Hz real-time simulation snapshot emitted by server to client. */
/** One simulation step's cost on the server over the profiler's window. */
export interface MiningServerPerfStep {
  name: string;
  avgMs: number;
  maxMs: number;
}

/**
 * How hard the server is working for this room, sent about once a second in the state tick (see MiningTickProfiler).
 * A tick must fit in `budgetMs` (1000 / tick rate) or the game falls behind.
 */
export interface MiningServerPerf {
  /** Ticks the numbers cover. */
  windowTicks: number;
  budgetMs: number;
  tickMs: { avg: number; p95: number; max: number };
  /** Average tick time as a share of the budget (100 = no headroom left). */
  loadPercent: number;
  /** Gap between loop wake-ups, which shows event-loop lag from other rooms or work. */
  loopGapMs: { avg: number; max: number };
  /** Steps ordered by average cost, most expensive first. */
  steps: MiningServerPerfStep[];
  /** Ticks dropped since the room started because the loop fell too far behind. */
  droppedTicks: number;
  /** Things the server is simulating right now. */
  counts: Record<string, number>;
  /** Size of the last sampled state tick for this player, in bytes of JSON. */
  payloadBytes: number;
}

export interface MiningStateTickPayload {
  tick: number;
  /** Server cost of the last second of ticks; sent about once a second. */
  perf?: MiningServerPerf;
  position: Vector2D;
  velocity: Vector2D;
  /**
   * Prediction ack for the receiving player: the `sequence` of the input that was in effect for this
   * tick, and how many server ticks (this one included) it had been in effect. With them the client
   * knows which of its own predicted steps `position` corresponds to (see PlayerPredictor).
   */
  ackSequence: number;
  ackAge: number;
  /** Body flags the client cannot derive from position/velocity alone (see PlayerPredictor). */
  bodyState: { isGrounded: boolean; isOnLadder: boolean; knockbackRemaining: number };
  isMining: boolean;
  /** The receiving player is on fire (only present while true). */
  burning?: boolean;
  miningTarget?: MiningPosition;
  miningProgress?: number;
  temporaryBackpack?: MiningBackpackItem[];
  /** What this player has handed to the extractor so far; sent whenever it changes. */
  stash?: MiningBackpackItem[];
  /** Items put on the belt or taken off it (arrived or lost). */
  beltItems?: MiningBeltItemsUpdate;
  /** The belt grew, or stopped or started (absent on ticks where nothing changed). */
  belt?: MiningBeltUpdate;
  /** The extractor's changes (it has landed). Absent on ticks where nothing changed. */
  extractor?: MiningExtractorUpdate;
  /** Sent with `temporaryBackpack` whenever it (or the capacity) changed. */
  backpackWeight?: number;
  backpackCapacity?: number;
  /** An item on the ground did not fit: show the "backpack full" notice and play its sound (throttled by the server). */
  backpackFull?: boolean;
  /** Where every dropped item is (dynamic fields only), sent only when one moved, appeared or vanished. */
  droppedItems?: MiningDroppedItemDynamic[];
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
  revealedTiles?: { x: number; y: number; type: MiningTileType; damageStage?: number; piece?: PieceOffset; biome?: number; fluid?: [fluidId: number, level: number, falling?: number]; gas?: [gasId: number, concentration: number]; fire?: 1 }[];
  /**
   * Fluid cells that changed this tick, as [x, y, fluidId, level]. Only cells the fog of war has revealed
   * are ever sent (a newly revealed tile carries its fluid in `revealedTiles`).
   */
  fluidCells?: [x: number, y: number, fluidId: number, level: number, falling?: number][];
  /**
   * Gas cells that changed this tick, as [x, y, gasId, concentration]. Only cells the fog of war has revealed
   * are ever sent (a newly revealed tile carries its gas in `revealedTiles`).
   */
  gasCells?: GasWireCell[];
  /** Cells of explosive gas that detonated this tick, as [x, y, gasId]. Only revealed cells are ever sent. */
  gasExplosions?: GasExplosionCell[];
  /** Gas sounds to play near the receiving player: bodies entering or leaving a cloud, gas set alight, gas starting to escape. */
  gasEvents?: GasEvent[];
  /** Players and mobs that waded into or climbed out of a fluid this tick, near the receiving player (for splash sounds). */
  fluidSplashes?: MiningFluidSplashEvent[];
  /** Players that picked up items this tick, near the receiving player (for pickup sounds). */
  itemPickups?: MiningItemPickupEvent[];
  /** Cells where fire started (1) or stopped (0) this tick, as [x, y, burning]. Only revealed cells are ever sent. */
  fireCells?: [x: number, y: number, burning: 0 | 1][];
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
  canMine?: boolean;
  mineRange?: number;
  maxJumpTiles?: number;
  patrolRadius?: number;
  fleeHealthThreshold?: number;
  /** Telegraph time before an attack lands, in ms (0 = instant). Defaults to MOB_ATTACK_WINDUP_SECONDS. */
  attackWindupMs?: number;
  /** The mob attacks the conveyor belt when it is within attack range of it and no player is. */
  attacksBelt?: boolean;
  /** Collider size in tiles (overrides the player-sized default). */
  colliderWidth?: number;
  colliderHeight?: number;
  spriteUrl?: string;
  showHealthBar?: boolean;
}

/** Waypoint in an A* navigation path across the mine grid. */
export interface MiningPathWaypoint {
  /** The body's footprint cell: its left column. (For a one-cell body, simply the cell.) */
  x: number;
  /** The body's footprint cell: its bottom row, the one the feet are in. */
  y: number;
  action: 'WALK' | 'JUMP' | 'CLIMB' | 'FALL' | 'MINE';
  /** For MINE: the solid cell of the footprint to dig out next (a body bigger than one cell has several to dig). */
  mineTarget?: { x: number; y: number };
}

/** State of an active mob within a mining cavern session. */
export interface MiningActiveMob {
  /** On fire. Absent when not (it is only sent while true). */
  burning?: boolean;
  id: string; // Instance ID e.g. "mob_123_1"
  mobId: string; // Database Mob ID
  name: string;
  position: Vector2D;
  velocity: Vector2D;
  health: number;
  maxHealth: number;
  defense: number;
  isFacingLeft: boolean;
  isMining: boolean;
  miningTarget?: MiningPosition | null;
  animationState: 'idle' | 'walk' | 'mine' | 'attack' | 'jump' | 'damage' | 'death';
  animations?: SkeletonManifest | MobAtlas | null;
  spriteUrl?: string;
  colliderWidth?: number;
  colliderHeight?: number;
  showHealthBar?: boolean;
  /** Playable sound slots (dig, idle, damage, attack, death); sent once with the mob's description. */
  sounds?: MobSoundEffectsConfig | null;
}

/**
 * Event emitted when an explosive item detonates in the cavern world.
 */
export interface MiningExplosionEvent {
  id: string;
  position: Vector2D;
  radius: number;
  soundUrl?: string | null;
  /** Volume of the explosion sound on the dynamite that detonated, 0 to 1. */
  soundVolume?: number;
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
  /** Volume of the gunshot sound on the weapon, 0 to 1. */
  soundVolume?: number;
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
  /** Fall damage (players): `(impactSpeed - minSpeed) * perSpeed`, capped at max (0 = no cap). Speeds are tiles/s. */
  fallDamageMinSpeed?: number;
  fallDamagePerSpeed?: number;
  fallDamageMax?: number;
  /** Falling rock damage (players): `(rock speed - minSpeed) * perSpeed`, capped at max (0 = no cap). Speeds are tiles/s. */
  rockDamageMinSpeed?: number;
  rockDamagePerSpeed?: number;
  rockDamageMax?: number;
  /** Fire (players and mobs): damage per second while burning, and how long burning lasts after the last touch of fire. */
  burnDamagePerSecond?: number;
  burnSeconds?: number;
  /** Heat: how far (tiles) a fire's heat reaches, and the damage per second at the fire itself for a material of heat 1. */
  heatRadius?: number;
  heatDamagePerSecond?: number;
  /** The ParticleEffect (by id) drawn on a burning player or mob. None: nothing drawn. */
  burningEffectId?: string | null;
  /** The default edge look of terrain blocks (a block's own `autotile` overrides it field by field). Absent: the built-in default. */
  autotileStyle?: AutotileConfig | null;
  /** Open-air rows above the ground in the generated mine (small blocks; see `DEFAULT_SKY_ROWS`). 0 = the ground is the top row. */
  skyRows?: number;
  /** How soft the borders between biomes are: 0 is a hard edge, bigger is a wider blend (see `DEFAULT_BIOME_BLEND_WIDTH`). */
  biomeBlendWidth?: number;
  /** Which biomes this map has and how strong each is on it (biome key -> weight). Null/empty: every biome at its own weight. */
  biomeWeights?: Record<string, number> | null;
  /** Hostile NPC / Mob Spawning */
  mobSpawnCount?: number;
  mobSpawnMinDepth?: number;
  allowedMobIds?: string[];
  /** Mob that stands on the surface as a target dummy; empty/absent means none. */
  surfaceDummyMobId?: string | null;
}

/** Sky above the ground in the generated mine: about one screen, 8 of the original blocks. */
export const DEFAULT_SKY_ROWS = 8 * BLOCK_SCALE;

export const DEFAULT_MINING_MAP_CONFIG: MiningMapConfigData = {
  gridWidth: MINING_CONFIG.GRID_WIDTH,
  gridHeight: MINING_CONFIG.GRID_HEIGHT,
  cavernDensity: 42,
  cavernIterations: 3,
  cavernMinDepth: 4 * S,
  tunnelCount: 5,
  tunnelMinLength: 15 * S,
  tunnelMaxLength: 30 * S,
  tunnelWidth: S,
  tunnelMinDepth: 2 * S,
  rockPercentage: MINING_CONFIG.ROCK_PERCENTAGE,
  copperiumPercentage: 4,
  silveriumPercentage: 2,
  silveriumMinDepth: 12 * S,
  oreClusterChance: 65,
  gravityEnabled: true,
  gravity: 28.0 * S,
  dynamiteBounciness: 0.45,
  dynamiteFriction: 0.4,
  dynamiteThrowPower: 14.0 * S,
  dynamiteFuseSeconds: 4.0,
  rockGravityScale: 1.2,
  rockRestitution: 0.1,
  // A normal jump lands at ~17 tiles/s and a 2 old-tile drop at ~21, so neither hurts (tiles are half the old size)
  fallDamageMinSpeed: 11 * S,
  fallDamagePerSpeed: 6 / S,
  fallDamageMax: 80,
  // A rock that has fallen ~1 tile is moving ~12 tiles/s; 6 tiles of fall is ~40 damage
  rockDamageMinSpeed: 6 * S,
  rockDamagePerSpeed: 5 / S,
  rockDamageMax: 80,
  // Burning for the default 5 s costs 30 health; oil (heat 3) hurts about 4.5 per second at its edge
  burnDamagePerSecond: 6,
  burnSeconds: 5,
  heatRadius: 2.5 * S,
  heatDamagePerSecond: 1.5,
  burningEffectId: null,
  autotileStyle: null,
  skyRows: DEFAULT_SKY_ROWS,
  biomeBlendWidth: 0.15,
  biomeWeights: null,
  mobSpawnCount: 3,
  mobSpawnMinDepth: 5 * S,
  // No built-in mobs: the active map config (database) says which mobs live in the mine
  allowedMobIds: [],
  surfaceDummyMobId: null,
};
