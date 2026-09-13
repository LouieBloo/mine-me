import {
  MiningTileType,
  MINING_CONFIG,
  canTileBeDamaged,
  getTileMineTime,
  isTileSolid,
  DEFAULT_MINING_MAP_CONFIG,
  type MiningMapConfigData,
} from '@mine-me/shared';

// ============================================================================
// Mining Map Generator
//
// Generates a seeded 45×45 mining grid with procedural caverns, tunnels,
// mineral veins, and structural rock formations. Uses a deterministic PRNG so
// maps can be reproduced identically from the same seed.
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
  if (!tile.damageMs || tile.damageMs <= 0 || !canTileBeDamaged(tile.type)) {
    return 0;
  }
  const totalTimeMs = getTileMineTime(tile.type);

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
// Map Generator Pipeline
// ---------------------------------------------------------------------------

export interface MapGeneratorOptions {
  seed: number;
  config?: Partial<MiningMapConfigData>;
  /** Number of mineral tiles to place. Overrides config percentage if provided. */
  mineralCount?: number;
  /** Number of rock tiles to place. Overrides config percentage if provided. */
  rockCount?: number;
  /** Number of treasure chests. Overrides config count if provided. */
  chestCount?: number;
}

export class MiningMapGenerator {
  private rng: () => number;
  private config: MiningMapConfigData;
  private width: number;
  private height: number;
  private grid: ServerMiningGrid = [];

  constructor(options: MapGeneratorOptions) {
    this.rng = createSeededRng(options.seed);
    this.config = {
      ...DEFAULT_MINING_MAP_CONFIG,
      ...options.config,
    };
    if (options.chestCount !== undefined) {
      this.config.chestCount = options.chestCount;
    }
    this.width = this.config.gridWidth;
    this.height = this.config.gridHeight;
  }

  public generate(): ServerMiningGrid {
    this.initializeSolidGrid();
    this.carveCaverns();
    this.carveTunnels();
    this.protectSurfaceAndSpawn();
    this.placeOreVeins();
    this.placeRocks();
    this.placeChests();
    return this.grid;
  }

