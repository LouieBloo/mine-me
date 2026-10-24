import { BLOCK_SCALE } from '@mine-me/shared';
import {
  BiomeField,
  DEFAULT_BIOME_BLEND_WIDTH,
  resolveMapBiomes,
  type BiomeDefinition,
  type DoodadDefinition,
  type DoodadPlacement,
  DEFAULT_DOODAD_MAX_COUNT,
  MiningTileType,
  MINING_CONFIG,
  canTileBeDamaged,
  getTileMineTime,
  getTileMaxHealth,
  isTileSolid,
  generatePocketOutline,
  pickPocketShape,
  DEFAULT_MINING_MAP_CONFIG,
  type FluidDefinition,
  type GasDefinition,
  type FluidGeneration,
  type MiningMapConfigData,
  getGridDimensions,
  pickRockShape,
  pieceCells,
  ROCK_SHAPES,
  type PieceOffset,
  type RockShape,
} from '@mine-me/shared';
import { MiningDataManager, blockKeyForTileType, tileTypeForBlockKey } from './mining/subsystems/MiningDataManager';
import { DOODAD_SEED_SALT, generateDoodadPlacements } from './mining/doodads/DoodadGenerator';

// ============================================================================
// Mining Map Generator
//
// Generates a seeded mining grid (90×90 half-size blocks) with procedural caverns, tunnels,
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
  /** Accumulated damage dealt to this block (remaining HP = maxHealth - damage). */
  damage?: number;
  /** Set on a cell of a multi-cell piece (ladder, torch, bridge): [column, row] inside the piece, from its top-left cell. */
  piece?: PieceOffset;
}

/**
 * Calculate damage stage (0-4) based on accumulated damage vs dynamic tile max health.
 */
export function getDamageStage(tile: ServerTile): number {
  const damageTaken = tile.damage ?? 0;
  if (damageTaken <= 0 || !canTileBeDamaged(tile.type)) {
    return 0;
  }
  const maxHealth = MiningDataManager.getInstance().getBlockMaxHealth(tile.type);
  if (maxHealth <= 0) return 0;

  const ratio = damageTaken / maxHealth;
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
  /** Number of rock tiles to place. Overrides config percentage if provided. */
  rockCount?: number;
  /** Fluids to place in the mine as sealed pockets (those with generation settings). None by default. */
  fluids?: readonly FluidDefinition[];
  /** Gases to place in the mine as sealed pockets (those with generation settings). None by default. */
  gases?: readonly GasDefinition[];
  /** Biomes that shape the mine (tickets 095-096). None: the whole mine is the built-in default biome, the old recipe. */
  biomes?: readonly BiomeDefinition[];
  /** Doodads (scenery) to scatter through the mine (ticket 100). None: none are placed and nothing else changes. */
  doodads?: readonly DoodadDefinition[];
}

/** One cell of fluid the generator placed: a full cell of `typeKey` at (x, y). */
export interface GeneratedFluidCell {
  x: number;
  y: number;
  typeKey: string;
  level: number;
}

/** One cell of gas the generator placed: `concentration` of `typeKey` at (x, y). */
export interface GeneratedGasCell {
  x: number;
  y: number;
  typeKey: string;
  concentration: number;
}

/** Salt for the gases' own random stream, so gas pockets never change fluid pockets or the rest of the map. */
const GAS_SEED_SALT = 0x6a5c0de5;

/** The widest a generated tunnel may be, in cells. */
const MAX_TUNNEL_WIDTH = 6;

/** Cells either side of the entrance that stay plain ground (solid footing at spawn, no ore or rock right at the exit). */
const ENTRANCE_CLEAR_RADIUS = BLOCK_SCALE;

/** Ore clusters keep the world size they had with blocks twice as big: a quarter of the area per cell, so 4x the cells. */
const ORE_CLUSTER_AREA_SCALE = BLOCK_SCALE * BLOCK_SCALE;

/** Salt for the fluids' own random stream, so pocket placement never depends on how much the other steps drew. */
const FLUID_SEED_SALT = 0x0f1d51ed;

/** Salt for the random stream that swaps base blocks per biome, so swaps never change anything else. */
const SWAP_SEED_SALT = 0x5a9b10c5;

/** Salt for the weighted ordering of ore and rock spots in biomes that change block weights. */
const BIOME_ORDER_SEED_SALT = 0x0e0a5ed1;

