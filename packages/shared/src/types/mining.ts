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
  /** Grid dimensions */
  GRID_WIDTH: 30,
  GRID_HEIGHT: 30,

  /** Entrance tile position (top-center of the grid) */
  ENTRANCE_X: 15,
  ENTRANCE_Y: 0,

  /** Default vision range in tiles (cardinally adjacent) */
  DEFAULT_VISION_RANGE: 1,

  /** Stamina cost per block mined */
  MINING_STAMINA_COST: 1,

  /** Time in milliseconds to mine each tile type */
  DIRT_MINE_TIME_MS: 500,
  MINERAL_MINE_TIME_MS: 1500,
  CHEST_MINE_TIME_MS: 1000,

  /** Damage taken when crushed by a falling rock */
  ROCK_CRUSH_DAMAGE: 50,

  /** Number of treasure chests per map */
  TREASURE_CHEST_COUNT: 2,

  /** Approximate percentage of tiles that are rocks */
  ROCK_PERCENTAGE: 12,

  /** Approximate percentage of tiles that are minerals */
  MINERAL_PERCENTAGE: 10,
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
