import { getRedisClient } from './redis.service';
import { prisma } from '../index';
import {
  MiningTileType,
  MINING_CONFIG,
  type MiningPosition,
  type MiningBackpackItem,
  type MiningDroppedItem,
  type MiningSessionClientState,
} from '@mine-me/shared';
import {
  generateMiningMap,
  revealTiles,
  toClientGrid,
  resolveGravity,
  type ServerMiningGrid,
  type ServerTile,
} from './miningMap.service';
import { InventoryService } from './inventory.service';

// ============================================================================
// Mining Session Service
//
// Manages the ephemeral mining session state in Redis. Each active session
// is stored as JSON under the key `mining:session:{characterId}`.
// ============================================================================

const SESSION_PREFIX = 'mining:session:';
const SESSION_TTL_SECONDS = 3600; // 1 hour auto-expiry as safety net

// ---------------------------------------------------------------------------
// Server-side Session Shape (stored in Redis)
// ---------------------------------------------------------------------------

export interface MiningSession {
  seed: number;
  characterId: string;
  cityId: string;
  grid: ServerMiningGrid;
  position: MiningPosition;
  temporaryBackpack: MiningBackpackItem[];
  droppedItems: MiningDroppedItem[];
  visionRange: number;
  /** Pending mining action — null when idle. */
  pendingAction: {
    type: 'MINING';
    target: MiningPosition;
    startTime: number;
    requiredTimeMs: number;
  } | null;
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Create a new mining session for a character.
 * Generates the map, stores in Redis, and returns the client-safe state.
 */
export async function createSession(
  characterId: string,
  cityId: string,
): Promise<MiningSessionClientState> {
  const redis = getRedisClient();


  // Generate seed and map
  const seed = Math.floor(Math.random() * 2147483647);
  const grid = generateMiningMap({ seed });

  const position: MiningPosition = {
    x: MINING_CONFIG.ENTRANCE_X,
    y: MINING_CONFIG.ENTRANCE_Y,
  };

  // Reveal tiles around starting position
  revealTiles(grid, position, MINING_CONFIG.DEFAULT_VISION_RANGE);

  const session: MiningSession = {
    seed,
    characterId,
    cityId,
    grid,
    position,
    temporaryBackpack: [],
    droppedItems: [],
    visionRange: MINING_CONFIG.DEFAULT_VISION_RANGE,
    pendingAction: null,
  };

  await redis.set(SESSION_PREFIX + characterId, JSON.stringify(session), {
    EX: SESSION_TTL_SECONDS,
  });

  return buildClientState(session);
}

/**
 * Retrieve a mining session from Redis.
 */
export async function getSession(characterId: string): Promise<MiningSession | null> {
  const redis = getRedisClient();
  const data = await redis.get(SESSION_PREFIX + characterId);
  if (!data) return null;
  return JSON.parse(data) as MiningSession;
}

/**
 * Persist an updated mining session to Redis.
 */
export async function updateSession(characterId: string, session: MiningSession): Promise<void> {
  const redis = getRedisClient();
  await redis.set(SESSION_PREFIX + characterId, JSON.stringify(session), {
    EX: SESSION_TTL_SECONDS,
  });
}

/**
 * Delete a mining session from Redis.
 */
export async function deleteSession(characterId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(SESSION_PREFIX + characterId);
}

// ---------------------------------------------------------------------------
// Game Logic
// ---------------------------------------------------------------------------

/**
 * Process player movement in a direction.
 * Returns updated client state and any side effects (items gained, damage).
 */
export async function processMove(
  session: MiningSession,
  targetX: number,
  targetY: number,
): Promise<{
  session: MiningSession;
  itemsGained: MiningBackpackItem[];
  damageTaken: number;
  message?: string;
}> {
  const tile = session.grid[targetY][targetX];
  let itemsGained: MiningBackpackItem[] = [];
  let damageTaken = 0;
  let message: string | undefined;

  // Can only move onto EMPTY, ENTRANCE, or tiles with dropped items
  if (tile.type !== MiningTileType.EMPTY && tile.type !== MiningTileType.ENTRANCE) {
    throw new Error('Cannot move to that tile — it is not empty.');
  }

  // Update position
  session.position = { x: targetX, y: targetY };

  // Reveal tiles around new position
  revealTiles(session.grid, session.position, session.visionRange);

  // Auto-pickup dropped items at this position
  const droppedHere = session.droppedItems.filter(
    d => d.position.x === targetX && d.position.y === targetY
  );
  if (droppedHere.length > 0) {
    for (const dropped of droppedHere) {
      // Add to temp backpack (stack if same item)
      const existing = session.temporaryBackpack.find(b => b.itemId === dropped.itemId);
      if (existing) {
        existing.quantity += dropped.quantity;
      } else {
        session.temporaryBackpack.push({
          itemId: dropped.itemId,
          itemName: dropped.itemName,
          iconUrl: dropped.iconUrl,
          quantity: dropped.quantity,
        });
      }
      itemsGained.push({
        itemId: dropped.itemId,
        itemName: dropped.itemName,
        iconUrl: dropped.iconUrl,
        quantity: dropped.quantity,
      });
    }
    // Remove picked-up items
    session.droppedItems = session.droppedItems.filter(
      d => !(d.position.x === targetX && d.position.y === targetY)
    );
  }

  // Resolve gravity — check if any rocks fall
  const gravityResult = resolveGravity(session.grid, session.position);
  if (gravityResult.playerCrushed) {
    damageTaken = MINING_CONFIG.ROCK_CRUSH_DAMAGE;
    message = 'A rock fell on you!';
  }

  // Re-reveal tiles after gravity changes (rocks may have moved into view)
  revealTiles(session.grid, session.position, session.visionRange);

  return { session, itemsGained, damageTaken, message };
}

/**
 * Start mining a block. Records the start timestamp.
 */
export function startMining(
  session: MiningSession,
  target: MiningPosition,
): { miningTimeMs: number } {
  const tile = session.grid[target.y][target.x];

  // Validate tile is minable
  if (tile.type === MiningTileType.EMPTY || tile.type === MiningTileType.ENTRANCE) {
    throw new Error('Nothing to mine at that position.');
  }

  // Validate adjacency to player
  const dx = Math.abs(target.x - session.position.x);
  const dy = Math.abs(target.y - session.position.y);
  if (dx + dy !== 1) {
    throw new Error('Target must be adjacent to the player.');
  }

  // Calculate mining time based on tile type
  let miningTimeMs: number;
  switch (tile.type) {
    case MiningTileType.DIRT:
      miningTimeMs = MINING_CONFIG.DIRT_MINE_TIME_MS;
      break;
    case MiningTileType.MINERAL:
      miningTimeMs = MINING_CONFIG.MINERAL_MINE_TIME_MS;
      break;
    case MiningTileType.CHEST:
      miningTimeMs = MINING_CONFIG.CHEST_MINE_TIME_MS;
      break;
    case MiningTileType.ROCK:
      throw new Error('Rocks cannot be mined by hand. Use dynamite!');
    default:
      throw new Error('Invalid tile type for mining.');
  }

  session.pendingAction = {
    type: 'MINING',
    target,
    startTime: Date.now(),
    requiredTimeMs: miningTimeMs,
  };

  return { miningTimeMs };
}

/**
 * Complete mining a block. Validates elapsed time, deducts stamina,
 * generates loot, and clears the tile.
 */
export async function completeMining(
  session: MiningSession,
): Promise<{
  session: MiningSession;
  itemsGained: MiningBackpackItem[];
  damageTaken: number;
  message?: string;
}> {
  if (!session.pendingAction || session.pendingAction.type !== 'MINING') {
    throw new Error('No mining action in progress.');
  }

  const { target, startTime, requiredTimeMs } = session.pendingAction;
  const elapsed = Date.now() - startTime;

  // Allow 200ms tolerance for network latency
  if (elapsed < requiredTimeMs - 200) {
    throw new Error(`Mining not complete. ${requiredTimeMs - elapsed}ms remaining.`);
  }

  const tile = session.grid[target.y][target.x];
  let itemsGained: MiningBackpackItem[] = [];
  let damageTaken = 0;
  let message: string | undefined;

  // Generate loot based on tile type
  if (tile.type === MiningTileType.MINERAL) {
    const mineralItem = await generateMineral(session.cityId);
    if (mineralItem) {
      session.temporaryBackpack.push(mineralItem);
      itemsGained.push(mineralItem);
    }
  } else if (tile.type === MiningTileType.CHEST) {
    const chestItems = await generateChestLoot(session.cityId);
    for (const item of chestItems) {
      const existing = session.temporaryBackpack.find(b => b.itemId === item.itemId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        session.temporaryBackpack.push(item);
      }
      itemsGained.push(item);
    }
    if (chestItems.length > 0) {
      message = 'You found a treasure chest!';
    }
  }

  // Clear the mined tile
  session.grid[target.y][target.x] = {
    type: MiningTileType.EMPTY,
    revealed: true,
  };

  // Clear pending action
  session.pendingAction = null;

  // Resolve gravity after clearing the tile
  const gravityResult = resolveGravity(session.grid, session.position);
  if (gravityResult.playerCrushed) {
    damageTaken = MINING_CONFIG.ROCK_CRUSH_DAMAGE;
    message = (message ? message + ' ' : '') + 'A rock fell on you!';
  }

  // Reveal newly exposed tiles
  revealTiles(session.grid, session.position, session.visionRange);

  return { session, itemsGained, damageTaken, message };
}

/**
 * Extract from the mine — transfer temp backpack to real inventory.
 */
export async function extractFromMine(
  characterId: string,
  session: MiningSession,
): Promise<MiningBackpackItem[]> {
  // Validate player is at entrance
  if (
    session.position.x !== MINING_CONFIG.ENTRANCE_X ||
    session.position.y !== MINING_CONFIG.ENTRANCE_Y
  ) {
    throw new Error('You must be at the mine entrance to extract.');
  }

  const extractedItems = [...session.temporaryBackpack];

  // Transfer each item to the real inventory
  for (const item of extractedItems) {
    await InventoryService.giveItemToCharacter(characterId, item.itemId, item.quantity);
  }

  // Delete the session
  await deleteSession(characterId);

  return extractedItems;
}

// ---------------------------------------------------------------------------
// Loot Generation
// ---------------------------------------------------------------------------

/**
 * Generate a random mineral item from the city's material list.
 * Only picks MINERAL-subtype items associated with the city.
 */
async function generateMineral(cityId: string): Promise<MiningBackpackItem | null> {
  const cityMaterials = await prisma.cityMaterial.findMany({
    where: { cityId },
    include: {
      item: true,
    },
  });

  // Filter to only mineral-subtype materials
  const minerals = cityMaterials.filter(cm => cm.item.subType === 'MINERAL');
  if (minerals.length === 0) return null;

  // Weighted random by rarity (rarer = less likely)
  const RARITY_WEIGHTS: Record<string, number> = {
    LOW: 50,
    MEDIUM: 25,
    RARE: 10,
    VERY_RARE: 3,
  };

  const totalWeight = minerals.reduce(
    (sum, cm) => sum + (RARITY_WEIGHTS[cm.item.rarity] ?? 50),
    0,
  );

  let roll = Math.random() * totalWeight;
  for (const cm of minerals) {
    const weight = RARITY_WEIGHTS[cm.item.rarity] ?? 50;
    roll -= weight;
    if (roll <= 0) {
      return {
        itemId: cm.item.id,
        itemName: cm.item.name,
        iconUrl: cm.item.iconUrl,
        quantity: 1,
      };
    }
  }

  // Fallback to first mineral
  const fallback = minerals[0].item;
  return {
    itemId: fallback.id,
    itemName: fallback.name,
    iconUrl: fallback.iconUrl,
    quantity: 1,
  };
}

/**
 * Generate loot from a treasure chest.
 * Picks 1-3 random materials from the city.
 */
async function generateChestLoot(cityId: string): Promise<MiningBackpackItem[]> {
  const cityMaterials = await prisma.cityMaterial.findMany({
    where: { cityId },
    include: { item: true },
  });

  if (cityMaterials.length === 0) return [];

  const itemCount = 1 + Math.floor(Math.random() * 3); // 1-3 items
  const items: MiningBackpackItem[] = [];

  for (let i = 0; i < itemCount; i++) {
    const cm = cityMaterials[Math.floor(Math.random() * cityMaterials.length)];
    const quantity = 1 + Math.floor(Math.random() * 3); // 1-3 quantity
    items.push({
      itemId: cm.item.id,
      itemName: cm.item.name,
      iconUrl: cm.item.iconUrl,
      quantity,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Client State Builder
// ---------------------------------------------------------------------------

/**
 * Build the client-safe state from the server session.
 */
export function buildClientState(session: MiningSession): MiningSessionClientState {
  return {
    grid: toClientGrid(session.grid),
    position: session.position,
    droppedItems: session.droppedItems,
    temporaryBackpack: session.temporaryBackpack,
    visionRange: session.visionRange,
    canExtract:
      session.position.x === MINING_CONFIG.ENTRANCE_X &&
      session.position.y === MINING_CONFIG.ENTRANCE_Y,
    isMining: session.pendingAction?.type === 'MINING',
    miningTarget: session.pendingAction?.target,
    miningTimeMs: session.pendingAction?.requiredTimeMs,
    miningStartedAt: session.pendingAction?.startTime,
  };
}
