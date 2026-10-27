import { doodadSizeChoices, type DoodadAnchor, type DoodadDefinition } from '../../types/doodad';

/**
 * Where a doodad stands in the mine (tickets 100, 101, 105), shared by the generator, the room and the client.
 *
 * A placement is the doodad's kind (`typeIndex`, an index into the definitions sent with the map), the top-left cell
 * of its footprint, which size it took (`variant`, an index into `doodadSizeChoices`) and, for a wall doodad, which
 * side its wall is on. Nothing else is stored: the size comes from the definition, the animation phase from the cell.
 */
export interface DoodadPlacement {
  typeIndex: number;
  /** Top-left cell of the footprint. Unique: two doodads never overlap. */
  x: number;
  y: number;
  /** Index into the doodad's size choices (0 when it has one size). */
  variant: number;
  /** WALL only: false = the wall is to the left of the footprint (the picture faces right), true = to the right (mirrored). */
  flip: boolean;
}

/**
 * A placement on the wire: `[typeIndex, x, y, variant]`, plus a fifth `1` only for a mirrored wall doodad (the common
 * case costs four numbers).
 */
export type DoodadPlacementWire = [typeIndex: number, x: number, y: number, variant: number] | [typeIndex: number, x: number, y: number, variant: number, flip: 1];

/** A doodad that is gone, by the top-left cell of its footprint: `[x, y]`. */
export type DoodadRemovalWire = [x: number, y: number];

export interface DoodadRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DoodadCell {
  x: number;
  y: number;
}

export const encodeDoodadPlacement = (p: DoodadPlacement): DoodadPlacementWire =>
  p.flip ? [p.typeIndex, p.x, p.y, p.variant, 1] : [p.typeIndex, p.x, p.y, p.variant];

export const decodeDoodadPlacement = (wire: DoodadPlacementWire): DoodadPlacement => ({
  typeIndex: wire[0],
  x: wire[1],
  y: wire[2],
  variant: wire[3],
  flip: wire.length === 5 && wire[4] === 1,
});

/** The size the placement took: its variant of the doodad's size choices (a variant out of range falls back to the first). */
export function doodadPlacedSize(doodad: Pick<DoodadDefinition, 'width' | 'height' | 'sizeVariants'>, variant: number): { width: number; height: number } {
  const choices = doodadSizeChoices(doodad);
  const choice = choices[variant] ?? choices[0];
  return { width: choice.width, height: choice.height };
}

/** The footprint of a placement. */
export function doodadRect(doodad: Pick<DoodadDefinition, 'width' | 'height' | 'sizeVariants'>, placement: Pick<DoodadPlacement, 'x' | 'y' | 'variant'>): DoodadRect {
  return { x: placement.x, y: placement.y, ...doodadPlacedSize(doodad, placement.variant) };
}

/** Every cell of a footprint, row by row. */
export function doodadRectCells(rect: DoodadRect): DoodadCell[] {
  const cells: DoodadCell[] = [];
  for (let dy = 0; dy < rect.height; dy++) for (let dx = 0; dx < rect.width; dx++) cells.push({ x: rect.x + dx, y: rect.y + dy });
  return cells;
}

/**
 * The cells a doodad hangs from or stands on, which must all stay solid: the row under a FLOOR doodad, the row over a
 * CEILING one, the column beside a WALL one (left, or right when `flip`). A free-floating (AIR) doodad has none.
 */
export function doodadSupportCells(anchor: DoodadAnchor, rect: DoodadRect, flip: boolean): DoodadCell[] {
  const cells: DoodadCell[] = [];
  switch (anchor) {
    case 'FLOOR':
      for (let dx = 0; dx < rect.width; dx++) cells.push({ x: rect.x + dx, y: rect.y + rect.height });
      break;
    case 'CEILING':
      for (let dx = 0; dx < rect.width; dx++) cells.push({ x: rect.x + dx, y: rect.y - 1 });
      break;
    case 'WALL':
      for (let dy = 0; dy < rect.height; dy++) cells.push({ x: flip ? rect.x + rect.width : rect.x - 1, y: rect.y + dy });
      break;
    case 'AIR':
      break;
  }
  return cells;
}

/** A number that names a cell of a map `width` wide. */
export const doodadCellKey = (x: number, y: number, width: number): number => y * width + x;

/**
 * The doodads in the order everything agrees on: by key, so a placement's `typeIndex` means the same doodad to the
 * generator, the room and the client whatever order the database returned them in.
 */
export function orderDoodads<T extends { key: string }>(doodads: readonly T[]): T[] {
  return [...doodads].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * A doodad falling through the air (ticket 143), as [id, typeIndex, variant, flip (0 or 1), x, y]: x and y are the top-left of
 * its footprint in cells, with fractions. Sent every tick to players who can see it; one that disappears from the list has landed.
 */
export type FallingDoodadWire = [id: number, typeIndex: number, variant: number, flip: 0 | 1, x: number, y: number];

/** Where a falling doodad landed and broke up, as [typeIndex, variant, flip (0 or 1), x, y]: x and y the top-left of its footprint in cells. */
export type DoodadShatterWire = [typeIndex: number, variant: number, flip: 0 | 1, x: number, y: number];