  private initializeSolidGrid(): void {
    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      const row: ServerTile[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push({ type: MiningTileType.DIRT, revealed: false });
      }
      this.grid.push(row);
    }
  }

  private carveCaverns(): void {
    if (this.config.cavernDensity <= 0) return;

    const minDepth = Math.max(1, this.config.cavernMinDepth);
    let openMap: boolean[][] = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => false)
    );

    const baseDensity = Math.min(100, Math.max(0, this.config.cavernDensity)) / 100;
    // Map cavernDensity [0, 1] to cellular automata seed probability [0.38, 0.58]
    const initialOpenProb = 0.38 + baseDensity * 0.20;

    for (let y = minDepth; y < this.height; y++) {
      const depthProgress = (y - minDepth) / Math.max(1, this.height - minDepth);
      const depthScale = 0.85 + 0.15 * depthProgress;
      const cellThreshold = initialOpenProb * depthScale;

      for (let x = 0; x < this.width; x++) {
        openMap[y][x] = this.rng() < cellThreshold;
      }
    }

    // Cellular automata smoothing iterations (classic 4-5 rule)
    const iterations = Math.max(1, Math.min(6, this.config.cavernIterations));
    for (let it = 0; it < iterations; it++) {
      const nextOpenMap: boolean[][] = Array.from({ length: this.height }, () =>
        Array.from({ length: this.width }, () => false)
      );

      for (let y = minDepth; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          let solidNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= this.width || ny < minDepth || ny >= this.height) {
                solidNeighbors++;
              } else if (!openMap[ny][nx]) {
                solidNeighbors++;
              }
            }
          }

          // Classic 4-5 rule:
          // If solid neighbors >= 5 -> become solid
          // If solid neighbors <= 3 -> become open
          // If solid neighbors == 4 -> preserve current state
          if (solidNeighbors >= 5) {
            nextOpenMap[y][x] = false;
          } else if (solidNeighbors <= 3) {
            nextOpenMap[y][x] = true;
          } else {
            nextOpenMap[y][x] = openMap[y][x];
          }
        }
      }
      openMap = nextOpenMap;
    }

    // Apply carved caverns to grid
    for (let y = minDepth; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (openMap[y][x]) {
          this.grid[y][x] = { type: MiningTileType.EMPTY, revealed: false };
        }
      }
    }
  }

  private carveTunnels(): void {
    if (this.config.tunnelCount <= 0) return;

    const minDepth = Math.max(1, this.config.tunnelMinDepth);
    const wormCount = this.config.tunnelCount;
    const minLength = Math.max(5, this.config.tunnelMinLength);
    const maxLength = Math.max(minLength, this.config.tunnelMaxLength);
    const tunnelWidth = Math.max(1, Math.min(2, this.config.tunnelWidth));

    for (let i = 0; i < wormCount; i++) {
      let curX = Math.floor(this.rng() * (this.width - 4)) + 2;
      let curY = Math.floor(this.rng() * (this.height - minDepth - 2)) + minDepth;
      const steps = Math.floor(this.rng() * (maxLength - minLength + 1)) + minLength;

      let dx = this.rng() > 0.5 ? 1 : -1;
      let dy = this.rng() > 0.4 ? 1 : 0;

      for (let step = 0; step < steps; step++) {
        if (curY >= 1 && curY < this.height && curX >= 0 && curX < this.width) {
          this.grid[curY][curX] = { type: MiningTileType.EMPTY, revealed: false };
          if (tunnelWidth > 1 && curX + 1 < this.width) {
            this.grid[curY][curX + 1] = { type: MiningTileType.EMPTY, revealed: false };
          }
        }

        // Steer direction occasionally
        if (this.rng() < 0.35) {
          dx = this.rng() < 0.5 ? -1 : (this.rng() < 0.5 ? 1 : 0);
        }
        if (this.rng() < 0.35) {
          dy = this.rng() < 0.6 ? 1 : (this.rng() < 0.5 ? 0 : -1);
        }

        curX += dx;
        curY += dy;

        // Bounce back into bounds
        if (curX < 1) { curX = 1; dx = 1; }
        if (curX >= this.width - 1) { curX = this.width - 2; dx = -1; }
        if (curY < minDepth) { curY = minDepth; dy = 1; }
        if (curY >= this.height - 1) { curY = this.height - 2; dy = -1; }
      }
    }
  }

  private protectSurfaceAndSpawn(): void {
    const { ENTRANCE_X } = MINING_CONFIG;

    // Row 0 is surface: 100% solid DIRT
    for (let x = 0; x < this.width; x++) {
      this.grid[0][x] = { type: MiningTileType.DIRT, revealed: false };
    }

    // Keep ground directly under entrance solid dirt so player has footing at spawn
    for (let dx = -1; dx <= 1; dx++) {
      const nx = ENTRANCE_X + dx;
      if (nx >= 0 && nx < this.width && this.height > 1) {
        this.grid[1][nx] = { type: MiningTileType.DIRT, revealed: false };
      }
    }
  }

  /**
   * Places discrete ore veins/nodes for Copperium and Silverium.
   * - Copperium is a common metal ore found across mid and deep strata.
   * - Silverium is a rarer precious ore constrained to deeper strata (>= silveriumMinDepth).
   * - Ores spawn as discrete multi-tile nodes/clusters (random 2-5 contiguous tiles per node).
   */
  private placeOreVeins(): void {
    const clusterChance = (this.config.oreClusterChance ?? 65) / 100;

    // 1. Place Copperium Veins
    this.spawnOreType({
      tileType: MiningTileType.COPPERIUM,
      percentage: this.config.copperiumPercentage ?? 4,
      minDepth: 2,
      clusterChance,
      maxClusterSize: 5,
    });

    // 2. Place Silverium Veins (rarer, strictly deep)
    this.spawnOreType({
      tileType: MiningTileType.SILVERIUM,
      percentage: this.config.silveriumPercentage ?? 2,
      minDepth: this.config.silveriumMinDepth ?? 12,
      clusterChance: Math.min(0.8, clusterChance * 1.1),
      maxClusterSize: 4,
    });
  }

  private spawnOreType(opts: {
    tileType: MiningTileType;
    percentage: number;
    minDepth: number;
    clusterChance: number;
    maxClusterSize: number;
  }): void {
    if (opts.percentage <= 0) return;

    const eligibleDirt: MiningPosition[] = [];
    for (let y = Math.max(1, opts.minDepth); y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].type === MiningTileType.DIRT) {
          // Avoid entrance corridor
          if (y <= 2 && Math.abs(x - MINING_CONFIG.ENTRANCE_X) <= 1) continue;
          eligibleDirt.push({ x, y });
        }
      }
    }

    if (eligibleDirt.length === 0) return;

    const targetCount = Math.max(1, Math.floor((eligibleDirt.length * opts.percentage) / 100));

    // Fisher-Yates shuffle seed positions
    for (let i = eligibleDirt.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [eligibleDirt[i], eligibleDirt[j]] = [eligibleDirt[j], eligibleDirt[i]];
    }

    let placed = 0;
    let idx = 0;

    while (placed < targetCount && idx < eligibleDirt.length) {
      const seedPos = eligibleDirt[idx++];
      if (this.grid[seedPos.y][seedPos.x].type !== MiningTileType.DIRT) continue;

      this.grid[seedPos.y][seedPos.x] = { type: opts.tileType, revealed: false };
      placed++;

      // Clustered node expansion: expand organically to contiguous neighbors
      const clusterTarget = 1 + Math.floor(this.rng() * opts.maxClusterSize);
      let clusterCount = 1;
      const queue: MiningPosition[] = [seedPos];

      while (queue.length > 0 && clusterCount < clusterTarget && placed < targetCount) {
        const curr = queue.shift()!;
        if (this.rng() > opts.clusterChance) continue;

        const neighbors = [
          { x: curr.x + 1, y: curr.y },
          { x: curr.x - 1, y: curr.y },
          { x: curr.x, y: curr.y + 1 },
          { x: curr.x, y: curr.y - 1 },
        ];

        // Shuffle neighbors for organic vein shapes
        for (let i = neighbors.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
        }

        for (const n of neighbors) {
          if (
            n.x >= 0 &&
            n.x < this.width &&
            n.y >= opts.minDepth &&
            n.y < this.height &&
            this.grid[n.y][n.x].type === MiningTileType.DIRT &&
            placed < targetCount &&
            clusterCount < clusterTarget
          ) {
            this.grid[n.y][n.x] = { type: opts.tileType, revealed: false };
            placed++;
            clusterCount++;
            queue.push(n);
          }
        }
      }
    }
  }

  private placeRocks(): void {
    // Collect candidate positions: solid dirt tiles where y >= 1
    // CRITICAL REQUIREMENT: A rock must NOT have an EMPTY tile directly beneath it at spawn
    const candidateDirt: MiningPosition[] = [];
    for (let y = 1; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].type === MiningTileType.DIRT) {
          const belowY = y + 1;
          const isSupported = belowY >= this.height || isTileSolid(this.grid[belowY][x].type);
          if (isSupported) {
            candidateDirt.push({ x, y });
          }
        }
      }
    }

    if (candidateDirt.length === 0) return;

    let totalSolid = 0;
    for (let y = 1; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (isTileSolid(this.grid[y][x].type)) totalSolid++;
      }
    }

    const targetCount = Math.floor((totalSolid * this.config.rockPercentage) / 100);

    for (let i = candidateDirt.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [candidateDirt[i], candidateDirt[j]] = [candidateDirt[j], candidateDirt[i]];
    }

    let placed = 0;
    let idx = 0;
    while (placed < targetCount && idx < candidateDirt.length) {
      const pos = candidateDirt[idx++];
      if (pos.y === 1 && Math.abs(pos.x - MINING_CONFIG.ENTRANCE_X) <= 1) continue;
      if (this.grid[pos.y][pos.x].type !== MiningTileType.DIRT) continue;

      // Re-verify support in case a neighbor/below changed
      const belowY = pos.y + 1;
      const isSupported = belowY >= this.height || isTileSolid(this.grid[belowY][pos.x].type);
      if (!isSupported) continue;

      this.grid[pos.y][pos.x] = { type: MiningTileType.ROCK, revealed: false };
      placed++;
    }
  }

  private placeChests(): void {
    const targetCount = Math.max(0, this.config.chestCount);
    if (targetCount === 0) return;

    const midY = Math.floor(this.height / 2);

    // Priority 1: Cavern floor positions (EMPTY space where below is solid, above is empty)
    const cavernFloors: MiningPosition[] = [];
    const deepDirt: MiningPosition[] = [];

    for (let y = midY; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].type === MiningTileType.EMPTY) {
          const belowSolid = y + 1 >= this.height || isTileSolid(this.grid[y + 1][x].type);
          const aboveAir = y - 1 >= 0 && !isTileSolid(this.grid[y - 1][x].type);
          if (belowSolid && aboveAir) {
            cavernFloors.push({ x, y });
          }
        } else if (this.grid[y][x].type === MiningTileType.DIRT) {
          deepDirt.push({ x, y });
        }
      }
    }

    // Shuffle cavern floors
    for (let i = cavernFloors.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cavernFloors[i], cavernFloors[j]] = [cavernFloors[j], cavernFloors[i]];
    }
    // Shuffle deep dirt
    for (let i = deepDirt.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [deepDirt[i], deepDirt[j]] = [deepDirt[j], deepDirt[i]];
    }

    let placed = 0;
    // Try placing on cavern floors first
    for (let i = 0; i < cavernFloors.length && placed < targetCount; i++) {
      const pos = cavernFloors[i];
      this.grid[pos.y][pos.x] = { type: MiningTileType.CHEST, revealed: false };
      placed++;
    }

    // If more chests needed, place in deep dirt
    for (let i = 0; i < deepDirt.length && placed < targetCount; i++) {
      const pos = deepDirt[i];
      if (this.grid[pos.y][pos.x].type === MiningTileType.DIRT) {
        this.grid[pos.y][pos.x] = { type: MiningTileType.CHEST, revealed: false };
        placed++;
      }
    }
  }
}

/**
 * Generate a 45×45 mining grid with procedural caverns, tunnels, and resources.
 */
export function generateMiningMap(options: MapGeneratorOptions): ServerMiningGrid {
  const generator = new MiningMapGenerator(options);
  return generator.generate();
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

      // Check if tile below is not solid (rock can fall through non-solid spaces)
      const belowY = y + 1;
      if (isTileSolid(grid[belowY][x].type)) continue;

      // Rock needs to fall — find final resting position
      let finalY = belowY;
      while (finalY + 1 < MINING_CONFIG.GRID_HEIGHT) {
        const nextBelow = grid[finalY + 1][x];
        if (!isTileSolid(nextBelow.type)) {
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

