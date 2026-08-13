import { MiningTileType, MINING_CONFIG } from '@mine-me/shared';

// ============================================================================
// Mining Map Generator
//
// Generates a seeded 30×30 mining grid. Uses a deterministic PRNG so maps
// can be reproduced from the same seed (useful for debugging and validation).
// ============================================================================

/**
 * A tile as stored on the server. Contains hidden information (e.g. what
 * mineral is inside) that is NOT sent to the client until excavated.
 */
export interface ServerTile {
  type: MiningTileType;
  /** Whether this tile has been revealed to the client via fog of war. */
  revealed: boolean;
  /** Accumulated damage in milliseconds. */
  damageMs?: number;
}

/**
 * Calculate damage stage (0-4) based on accumulated damage vs tile mining time.
 */
export function getDamageStage(tile: ServerTile): number {
  if (!tile.damageMs || tile.damageMs <= 0 || tile.type === MiningTileType.EMPTY || tile.type === MiningTileType.ENTRANCE) {
    return 0;
  }
  let totalTimeMs: number = MINING_CONFIG.DIRT_MINE_TIME_MS;
  if (tile.type === MiningTileType.MINERAL) totalTimeMs = MINING_CONFIG.MINERAL_MINE_TIME_MS;
  if (tile.type === MiningTileType.CHEST) totalTimeMs = MINING_CONFIG.CHEST_MINE_TIME_MS;
  if (tile.type === MiningTileType.ROCK) return 0;

  const ratio = tile.damageMs / totalTimeMs;
  if (ratio >= 0.9) return 4;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.5) return 2;
  if (ratio >= 0.25) return 1;
  return 0;
}


/** The full server-side grid. */
export type ServerMiningGrid = ServerTile[][];

// ---------------------------------------------------------------------------
// Seeded PRNG — Mulberry32
// ---------------------------------------------------------------------------

/**
 * Creates a seeded pseudo-random number generator using the mulberry32 algorithm.
 * Returns a function that produces a float in [0, 1) on each call.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Map Generator
// ---------------------------------------------------------------------------

export interface MapGeneratorOptions {
  seed: number;
  /** Number of mineral tiles to place. Defaults to MINING_CONFIG percentage. */
  mineralCount?: number;
  /** Number of rock tiles to place. Defaults to MINING_CONFIG percentage. */
  rockCount?: number;
  /** Number of treasure chests. Defaults to MINING_CONFIG.TREASURE_CHEST_COUNT. */
  chestCount?: number;
}

/**
 * Generate a 30×30 mining grid.
 *
 * Layout:
 * - Row 0 is the surface. ENTRANCE is placed at (ENTRANCE_X, 0).
 * - Rocks, minerals, and chests are scattered throughout the grid.
 * - Chests are placed in the lower half (y >= GRID_HEIGHT / 2).
 * - Row 0 around the entrance is cleared (EMPTY) so the player can start.
 */
export function generateMiningMap(options: MapGeneratorOptions): ServerMiningGrid {
  const {
    seed,
    chestCount = MINING_CONFIG.TREASURE_CHEST_COUNT,
  } = options;

  const { GRID_WIDTH, GRID_HEIGHT, ENTRANCE_X, ENTRANCE_Y, ROCK_PERCENTAGE, MINERAL_PERCENTAGE } = MINING_CONFIG;

  const rng = createSeededRng(seed);

  const totalTiles = GRID_WIDTH * GRID_HEIGHT;
  const rockTarget = options.rockCount ?? Math.floor((totalTiles * ROCK_PERCENTAGE) / 100);
  const mineralTarget = options.mineralCount ?? Math.floor((totalTiles * MINERAL_PERCENTAGE) / 100);

  // 1. Initialize grid with DIRT
  const grid: ServerMiningGrid = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: ServerTile[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      row.push({ type: MiningTileType.DIRT, revealed: false });
    }
    grid.push(row);
  }

  // 2. Place entrance
  grid[ENTRANCE_Y][ENTRANCE_X] = { type: MiningTileType.ENTRANCE, revealed: true };

  // Clear tiles around the entrance so the player can start moving
  // Make a small 3-wide opening at the top
  for (let dx = -1; dx <= 1; dx++) {
    const nx = ENTRANCE_X + dx;
    if (nx >= 0 && nx < GRID_WIDTH && grid[ENTRANCE_Y][nx].type !== MiningTileType.ENTRANCE) {
      grid[ENTRANCE_Y][nx] = { type: MiningTileType.EMPTY, revealed: true };
    }
  }
  // Also reveal the tile directly below entrance
  if (ENTRANCE_Y + 1 < GRID_HEIGHT) {
    grid[ENTRANCE_Y + 1][ENTRANCE_X].revealed = true;
  }

  // 3. Collect eligible positions (skip row 0 — that's the surface)
  const eligiblePositions: MiningPosition[] = [];
  for (let y = 1; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      eligiblePositions.push({ x, y });
    }
  }

  // Shuffle using Fisher-Yates
  for (let i = eligiblePositions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligiblePositions[i], eligiblePositions[j]] = [eligiblePositions[j], eligiblePositions[i]];
  }

  let posIndex = 0;

  // 4. Place rocks
  let rocksPlaced = 0;
  while (rocksPlaced < rockTarget && posIndex < eligiblePositions.length) {
    const pos = eligiblePositions[posIndex++];

    // Don't place rocks directly below the entrance or on row 1 center
    // to ensure the player can always start moving
    if (pos.y === 1 && Math.abs(pos.x - ENTRANCE_X) <= 1) continue;

    grid[pos.y][pos.x] = { type: MiningTileType.ROCK, revealed: false };
    rocksPlaced++;
  }

  // 5. Place minerals
  let mineralsPlaced = 0;
  while (mineralsPlaced < mineralTarget && posIndex < eligiblePositions.length) {
    const pos = eligiblePositions[posIndex++];
    if (grid[pos.y][pos.x].type !== MiningTileType.DIRT) continue;

    grid[pos.y][pos.x] = { type: MiningTileType.MINERAL, revealed: false };
    mineralsPlaced++;
  }

  // 6. Place treasure chests (lower half only, y >= GRID_HEIGHT / 2)
  const lowerHalfPositions = eligiblePositions
    .slice(posIndex)
    .filter(p => p.y >= Math.floor(GRID_HEIGHT / 2) && grid[p.y][p.x].type === MiningTileType.DIRT);

  // Shuffle again for randomness
  for (let i = lowerHalfPositions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lowerHalfPositions[i], lowerHalfPositions[j]] = [lowerHalfPositions[j], lowerHalfPositions[i]];
  }

  for (let i = 0; i < Math.min(chestCount, lowerHalfPositions.length); i++) {
    const pos = lowerHalfPositions[i];
    grid[pos.y][pos.x] = { type: MiningTileType.CHEST, revealed: false };
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MiningPosition {
  x: number;
  y: number;
}

/**
 * Check if a position is within grid bounds.
 */
export function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < MINING_CONFIG.GRID_WIDTH && y >= 0 && y < MINING_CONFIG.GRID_HEIGHT;
}

