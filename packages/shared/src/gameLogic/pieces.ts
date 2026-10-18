import { BLOCK_SCALE, MiningTileType, type MiningPosition } from '../types/mining';

/** How many cells a placed thing covers. Most tiles are one cell; placeables are pieces of several. */
export interface TileFootprint {
  width: number;
  height: number;
}

/**
 * A cell's place inside its piece: [column, row] counted from the piece's top-left cell (the anchor). Only
 * cells of a piece carry one; it is how the client knows which slice of the art a cell shows, and how the
 * server finds the rest of a piece when any one cell is destroyed.
 */
export type PieceOffset = [ox: number, oy: number];

/**
 * Placeables keep the size they had before blocks were shrunk: one original block, which is BLOCK_SCALE
 * cells each way. Adding a new placeable piece is one line here (and in PLACED_ITEM_TILES).
 */
const PIECE_FOOTPRINTS: Partial<Record<MiningTileType, TileFootprint>> = {
  [MiningTileType.LADDER]: { width: BLOCK_SCALE, height: BLOCK_SCALE },
  [MiningTileType.TORCH]: { width: BLOCK_SCALE, height: BLOCK_SCALE },
  [MiningTileType.BRIDGE]: { width: BLOCK_SCALE, height: BLOCK_SCALE },
};

const SINGLE_CELL: TileFootprint = { width: 1, height: 1 };

/** The footprint of a tile type; 1x1 unless it is a piece. */
export function getTileFootprint(type: MiningTileType): TileFootprint {
  return PIECE_FOOTPRINTS[type] ?? SINGLE_CELL;
}

/** Whether tiles of this type are placed as multi-cell pieces. */
export function isPieceType(type: MiningTileType): boolean {
  return type in PIECE_FOOTPRINTS;
}

/** Every cell a piece covers when its top-left cell is `anchor`, with each cell's offset. */
export function pieceCells(anchor: MiningPosition, footprint: TileFootprint): (MiningPosition & { offset: PieceOffset })[] {
  const cells: (MiningPosition & { offset: PieceOffset })[] = [];
  for (let oy = 0; oy < footprint.height; oy++) {
    for (let ox = 0; ox < footprint.width; ox++) cells.push({ x: anchor.x + ox, y: anchor.y + oy, offset: [ox, oy] });
  }
  return cells;
}

/** The cell where a piece's light and heat come from: the middle of its footprint. */
export function pieceCentreCell(anchor: MiningPosition, footprint: TileFootprint): MiningPosition {
  return { x: anchor.x + Math.floor(footprint.width / 2), y: anchor.y + Math.floor(footprint.height / 2) };
}

/** Centre of a piece in tile units, for reach checks and effects. */
export function pieceCentre(anchor: MiningPosition, footprint: TileFootprint): { x: number; y: number } {
  return { x: anchor.x + footprint.width / 2, y: anchor.y + footprint.height / 2 };
}

/**
 * Where a piece goes when the player points at `cursor`. The cursor is the middle of the piece; if that spot
 * does not fit, the piece is nudged to the nearest anchor that still covers the cursor cell and fits (the
 * footprint-centre closest to the cursor wins, ties go to the lower-left anchor, so the answer is stable).
 * `fits(x, y)` says whether one cell can take the piece. Returns the top-left cell, or null if nothing fits.
 */
export function findPieceAnchor(
  cursor: MiningPosition,
  footprint: TileFootprint,
  fits: (x: number, y: number) => boolean
): MiningPosition | null {
  const candidates: { anchor: MiningPosition; distance: number }[] = [];
  for (let ay = cursor.y - footprint.height + 1; ay <= cursor.y; ay++) {
    for (let ax = cursor.x - footprint.width + 1; ax <= cursor.x; ax++) {
      const centre = pieceCentre({ x: ax, y: ay }, footprint);
      candidates.push({ anchor: { x: ax, y: ay }, distance: Math.hypot(centre.x - (cursor.x + 0.5), centre.y - (cursor.y + 0.5)) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || b.anchor.y - a.anchor.y || a.anchor.x - b.anchor.x);
  for (const { anchor } of candidates) {
    if (pieceCells(anchor, footprint).every((c) => fits(c.x, c.y))) return anchor;
  }
  return null;
}

/** The anchor of the piece a cell belongs to, given the cell's recorded offset. */
export function pieceAnchorOf(x: number, y: number, offset: PieceOffset): MiningPosition {
  return { x: x - offset[0], y: y - offset[1] };
}

/** The top-left cell of the piece a tile cell belongs to; a tile with no offset is its own piece. */
export function pieceOrigin(x: number, y: number, offset: PieceOffset | undefined): MiningPosition {
  return offset ? pieceAnchorOf(x, y, offset) : { x, y };
}

/**
 * Whether a cell is the one that owns its piece's light and effects (the middle cell), so a torch lights the
 * cavern once and not once per cell. A tile with no offset owns its own.
 */
export function isPieceCentreCell(offset: PieceOffset | undefined, footprint: TileFootprint): boolean {
  return !offset || (offset[0] === Math.floor(footprint.width / 2) && offset[1] === Math.floor(footprint.height / 2));
}
