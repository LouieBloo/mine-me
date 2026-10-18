import { getTileFootprint, pieceCells, type MiningClientTile, type MiningPosition, type MiningTileType, type PieceOffset } from '@mine-me/shared';

/** One cell changed by a placement, in the shape the tile renderer takes. */
export interface PlacedCell {
  x: number;
  y: number;
  type: MiningTileType;
  piece: PieceOffset;
}

/**
 * Shows a placed piece at once, before the server's tick confirms it: every cell of the footprint at `anchor`
 * becomes the placed type with its place in the piece. Returns the changed cells so they can be redrawn.
 * The server's own tile updates overwrite these a moment later, so a wrong guess corrects itself.
 */
export function applyPlacedPiece(grid: MiningClientTile[][], type: MiningTileType, anchor: MiningPosition): PlacedCell[] {
  const changed: PlacedCell[] = [];
  for (const cell of pieceCells(anchor, getTileFootprint(type))) {
    const tile = grid[cell.y]?.[cell.x];
    if (!tile) continue;
    tile.type = type;
    tile.revealed = true;
    tile.damageStage = 0;
    tile.piece = cell.offset;
    changed.push({ x: cell.x, y: cell.y, type, piece: cell.offset });
  }
  return changed;
}
