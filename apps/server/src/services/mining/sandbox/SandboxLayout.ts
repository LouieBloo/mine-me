import { BLOCK_SCALE, MiningTileType } from '@mine-me/shared';

/** An inclusive rectangle of tiles. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * One step in building the sandbox map. Zones are applied in order, so a later zone paints over an
 * earlier one: the layout is "fill everything with dirt, then carve, then place".
 */
export type SandboxZone =
  /** Paints every tile in the rectangle (use EMPTY to carve). */
  | { kind: 'fill'; tile: MiningTileType; rect: TileRect }
  /** Paints single tiles. */
  | { kind: 'tiles'; tile: MiningTileType; at: ReadonlyArray<{ x: number; y: number }> }
  /** One tile of each type, left to right, `spacing` apart. Each is `size` x `size` cells (default 1). `cellSize` sets both in cells after scaling, so the blocks touch. */
  | { kind: 'blockRow'; y: number; startX: number; spacing: number; tiles: readonly MiningTileType[]; size?: number; cellSize?: number }
  /** Carves the rectangle open and fills it with the fluid whose typeKey is `fluid`; a fluid that is not loaded leaves the pool dry. */
  | { kind: 'pool'; rect: TileRect; fluid: string; fillFromY?: number }
  /** Carves the rectangle open and fills it with `concentration` (default 1) of the gas in `gasSlot` (the loaded gases in key order); a slot with no gas stays empty. Leave solid ground around it and it is a sealed pocket. */
  | { kind: 'chamber'; rect: TileRect; gasSlot: number; concentration?: number };

/** A mob the sandbox starts with. */
export interface SandboxMobSpawn {
  /** The map config's surface dummy mob. */
  kind: 'surfaceDummy';
  x: number;
  y: number;
}

export interface SandboxLayout {
  width: number;
  /** Rows from the ground surface (row 0 of the layout) down. */
  height: number;
  /**
   * Rows of open sky above the surface. Zone and mob coordinates are relative to the surface, so a
   * zone at y = 0 is the ground; the builder adds the sky above it. Sky rows are where fluid can be
   * poured above the ground and fall.
   */
  skyRows: number;
  /** What every tile starts as. */
  base: MiningTileType;
  zones: readonly SandboxZone[];
  mobs: readonly SandboxMobSpawn[];
}

/** Open sky above the sandbox's ground, in old-size blocks: room to pour fluid and watch it fall. */
export const SANDBOX_SKY_ROWS_OLD = 12;

/** How many blocks make up one original block along each side. */
export const SANDBOX_BLOCK_SCALE = BLOCK_SCALE;

/** Open sky above the sandbox's ground, in blocks. */
export const SANDBOX_SKY_ROWS = SANDBOX_SKY_ROWS_OLD * SANDBOX_BLOCK_SCALE;

/**
 * Redraws a layout written in old-size blocks with every block `factor` times smaller (so `factor` x `factor` small
 * blocks per old block). The layout stays the same size in the world: rectangles, single blocks and the gallery are all
 * enlarged, and mobs keep their place. This lets the layout below stay readable in the coordinates it was drawn in.
 */
export function scaleSandboxLayout(layout: SandboxLayout, factor: number): SandboxLayout {
  const cell = (x: number, y: number) => {
    const out: Array<{ x: number; y: number }> = [];
    for (let dy = 0; dy < factor; dy++) for (let dx = 0; dx < factor; dx++) out.push({ x: x * factor + dx, y: y * factor + dy });
    return out;
  };
  const scaleRect = (r: TileRect): TileRect => ({ x0: r.x0 * factor, y0: r.y0 * factor, x1: (r.x1 + 1) * factor - 1, y1: (r.y1 + 1) * factor - 1 });
  const zones: SandboxZone[] = layout.zones.map((zone): SandboxZone => {
    switch (zone.kind) {
      case 'fill':
        return { ...zone, rect: scaleRect(zone.rect) };
      case 'tiles':
        return { ...zone, at: zone.at.flatMap((p) => cell(p.x, p.y)) };
      case 'blockRow':
        // One zone per block type is not available, so the row is spaced out and each block is drawn as a factor x factor square
        // `cellSize` (cells per block side, touching) overrides the default of one original block per block
        return { ...zone, y: zone.y * factor, startX: zone.startX * factor, spacing: zone.cellSize ?? zone.spacing * factor, size: zone.cellSize ?? factor };
      case 'pool':
        return { ...zone, rect: scaleRect(zone.rect), fillFromY: zone.fillFromY === undefined ? undefined : zone.fillFromY * factor };
      case 'chamber':
        return { ...zone, rect: scaleRect(zone.rect) };
    }
  });
  return {
    ...layout,
    width: layout.width * factor,
    height: layout.height * factor,
    skyRows: layout.skyRows * factor,
    zones,
    mobs: layout.mobs.map((mob) => ({ ...mob, x: mob.x * factor, y: mob.y * factor })),
  };
}