export class MiningMapGenerator {
  private rng: () => number;
  private config: MiningMapConfigData;
  private width: number;
  private height: number;
  private grid: ServerMiningGrid = [];
  private readonly fluids: readonly FluidDefinition[];
  private readonly fluidRng: () => number;
  private readonly gases: readonly GasDefinition[];
  private readonly gasRng: () => number;
  private readonly swapRng: () => number;
  private readonly orderRng: () => number;
  private readonly doodadRng: () => number;
  private readonly doodads: readonly DoodadDefinition[];
  /** Which biome each cell is in (tickets 095-096). */
  public readonly biomeField: BiomeField;
  /** Fluid cells placed by the last `generate()`. */
  public fluidCells: GeneratedFluidCell[] = [];
  /** Gas cells placed by the last `generate()`. */
  public gasCells: GeneratedGasCell[] = [];
  /** Doodads placed by the last `generate()`, row by row (ticket 100). */
  public doodadPlacements: DoodadPlacement[] = [];
  /** Every cell inside a fluid or gas pocket, so later steps leave them alone. */
  private pocketCellKeys = new Set<number>();

  constructor(options: MapGeneratorOptions) {
    this.rng = createSeededRng(options.seed);
    this.fluidRng = createSeededRng(options.seed ^ FLUID_SEED_SALT);
    this.fluids = options.fluids ?? [];
    this.gasRng = createSeededRng(options.seed ^ GAS_SEED_SALT);
    this.gases = options.gases ?? [];
    this.swapRng = createSeededRng(options.seed ^ SWAP_SEED_SALT);
    this.orderRng = createSeededRng(options.seed ^ BIOME_ORDER_SEED_SALT);
    this.doodadRng = createSeededRng(options.seed ^ DOODAD_SEED_SALT);
    this.doodads = options.doodads ?? [];
    this.config = {
      ...DEFAULT_MINING_MAP_CONFIG,
      ...options.config,
    };
    this.width = this.config.gridWidth;
    this.height = this.config.gridHeight;
    this.biomeField = new BiomeField(
      options.seed,
      resolveMapBiomes(options.biomes, this.config.biomeWeights),
      this.config.biomeBlendWidth ?? DEFAULT_BIOME_BLEND_WIDTH,
      this.width,
      this.height
    );
  }

  public generate(): ServerMiningGrid {
    this.initializeSolidGrid();
    this.carveCaverns();
    this.carveTunnels();
    this.protectSurfaceAndSpawn();
    this.placeFluidPockets();
    this.placeGasPockets();
    this.placeOreVeins();
    this.placeRocks();
    this.swapBaseBlocks();
    this.placeDoodads();
    return this.grid;
  }

  /** Scatters the scenery over the finished mine (see `generateDoodadPlacements`). Reads the map, never changes it. */
  private placeDoodads(): void {
    this.doodadPlacements = generateDoodadPlacements({
      grid: this.grid,
      biomeField: this.biomeField,
      doodads: this.doodads,
      fluidCells: this.fluidCells,
      gasCells: this.gasCells,
      rng: this.doodadRng,
      maxCount: this.config.doodadMaxCount ?? DEFAULT_DOODAD_MAX_COUNT,
      entranceX: MINING_CONFIG.ENTRANCE_X,
      blockKeyOf: blockKeyForTileType,
    });
  }

  /**
   * Places each fluid that has generation settings: sealed pockets inside plain dirt (a square, a rectangle or a
   * winding vein, always one connected region) or, in `POOL` mode, shallow puddles on cave floors. Runs before ores,
   * and rocks so there is room to fit them: a pocket's walls (a one tile margin) are solid, and the later steps
   * leave pocket cells alone (a rock cannot sit on an open cell, ores only replace dirt).
   * Uses its own random stream.
   */
  private placeFluidPockets(): void {
    this.fluidCells = [];
    this.pocketCellKeys = new Set();
    for (const fluid of byTypeKey(this.fluids)) {
      const add = (x: number, y: number) => this.fluidCells.push({ x, y, typeKey: fluid.typeKey, level: 1 });
      const multiplierAt = (x: number, y: number) => this.biomeField.fluidMultiplier(x, y, fluid.typeKey);
      if (fluid.generation?.mode === 'POOL') this.placePools(fluid.generation, this.fluidRng, multiplierAt, add);
      else this.carvePockets(fluid.generation, this.fluidRng, multiplierAt, add);
    }
  }

