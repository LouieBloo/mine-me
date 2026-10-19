import { describe, it, expect } from 'vitest';
import { BLOCK_SCALE, MiningTileType } from '../types/mining';
import { findPieceAnchor, getTileFootprint, pieceFootprint, isPieceType, pieceAnchorOf, isPieceCentreCell, pieceCells, pieceCentre, pieceOrigin, pieceCentreCell } from './pieces';

const S = BLOCK_SCALE;
const square = { width: S, height: S };

describe('footprints', () => {
  it('are BLOCK_SCALE x BLOCK_SCALE for placeables and one cell for everything else', () => {
    for (const type of [MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE]) {
      expect(getTileFootprint(type)).toEqual(square);
      expect(isPieceType(type)).toBe(true);
    }
    expect(getTileFootprint(MiningTileType.DIRT)).toEqual({ width: 1, height: 1 });
    expect(isPieceType(MiningTileType.DIRT)).toBe(false);
  });

  it('lists every cell once with its offset, and an offset leads back to the anchor', () => {
    const cells = pieceCells({ x: 10, y: 20 }, square);
    expect(cells).toHaveLength(S * S);
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(S * S);
    for (const c of cells) expect(pieceAnchorOf(c.x, c.y, c.offset)).toEqual({ x: 10, y: 20 });
  });

  it('has its centre cell inside the footprint, at the middle', () => {
    expect(pieceCentreCell({ x: 10, y: 20 }, square)).toEqual({ x: 10 + Math.floor(S / 2), y: 20 + Math.floor(S / 2) });
    expect(pieceCentre({ x: 10, y: 20 }, square)).toEqual({ x: 10 + S / 2, y: 20 + S / 2 });
  });
});

describe('findPieceAnchor', () => {
  const half = Math.floor(S / 2);

  it('centres the piece on the cursor when everything fits', () => {
    expect(findPieceAnchor({ x: 50, y: 50 }, square, () => true)).toEqual({ x: 50 - half, y: 50 - half });
  });

  it('nudges to the nearest anchor that still covers the cursor cell and fits', () => {
    // Nothing left of the cursor column is free: the piece slides right so the cursor is on its left edge
    const anchor = findPieceAnchor({ x: 50, y: 50 }, square, (x) => x >= 50);
    expect(anchor).toEqual({ x: 50, y: 50 - half });
  });

  it('returns null when no placement that covers the cursor fits', () => {
    expect(findPieceAnchor({ x: 50, y: 50 }, square, (x) => x === 50)).toBe(null);
    if (S > 1) expect(findPieceAnchor({ x: 50, y: 50 }, square, (x, y) => !(x === 50 && y === 50))).toBe(null);
  });

  it('is stable: the same answer for the same input', () => {
    const fits = (x: number, y: number) => y <= 50;
    expect(findPieceAnchor({ x: 7, y: 50 }, square, fits)).toEqual(findPieceAnchor({ x: 7, y: 50 }, square, fits));
  });
});

describe('piece owners', () => {
  it('exactly one cell of a piece is its centre, and every cell finds the same origin', () => {
    const cells = pieceCells({ x: 10, y: 20 }, square);
    expect(cells.filter((c) => isPieceCentreCell(c.offset, square))).toHaveLength(1);
    for (const c of cells) expect(pieceOrigin(c.x, c.y, c.offset)).toEqual({ x: 10, y: 20 });
  });

  it('a tile with no offset is its own origin and owns its own effects', () => {
    expect(pieceOrigin(4, 5, undefined)).toEqual({ x: 4, y: 5 });
    expect(isPieceCentreCell(undefined, square)).toBe(true);
  });
});

describe('pieces whose size is recorded on each cell', () => {
  it('pieceCells records the size only when asked, so fixed-size pieces keep their two-number offsets', () => {
    expect(pieceCells({ x: 5, y: 5 }, { width: 2, height: 1 })[1].offset).toEqual([1, 0]);
    expect(pieceCells({ x: 5, y: 5 }, { width: 2, height: 1 }, true).map((c) => c.offset)).toEqual([[0, 0, 2, 1], [1, 0, 2, 1]]);
  });

  it('pieceFootprint reads the recorded size, else the type\'s own', () => {
    expect(pieceFootprint(MiningTileType.ROCK, [1, 0, 3, 2])).toEqual({ width: 3, height: 2 });
    expect(pieceFootprint(MiningTileType.ROCK, undefined)).toEqual({ width: 1, height: 1 });
    expect(pieceFootprint(MiningTileType.LADDER, [1, 1])).toEqual(getTileFootprint(MiningTileType.LADDER));
  });

  it('the anchor of a sized piece comes from any of its cells', () => {
    for (const cell of pieceCells({ x: 7, y: 9 }, { width: 3, height: 3 }, true)) {
      expect(pieceOrigin(cell.x, cell.y, cell.offset)).toEqual({ x: 7, y: 9 });
    }
  });
});