const rect = (x0: number, y0: number, x1: number, y1: number): TileRect => ({ x0, y0, x1, y1 });
/** How far the pools and chambers are pushed right (original blocks) to make room for the block line next to the spawn. */
const E = 15;
const { EMPTY, DIRT, ROCK, LADDER, COPPERIUM, SILVERIUM } = MiningTileType;

/**
 * The standard sandbox, 105 wide by 30 deep in old-size blocks, under {@link SANDBOX_SKY_ROWS_OLD} rows of open sky. Left to right on the surface: spawn (x 22), two target dummies, a line of
 * one 4x4 patch of every block along the ground (from x 23), the ladder shaft into the hall (x 12-14), and oil and water pools side by side (x 47-58 and 60-71) that open onto
 * the surface so you can jump straight in, a lava pool at the far left (x 1-4), and
 *  two sealed gas chambers under the ground (x 75-82 hydrogen, x 85-92 nitrogen). Underground: a long open hall and a
 * rock tower, and a bed of ore to dig through.
 *
 * `blockTiles` is every block type in the game, so a new block shows up in the ground line by itself.
 */
export function createDefaultSandboxLayout(blockTiles: readonly MiningTileType[]): SandboxLayout {
  return scaleSandboxLayout(createOldSizeSandboxLayout(blockTiles), SANDBOX_BLOCK_SCALE);
}

/** The standard sandbox drawn in old-size blocks (see {@link createDefaultSandboxLayout}, which draws it with half-size blocks). */
function createOldSizeSandboxLayout(blockTiles: readonly MiningTileType[]): SandboxLayout {
  return {
    width: 90 + E,
    height: 30,
    skyRows: SANDBOX_SKY_ROWS_OLD,
    base: DIRT,
    zones: [
      // A 4x4 patch of every block in a line along the ground, starting just right of the spawn (x 22): walk along the top
      { kind: 'blockRow', y: 0, startX: 23, spacing: 1, cellSize: 4, tiles: blockTiles },

      // Ladder shaft from the surface down to the hall
      { kind: 'fill', tile: EMPTY, rect: rect(12, 0, 14, 11) },
      { kind: 'fill', tile: LADDER, rect: rect(13, 0, 13, 11) },

      // The long open hall (floor on row 16)
      { kind: 'fill', tile: EMPTY, rect: rect(1, 12, 88 + E, 15) },
      // A rock tower that falls when its floor is mined out
      { kind: 'fill', tile: ROCK, rect: rect(50, 12, 50, 15) },

      // Ore bed to dig through
      { kind: 'tiles', tile: COPPERIUM, at: [{ x: 6, y: 18 }, { x: 7, y: 18 }, { x: 30, y: 19 }, { x: 31, y: 19 }, { x: 60, y: 20 }, { x: 75, y: 18 }] },
      { kind: 'tiles', tile: SILVERIUM, at: [{ x: 45, y: 21 }, { x: 46, y: 21 }, { x: 82, y: 20 }] },

      // Oil and water pools side by side (floor on row 8), and a lava pool off on its own at the far left. Break the
      // shared wall to mix oil and water; pour water into the lava to cool it into lavarock.
      { kind: 'pool', rect: rect(32 + E, 0, 43 + E, 7), fluid: 'OIL', fillFromY: 1 },
      { kind: 'pool', rect: rect(45 + E, 0, 56 + E, 7), fluid: 'WATER', fillFromY: 1 },
      { kind: 'pool', rect: rect(1, 0, 4, 7), fluid: 'LAVA', fillFromY: 1 },
      // Two sealed gas chambers in the ground (hydrogen, then nitrogen: the first two gases in key order) under a
      // two-block roof of dirt. Mine down through the roof to let one out and watch it rise or sink.
      { kind: 'chamber', rect: rect(60 + E, 2, 67 + E, 7), gasSlot: 0 },
      { kind: 'chamber', rect: rect(70 + E, 2, 77 + E, 7), gasSlot: 1 },

      // Pool walls made of different blocks
      { kind: 'fill', tile: ROCK, rect: rect(31 + E, 4, 31 + E, 5) },
      { kind: 'tiles', tile: COPPERIUM, at: [{ x: 31 + E, y: 2 }, { x: 31 + E, y: 3 }] },
      { kind: 'fill', tile: ROCK, rect: rect(44 + E, 3, 44 + E, 4) },
      { kind: 'tiles', tile: SILVERIUM, at: [{ x: 57 + E, y: 2 }, { x: 57 + E, y: 3 }] },
    ],
    mobs: [
      { kind: 'surfaceDummy', x: 17.5, y: 0 },
      { kind: 'surfaceDummy', x: 27.5, y: 0 },
    ],
  };
}