  /** Like the fluid pockets, for gases: sealed pockets of the same shapes, placed after the fluids with a random stream of their own. */
  private placeGasPockets(): void {
    this.gasCells = [];
    for (const gas of byTypeKey(this.gases)) {
      const concentration = gas.generation?.concentration ?? 1;
      this.carvePockets(
        gas.generation,
        this.gasRng,
        (x, y) => this.biomeField.gasMultiplier(x, y, gas.typeKey),
        (x, y) => this.gasCells.push({ x, y, typeKey: gas.typeKey, concentration })
      );
    }
  }

  /**
   * Carves sealed pockets of open cells for one generating definition, calling `onCell` for each cell of each pocket.
   * Each pocket is a randomly chosen shape (by the definition's weights) and is one connected region. Only plain dirt
   * with a solid ring around it is used, so a pocket is always sealed. `multiplierAt` is how much more or less of this
   * content the biome at a cell wants (1 = as usual, 0 = none): it scales how many pockets there are and where they land.
   */
  private carvePockets(
    gen: FluidGeneration | null | undefined,
    rng: () => number,
    multiplierAt: (x: number, y: number) => number,
    onCell: (x: number, y: number) => void
  ): void {
    if (!gen || gen.percentage <= 0) return;
    const first = Math.max(1, gen.minDepth);
    const last = Math.min(this.height - 2, gen.maxDepth ?? this.height - 2);
    if (last < first) return;

    let diggable = 0;
    let strongest = 0;
    for (let y = first; y <= last; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.grid[y][x].type !== MiningTileType.DIRT) continue;
        const multiplier = multiplierAt(x, y);
        diggable += multiplier;
        strongest = Math.max(strongest, multiplier);
      }
    }
    if (strongest <= 0) return;
    const averageSide = (gen.minSize + gen.maxSize) / 2;
    const target = Math.round((diggable * gen.percentage) / 100 / (averageSide * averageSide));
    let placed = 0;
    for (let attempt = 0; attempt < target * 30 * BLOCK_SCALE * BLOCK_SCALE && placed < target; attempt++) {
      const outline = generatePocketOutline(pickPocketShape(gen.shapes, rng), gen.minSize, gen.maxSize, rng);
      const x = 1 + Math.floor(rng() * Math.max(1, this.width - 2 - outline.width));
      const y = first + Math.floor(rng() * Math.max(1, last - first + 2 - outline.height));
      if (y + outline.height - 1 > last) continue;
      const cells = outline.cells.map((c) => ({ x: x + c.x, y: y + c.y }));
      if (!this.canHoldPocket(cells)) continue;
      if (!this.biomeAccepts(multiplierAt(x + Math.floor(outline.width / 2), y + Math.floor(outline.height / 2)), strongest, rng)) continue;
      for (const { x: px, y: py } of cells) {
        this.grid[py][px] = { type: MiningTileType.EMPTY, revealed: false };
        onCell(px, py);
        this.pocketCellKeys.add(py * this.width + px);
      }
      placed++;
    }
  }

  /** A pocket fits when all its cells are plain dirt and every cell touching it (corners too) is solid, so it is sealed. */
  private canHoldPocket(cells: ReadonlyArray<{ x: number; y: number }>): boolean {
    const inside = new Set(cells.map((c) => c.y * this.width + c.x));
    for (const { x, y } of cells) {
      if (x < 1 || y < 1 || x >= this.width - 1 || y >= this.height - 1) return false;
      if (this.grid[y][x].type !== MiningTileType.DIRT) return false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (inside.has((y + dy) * this.width + (x + dx))) continue;
          if (!isTileSolid(this.grid[y + dy][x + dx].type)) return false;
        }
      }
    }
    return true;
  }

  /**
   * Lays shallow pools on cave floors: runs of open tiles that each have solid ground below. `minSize`..`maxSize` is the
   * run's width and `percentage` the share of eligible floor tiles that ends up pooled. A pool is one row of full cells
   * which the fluid simulation then spreads out. Pocket cells and spots already pooled are left alone.
   */
  private placePools(
    gen: FluidGeneration,
    rng: () => number,
    multiplierAt: (x: number, y: number) => number,
    onCell: (x: number, y: number) => void
  ): void {
    if (gen.percentage <= 0) return;
    const first = Math.max(1, gen.minDepth);
    const last = Math.min(this.height - 2, gen.maxDepth ?? this.height - 2);
    if (last < first) return;

    const isFloor = (x: number, y: number): boolean =>
      x >= 1 && x < this.width - 1 && y < this.height - 1 &&
      this.grid[y][x].type === MiningTileType.EMPTY &&
      isTileSolid(this.grid[y + 1][x].type) &&
      !this.pocketCellKeys.has(y * this.width + x);

    const floor: Array<{ x: number; y: number }> = [];
    for (let y = first; y <= last; y++) for (let x = 1; x < this.width - 1; x++) if (isFloor(x, y)) floor.push({ x, y });
    if (floor.length === 0) return;
    let floorWeight = 0;
    let strongest = 0;
    for (const spot of floor) {
      const multiplier = multiplierAt(spot.x, spot.y);
      floorWeight += multiplier;
      strongest = Math.max(strongest, multiplier);
    }
    if (strongest <= 0) return;

    const averageWidth = (gen.minSize + gen.maxSize) / 2;
    const target = Math.round((floorWeight * gen.percentage) / 100 / averageWidth);
    let placed = 0;
    for (let attempt = 0; attempt < target * 10 && placed < target; attempt++) {
      const start = floor[Math.floor(rng() * floor.length)];
      if (!this.biomeAccepts(multiplierAt(start.x, start.y), strongest, rng)) continue;
      const width = gen.minSize + Math.floor(rng() * (gen.maxSize - gen.minSize + 1));
      let x = start.x;
      while (x < start.x + width && isFloor(x, start.y)) x++;
      const run = x - start.x;
      if (run < Math.min(width, 2)) continue;
      for (let px = start.x; px < start.x + run; px++) {
        onCell(px, start.y);
        this.pocketCellKeys.add(start.y * this.width + px);
      }
      placed++;
    }
  }

  /**
   * Whether a spot wanting `multiplier` of something is used, when the best spot on the map wants `strongest`: the
   * spot is kept with probability multiplier / strongest. A spot at full strength (always the case with no biomes)
   * is kept without drawing a random number, so a map without biomes is generated exactly as before.
   */
  private biomeAccepts(multiplier: number, strongest: number, rng: () => number): boolean {
    if (multiplier <= 0) return false;
    if (multiplier >= strongest) return true;
    return rng() < multiplier / strongest;
  }

  /** How much of a block the biomes want across `spots`: each spot's multiplier added up (just the count when no biome changes the block). */
  private spotWeight(spots: readonly MiningPosition[], blockKey: string | undefined): number {
    if (!blockKey || !this.biomeField.changesBlockWeights) return spots.length;
    let total = 0;
    for (const spot of spots) total += this.biomeField.blockMultiplier(spot.x, spot.y, blockKey);
    return total;
  }

  /**
   * Puts candidate spots in the order they are used. With no biome changing the block this is the plain shuffle of
   * old (same draws, same result). Otherwise it is a weighted shuffle: a spot where the biome wants more of the
   * block comes up earlier more often, and a spot that wants none is dropped.
   */
  private shuffleSpots<T extends MiningPosition>(spots: T[], blockKey: string | undefined): T[] {
    if (!blockKey || !this.biomeField.changesBlockWeights) {
      for (let i = spots.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      return spots;
    }
    const keyed: { spot: T; key: number }[] = [];
    for (const spot of spots) {
      const multiplier = this.biomeField.blockMultiplier(spot.x, spot.y, blockKey);
      if (multiplier > 0) keyed.push({ spot, key: Math.pow(this.orderRng(), 1 / multiplier) });
    }
    keyed.sort((a, b) => b.key - a.key);
    return keyed.map((k) => k.spot);
  }

  /**
   * Replaces base blocks the biomes say to swap (e.g. dirt into ice), as the very last step so everything else was
   * placed on plain dirt as usual. Multi-cell pieces are left whole. Uses its own random stream.
   */
  private swapBaseBlocks(): void {
    const field = this.biomeField;
    if (!field.biomes.some((b) => (b.blockPalette?.swaps?.length ?? 0) > 0)) return;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.grid[y][x];
        if (tile.piece) continue;
        const key = blockKeyForTileType(tile.type);
        if (!key) continue;
        const chances = field.swapChances(x, y, key);
        if (chances.length === 0) continue;
        const roll = this.swapRng();
        let reached = 0;
        for (const { to, chance } of chances) {
          reached += chance;
          if (roll >= reached) continue;
          const type = tileTypeForBlockKey(to);
          if (type !== undefined) this.grid[y][x] = { type, revealed: false };
          break;
        }
      }
    }
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

  /**
   * Carves the caves. The shape is worked out on a coarse grid, one coarse cell per original-size block, so caves are as
   * big as they were before blocks got smaller (smoothing small cells directly gives tiny pockets), then redrawn on the
   * real grid and smoothed a little so the edges are rounded instead of stepped.
   */
  private carveCaverns(): void {
    if (this.config.cavernDensity <= 0) return;

    const scale = BLOCK_SCALE;
    const coarseWidth = Math.ceil(this.width / scale);
    const coarseHeight = Math.ceil(this.height / scale);
    const minDepth = Math.max(1, Math.ceil(this.config.cavernMinDepth / scale));
    let openMap: boolean[][] = Array.from({ length: coarseHeight }, () =>
      Array.from({ length: coarseWidth }, () => false)
    );

    const baseDensity = Math.min(100, Math.max(0, this.config.cavernDensity)) / 100;
    // Map cavernDensity [0, 1] to cellular automata seed probability [0.38, 0.58]
    const initialOpenProb = 0.38 + baseDensity * 0.20;

    for (let y = minDepth; y < coarseHeight; y++) {
      const depthProgress = (y - minDepth) / Math.max(1, coarseHeight - minDepth);
      const depthScale = 0.85 + 0.15 * depthProgress;
      const cellThreshold = initialOpenProb * depthScale;

      for (let x = 0; x < coarseWidth; x++) {
        openMap[y][x] = this.rng() < cellThreshold;
      }
    }

    // Cellular automata smoothing iterations (classic 4-5 rule)
    const iterations = Math.max(1, Math.min(6, this.config.cavernIterations));
    for (let it = 0; it < iterations; it++) {
      openMap = this.smoothOpenMap(openMap, minDepth, coarseWidth, coarseHeight);
    }

    // Redraw on the real grid (every coarse cell becomes scale x scale cells), then round the corners
    const fineMinDepth = Math.max(1, this.config.cavernMinDepth);
    let fine: boolean[][] = Array.from({ length: this.height }, (_, y) =>
      Array.from({ length: this.width }, (_, x) => y >= fineMinDepth && (openMap[Math.floor(y / scale)]?.[Math.floor(x / scale)] ?? false))
    );
    if (scale > 1) {
      for (let pass = 0; pass < 2; pass++) fine = this.smoothOpenMap(fine, fineMinDepth, this.width, this.height);
    }

    // Apply carved caverns to grid
    for (let y = fineMinDepth; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (fine[y][x]) {
          this.grid[y][x] = { type: MiningTileType.EMPTY, revealed: false };
        }
      }
    }
  }

  /** One pass of the classic 4-5 cave rule over an open/solid map (rows above `minDepth` and the edges count as solid). */
  private smoothOpenMap(openMap: boolean[][], minDepth: number, width: number, height: number): boolean[][] {
    const next: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
    for (let y = minDepth; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let solidNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < minDepth || ny >= height) {
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
          next[y][x] = false;
        } else if (solidNeighbors <= 3) {
          next[y][x] = true;
        } else {
          next[y][x] = openMap[y][x];
        }
      }
    }
    return next;
  }

  private carveTunnels(): void {
    if (this.config.tunnelCount <= 0) return;

    const minDepth = Math.max(1, this.config.tunnelMinDepth);
    const wormCount = this.config.tunnelCount;
    const minLength = Math.max(5, this.config.tunnelMinLength);
    const maxLength = Math.max(minLength, this.config.tunnelMaxLength);
    // A tunnel is a square brush this many cells wide and tall, so the character (1.25 x 1.75 cells) fits at width 2
    const tunnelWidth = Math.max(1, Math.min(MAX_TUNNEL_WIDTH, this.config.tunnelWidth));

    for (let i = 0; i < wormCount; i++) {
      let curX = Math.floor(this.rng() * (this.width - 4)) + 2;
      let curY = Math.floor(this.rng() * (this.height - minDepth - 2)) + minDepth;
      const steps = Math.floor(this.rng() * (maxLength - minLength + 1)) + minLength;

      let dx = this.rng() > 0.5 ? 1 : -1;
      let dy = this.rng() > 0.4 ? 1 : 0;

      for (let step = 0; step < steps; step++) {
        for (let by = 0; by < tunnelWidth; by++) {
          for (let bx = 0; bx < tunnelWidth; bx++) {
            const cx = curX + bx;
            const cy = curY + by;
            if (cy >= 1 && cy < this.height && cx >= 0 && cx < this.width) {
              this.grid[cy][cx] = { type: MiningTileType.EMPTY, revealed: false };
            }
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
    for (let dx = -ENTRANCE_CLEAR_RADIUS; dx <= ENTRANCE_CLEAR_RADIUS; dx++) {
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
      minDepth: 2 * BLOCK_SCALE,
      clusterChance,
      maxClusterSize: 5 * ORE_CLUSTER_AREA_SCALE,
    });

    // 2. Place Silverium Veins (rarer, strictly deep)
    this.spawnOreType({
      tileType: MiningTileType.SILVERIUM,
      percentage: this.config.silveriumPercentage ?? 2,
      minDepth: this.config.silveriumMinDepth ?? DEFAULT_MINING_MAP_CONFIG.silveriumMinDepth,
      clusterChance: Math.min(0.8, clusterChance * 1.1),
      maxClusterSize: 4 * ORE_CLUSTER_AREA_SCALE,
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

    const blockKey = blockKeyForTileType(opts.tileType);
    const eligibleDirt: MiningPosition[] = [];
    for (let y = Math.max(1, opts.minDepth); y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].type === MiningTileType.DIRT) {
          // Avoid entrance corridor
          if (y <= 2 * BLOCK_SCALE && Math.abs(x - MINING_CONFIG.ENTRANCE_X) <= ENTRANCE_CLEAR_RADIUS) continue;
          eligibleDirt.push({ x, y });
        }
      }
    }

    if (eligibleDirt.length === 0) return;

    const targetCount = Math.max(1, Math.floor((this.spotWeight(eligibleDirt, blockKey) * opts.percentage) / 100));

    // Shuffle seed positions (weighted by the biomes where they change this block)
    const seedSpots = this.shuffleSpots(eligibleDirt, blockKey);

    let placed = 0;
    let idx = 0;

    while (placed < targetCount && idx < seedSpots.length) {
      const seedPos = seedSpots[idx++];
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

  /**
   * Scatters rocks over the solid ground. `rockPercentage` is the share of solid cells that end up rock; the
   * rocks come in the sizes of ROCK_SHAPES (a few cells wide or high), picked by weight, so one big rock uses up
   * as much of the budget as the small ones it replaces. Every rock rests on solid ground along its whole bottom
   * edge, so none starts out about to fall, and none sits near the entrance. A rock bigger than one cell is a
   * piece: each of its cells records its place and the rock's size (see PieceOffset).
   */
  private placeRocks(): void {
    const anchors: MiningPosition[] = [];
    let totalSolid = 0;
    for (let y = 1; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const type = this.grid[y][x].type;
        if (isTileSolid(type)) totalSolid++;
        if (type === MiningTileType.DIRT) anchors.push({ x, y });
      }
    }

    let budget = Math.floor((totalSolid * this.config.rockPercentage) / 100);
    if (this.biomeField.changesBlockWeights) {
      let wanted = 0;
      for (let y = 1; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) if (isTileSolid(this.grid[y][x].type)) wanted += this.biomeField.blockMultiplier(x, y, 'ROCK');
      }
      budget = Math.floor((wanted * this.config.rockPercentage) / 100);
    }
    if (budget <= 0 || anchors.length === 0) return;

    const orderedAnchors = this.shuffleSpots(anchors, 'ROCK');

    for (const anchor of orderedAnchors) {
      if (budget <= 0) break;
      const picked = pickRockShape(this.rng(), (shape) => shape.width * shape.height <= budget);
      if (!picked) break;
      // The picked size if it fits here, else the biggest smaller one that does
      const shape = this.rockShapesToTry(picked).find((candidate) => this.canPlaceRock(anchor, candidate));
      if (!shape) continue;

      const isBig = shape.width > 1 || shape.height > 1;
      for (const cell of pieceCells(anchor, shape, true)) {
        this.grid[cell.y][cell.x] = { type: MiningTileType.ROCK, revealed: false, ...(isBig ? { piece: cell.offset } : {}) };
      }
      budget -= shape.width * shape.height;
    }
  }

  /** The picked shape first, then every smaller one, biggest first (what to fall back to where the picked one does not fit). */
  private rockShapesToTry(picked: RockShape): RockShape[] {
    const area = (s: RockShape) => s.width * s.height;
    const smaller = ROCK_SHAPES.filter((s) => area(s) < area(picked)).sort((a, b) => area(b) - area(a));
    return [picked, ...smaller];
  }

  /** Whether a rock of `shape` with its top-left cell at `anchor` fits: all dirt, clear of the entrance, resting on solid ground. */
  private canPlaceRock(anchor: MiningPosition, shape: RockShape): boolean {
    const bottom = anchor.y + shape.height; // the row under the rock
    if (anchor.x + shape.width > this.width || bottom > this.height) return false;
    for (let y = anchor.y; y < bottom; y++) {
      for (let x = anchor.x; x < anchor.x + shape.width; x++) {
        if (this.grid[y][x].type !== MiningTileType.DIRT) return false;
        if (y <= BLOCK_SCALE && Math.abs(x - MINING_CONFIG.ENTRANCE_X) <= ENTRANCE_CLEAR_RADIUS) return false;
      }
    }
    if (bottom >= this.height) return true; // standing on the floor of the map
    for (let x = anchor.x; x < anchor.x + shape.width; x++) {
      if (!isTileSolid(this.grid[bottom][x].type)) return false;
    }
    return true;
  }

}

/**
 * Generate a mining grid (90×90 by default) with procedural caverns, tunnels, and resources.
 */
export function generateMiningMap(options: MapGeneratorOptions): ServerMiningGrid {
  const generator = new MiningMapGenerator(options);
  return generator.generate();
}

/** Like `generateMiningMap`, but also says which cells hold fluid or gas (see `options.fluids` and `options.gases`) and which biome each cell is in. */
export function generateMiningMapWithFluids(
  options: MapGeneratorOptions
): { grid: ServerMiningGrid; fluidCells: GeneratedFluidCell[]; gasCells: GeneratedGasCell[]; biomeField: BiomeField; doodads: DoodadPlacement[] } {
  const generator = new MiningMapGenerator(options);
  const grid = generator.generate();
  return { grid, fluidCells: generator.fluidCells, gasCells: generator.gasCells, biomeField: generator.biomeField, doodads: generator.doodadPlacements };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Definitions in typeKey order, so pocket placement does not depend on the order the database returned them in. */
function byTypeKey<T extends { typeKey: string }>(definitions: readonly T[]): T[] {
  return [...definitions].sort((a, b) => (a.typeKey < b.typeKey ? -1 : a.typeKey > b.typeKey ? 1 : 0));
}

interface MiningPosition {
  x: number;
  y: number;
}

/**
 * Check if a position is within grid bounds.
 */
export function isInBounds(x: number, y: number, grid: ServerMiningGrid): boolean {
  const { width, height } = getGridDimensions(grid);
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < width && y >= 0 && y < height;
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
  const { width, height } = getGridDimensions(grid);
  const moves: GravityMove[] = [];
  const rocksLanded: MiningPosition[] = [];
  let playerCrushed = false;

  // Scan columns bottom-to-top so we process falls correctly
  for (let x = 0; x < width; x++) {
    // We iterate top-to-bottom to find rocks that should fall
    for (let y = 0; y < height - 1; y++) {
      if (grid[y][x].type !== MiningTileType.ROCK) continue;

      // Check if tile below is not solid (rock can fall through non-solid spaces)
      const belowY = y + 1;
      if (isTileSolid(grid[belowY][x].type)) continue;

      // Rock needs to fall — find final resting position
      let finalY = belowY;
      while (finalY + 1 < height) {
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

      if (isInBounds(nx, ny, grid)) {
        grid[ny][nx].revealed = true;
      }
    }
  }
}

/**
 * Convert server grid to client-safe grid (hide unrevealed tile types).
 */
export function toClientGrid(grid: ServerMiningGrid, biomeGrid?: Uint8Array | null): import('@mine-me/shared').MiningClientTile[][] {
  return grid.map((row, y) =>
    row.map((tile, x) => ({
      type: tile.revealed ? tile.type : MiningTileType.DIRT,
      revealed: tile.revealed,
      damageStage: tile.revealed ? getDamageStage(tile) : 0,
      ...(tile.revealed && tile.piece ? { piece: tile.piece } : {}),
      // Which biome a cell is in is only told for revealed cells, like everything else underground
      ...(tile.revealed && biomeGrid ? { biome: biomeGrid[y * row.length + x] } : {}),
    }))
  );
}

