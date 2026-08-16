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
  DEFAULT_VISION_RANGE: 3,

  /** Stamina cost per block mined */
  MINING_STAMINA_COST: 1,

  /** Time in milliseconds to mine each tile type */
  DIRT_MINE_TIME_MS: 500,
  MINERAL_MINE_TIME_MS: 1500,
  CHEST_MINE_TIME_MS: 1000,

  /** Damage taken when crushed by a falling rock */
  ROCK_CRUSH_DAMAGE: 50,

  /** Number of treasure chests per map */
  TREASURE_CHEST_COUNT: 4,

  /** Approximate percentage of tiles that are rocks */
  ROCK_PERCENTAGE: 12,

  /** Approximate percentage of tiles that are minerals */
  MINERAL_PERCENTAGE: 10,

  /** Continuous physics parameters */
  TILE_SIZE: 32,
  PLAYER_RADIUS: 12,
  PLAYER_COLLIDER_WIDTH: 20, // Fall & movement rectangle collider width in pixels (~0.625 tiles)
  PLAYER_COLLIDER_HEIGHT: 28, // Fall & movement rectangle collider height in pixels (~0.875 tiles)
  PLAYER_MINING_REACH: 1.15, // Mining interaction reach radius in tiles
  MOVE_SPEED: 4.5, // Grid tiles per second
  GRAVITY: 28.0, // Grid tiles per second squared (snappy natural 2D gravity)
  TERMINAL_FALL_SPEED: 20.0, // Maximum downward velocity in tiles per second
  JUMP_FORCE: 8.5, // Initial upward velocity for jumping (~1.3 tiles height)
  SIMULATION_TICK_RATE_HZ: 30,

  /** Lighting system configuration */
  SUNLIGHT_MAX_DEPTH: 8, // tiles before sunlight fully fades
  SUNLIGHT_LATERAL_FALLOFF: 0.4, // multiplier per lateral tile
  FLASHLIGHT_RADIUS: 5.5, // tiles
  FLASHLIGHT_CONE_ANGLE: 75, // degrees
  FLASHLIGHT_AURA_RADIUS: 1.6, // small 360° aura so player is never blind behind
  TORCH_RADIUS: 3.8, // tiles
  TORCH_FLICKER_SPEED: 4.0, // Hz
  TORCH_FLICKER_AMOUNT: 0.15, // intensity variation

  /** Max session duration before server automatically closes session (15 minutes) */
  MAX_SESSION_DURATION_SECONDS: 15 * 60,
} as const;

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
} as const;

export type MiningTileType = (typeof MiningTileType)[keyof typeof MiningTileType];


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
  position: MiningPosition;
  itemId: string;
  itemName: string;
  iconUrl: string | null;
  quantity: number;
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
  sequence: number;
}

/** 30 Hz real-time simulation snapshot emitted by server to client. */
export interface MiningStateTickPayload {
  tick: number;
  position: Vector2D;
  velocity: Vector2D;
  isMining: boolean;
  miningTarget?: MiningPosition;
  miningProgressMs?: number;
  temporaryBackpack: MiningBackpackItem[];
  droppedItems: MiningDroppedItem[];
  fallingRocks?: MiningFallingRock[];
  revealedTiles?: { x: number; y: number; type: MiningTileType; damageStage?: number }[];
}