/**
 * Get the target position from a direction.
 */
export function getTargetPosition(
  position: MiningPosition,
  direction: 'up' | 'down' | 'left' | 'right'
): MiningPosition {
  switch (direction) {
    case 'up': return { x: position.x, y: position.y - 1 };
    case 'down': return { x: position.x, y: position.y + 1 };
    case 'left': return { x: position.x - 1, y: position.y };
    case 'right': return { x: position.x + 1, y: position.y };
  }
}

export interface GravityMove {
  from: MiningPosition;
  to: MiningPosition;
}

/**
 * Resolve gravity for falling rocks after a tile is cleared.
 * Rocks fall instantly until they hit a solid block or the grid floor.
 *
 * Returns the list of positions where rocks landed, the specific moves, and whether
 * the player was crushed (if a rock landed on the player position).
 */
export function resolveGravity(
  grid: ServerMiningGrid,
  playerPosition: MiningPosition,
): { moves: GravityMove[]; rocksLanded: MiningPosition[]; playerCrushed: boolean } {
  const moves: GravityMove[] = [];
  const rocksLanded: MiningPosition[] = [];
  let playerCrushed = false;

  // Scan columns bottom-to-top so we process falls correctly
  for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
    // We iterate top-to-bottom to find rocks that should fall
    for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT - 1; y++) {
      if (grid[y][x].type !== MiningTileType.ROCK) continue;

      // Check if tile below is empty
      const belowY = y + 1;
      if (grid[belowY][x].type !== MiningTileType.EMPTY &&
          grid[belowY][x].type !== MiningTileType.ENTRANCE) continue;

      // Rock needs to fall — find final resting position
      let finalY = belowY;
      while (finalY + 1 < MINING_CONFIG.GRID_HEIGHT) {
        const nextBelow = grid[finalY + 1][x];
        if (nextBelow.type === MiningTileType.EMPTY || nextBelow.type === MiningTileType.ENTRANCE) {
          finalY++;
        } else {
          break;
        }
      }

      // Move rock from (x, y) to (x, finalY)
      grid[y][x] = { type: MiningTileType.EMPTY, revealed: grid[y][x].revealed };
      grid[finalY][x] = { type: MiningTileType.ROCK, revealed: grid[finalY][x].revealed };
      moves.push({ from: { x, y }, to: { x, y: finalY } });
      rocksLanded.push({ x, y: finalY });

      // Check if rock landed on player
      if (playerPosition.x === x && playerPosition.y === finalY) {
        playerCrushed = true;
      }
    }
  }

  return { moves, rocksLanded, playerCrushed };
}


/**
 * Apply fog of war — reveal tiles within vision range of the given position.
 * Uses Manhattan distance (cardinal directions only).
 */
export function revealTiles(grid: ServerMiningGrid, position: MiningPosition, visionRange: number): void {
  for (let dy = -visionRange; dy <= visionRange; dy++) {
    for (let dx = -visionRange; dx <= visionRange; dx++) {
      // Manhattan distance check
      if (Math.abs(dx) + Math.abs(dy) > visionRange) continue;

      const nx = position.x + dx;
      const ny = position.y + dy;

      if (isInBounds(nx, ny)) {
        grid[ny][nx].revealed = true;
      }
    }
  }
}

/**
 * Convert server grid to client-safe grid (hide unrevealed tile types).
 */
export function toClientGrid(grid: ServerMiningGrid): import('@mine-me/shared').MiningClientTile[][] {
  return grid.map(row =>
    row.map(tile => ({
      type: tile.revealed ? tile.type : MiningTileType.DIRT,
      revealed: tile.revealed,
      damageStage: tile.revealed ? getDamageStage(tile) : 0,
    }))
  );
}

