import { MiningTileType } from '@mine-me/shared';

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
  /** One tile of each type, left to right, `spacing` apart. */
  | { kind: 'blockRow'; y: number; startX: number; spacing: number; tiles: readonly MiningTileType[] }
  /** Carves the rectangle open and fills it with the fluid in `fluidSlot` (the loaded fluids in key order); a slot with no fluid stays dry. */
  | { kind: 'pool'; rect: TileRect; fluidSlot: number; fillFromY?: number }
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

/** Open sky above the sandbox's ground: room to pour fluid and watch it fall. */
export const SANDBOX_SKY_ROWS = 12;

const rect = (x0: number, y0: number, x1: number, y1: number): TileRect => ({ x0, y0, x1, y1 });
const { EMPTY, DIRT, ROCK, MINERAL, CHEST, LADDER, COPPERIUM, SILVERIUM } = MiningTileType;

/**
 * The standard sandbox, 90 wide by 30 deep, under {@link SANDBOX_SKY_ROWS} rows of open sky. Left to right on the surface: spawn (x 22), two target dummies, the
 * ladder shaft into the hall (x 12-14), and two pools side by side (x 32-43 and 45-56) that open onto
 * the surface so you can jump straight in, then two sealed gas chambers under the ground (x 60-67 hydrogen, x 70-77 nitrogen). Underground: a long open hall with one of every block and a
 * rock tower, and a bed of ore and chests to dig through.
 *
 * `blockTiles` is every block type in the game, so a new block shows up in the gallery by itself.
 */
export function createDefaultSandboxLayout(blockTiles: readonly MiningTileType[]): SandboxLayout {
  return {
    width: 90,
    height: 30,
    skyRows: SANDBOX_SKY_ROWS,
    base: DIRT,
    zones: [
      // Ladder shaft from the surface down to the hall
      { kind: 'fill', tile: EMPTY, rect: rect(12, 0, 14, 11) },
      { kind: 'fill', tile: LADDER, rect: rect(13, 0, 13, 11) },

      // The long open hall (floor on row 16), with one of every block along its floor
      { kind: 'fill', tile: EMPTY, rect: rect(1, 12, 88, 15) },
      { kind: 'blockRow', y: 15, startX: 20, spacing: 2, tiles: blockTiles },
      // A rock tower that falls when its floor is mined out
      { kind: 'fill', tile: ROCK, rect: rect(50, 12, 50, 15) },

      // Ore bed to dig through
      { kind: 'tiles', tile: COPPERIUM, at: [{ x: 6, y: 18 }, { x: 7, y: 18 }, { x: 30, y: 19 }, { x: 31, y: 19 }, { x: 60, y: 20 }, { x: 75, y: 18 }] },
      { kind: 'tiles', tile: SILVERIUM, at: [{ x: 45, y: 21 }, { x: 46, y: 21 }, { x: 82, y: 20 }] },
      { kind: 'tiles', tile: MINERAL, at: [{ x: 14, y: 19 }, { x: 65, y: 18 }, { x: 70, y: 21 }] },
      { kind: 'tiles', tile: CHEST, at: [{ x: 25, y: 20 }, { x: 55, y: 19 }, { x: 85, y: 21 }] },

      // Two surface pools side by side (floor on row 8). Break the shared wall to mix them.
      { kind: 'pool', rect: rect(32, 0, 43, 7), fluidSlot: 0, fillFromY: 1 },
      { kind: 'pool', rect: rect(45, 0, 56, 7), fluidSlot: 1, fillFromY: 1 },
      // Two sealed gas chambers in the ground (hydrogen, then nitrogen: the first two gases in key order) under a
      // two-block roof of dirt. Mine down through the roof to let one out and watch it rise or sink.
      { kind: 'chamber', rect: rect(60, 2, 67, 7), gasSlot: 0 },
      { kind: 'chamber', rect: rect(70, 2, 77, 7), gasSlot: 1 },

      // Pool walls made of different blocks
      { kind: 'fill', tile: ROCK, rect: rect(31, 4, 31, 5) },
      { kind: 'tiles', tile: COPPERIUM, at: [{ x: 31, y: 2 }, { x: 31, y: 3 }] },
      { kind: 'fill', tile: ROCK, rect: rect(44, 3, 44, 4) },
      { kind: 'tiles', tile: SILVERIUM, at: [{ x: 57, y: 2 }, { x: 57, y: 3 }] },
      { kind: 'tiles', tile: MINERAL, at: [{ x: 57, y: 4 }, { x: 57, y: 5 }] },
    ],
    mobs: [
      { kind: 'surfaceDummy', x: 17.5, y: 0 },
      { kind: 'surfaceDummy', x: 27.5, y: 0 },
    ],
  };
}
