import type { DoodadAnchor, DoodadPartDef } from '../../types/doodad';

/**
 * Where a doodad's picture goes (ticket 102), as plain numbers so the game and the admin preview agree and it can be tested
 * without a screen. The picture is fitted inside the footprint with its aspect kept, and its base sits on the edge the doodad
 * is anchored to: bottom-centre of a FLOOR footprint, top-centre of a CEILING one, the wall edge (middle) of a WALL one, the
 * middle of an AIR one.
 */
export interface DoodadSize {
  width: number;
  height: number;
}

export interface DoodadFootprint {
  /** Top-left cell, and size in cells. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DoodadLayout {
  /** The base point in world pixels: the picture hangs off it, and motion turns about it. */
  anchorX: number;
  anchorY: number;
  /** The base point as a fraction of the picture, so it can be a sprite's `anchor`. */
  originX: number;
  originY: number;
  /** The picture drawn at this size, in pixels. */
  drawWidth: number;
  drawHeight: number;
  /** -1 to mirror the picture (a WALL doodad whose wall is on the right), else 1. */
  mirror: 1 | -1;
}

/** The base point of a footprint, as a fraction of it, for an anchor (before any mirror). */
export function doodadBasePoint(anchor: DoodadAnchor): { x: number; y: number } {
  switch (anchor) {
    case 'FLOOR':
      return { x: 0.5, y: 1 };
    case 'CEILING':
      return { x: 0.5, y: 0 };
    case 'WALL':
      return { x: 0, y: 0.5 };
    case 'AIR':
      return { x: 0.5, y: 0.5 };
  }
}

/** How a picture of `image` size is laid out in a footprint of `tileSize`-pixel cells. A wall doodad is mirrored when `flip`. */
export function layoutDoodad(anchor: DoodadAnchor, footprint: DoodadFootprint, image: DoodadSize, flip: boolean, tileSize: number): DoodadLayout {
  const boxW = footprint.width * tileSize;
  const boxH = footprint.height * tileSize;
  const fit = Math.min(boxW / Math.max(1, image.width), boxH / Math.max(1, image.height));
  const base = doodadBasePoint(anchor);
  const mirror = anchor === 'WALL' && flip ? -1 : 1;
  // A mirrored wall doodad hangs off the right edge instead of the left
  const baseX = mirror === -1 ? 1 : base.x;
  return {
    anchorX: footprint.x * tileSize + baseX * boxW,
    anchorY: footprint.y * tileSize + base.y * boxH,
    originX: base.x,
    originY: base.y,
    drawWidth: image.width * fit,
    drawHeight: image.height * fit,
    mirror,
  };
}

/** One part of a doodad placed in world pixels. */
export interface DoodadPartLayout {
  name: string;
  /** Where the part's pivot is, in world pixels. */
  x: number;
  y: number;
  /** The pivot as a fraction of the part's picture. */
  pivotX: number;
  pivotY: number;
  width: number;
  height: number;
  zIndex: number;
}

/** The box that holds all the parts together, in the parts' own pixels, relative to the doodad's anchor point. */
export function doodadPartsBounds(parts: readonly DoodadPartDef[]): { left: number; top: number; right: number; bottom: number } {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of parts) {
    const x = p.offset_from_anchor[0] - p.pivot_anchor[0];
    const y = p.offset_from_anchor[1] - p.pivot_anchor[1];
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + p.width);
    bottom = Math.max(bottom, y + p.height);
  }
  return { left, top, right, bottom };
}

/**
 * Places the parts of a doodad. They are treated as one picture: the box that holds them is fitted into the footprint (as
 * `layoutDoodad` does for a single image) with its base on the anchored edge, and each part keeps its place in that box.
 */
export function layoutDoodadParts(
  anchor: DoodadAnchor,
  footprint: DoodadFootprint,
  parts: readonly DoodadPartDef[],
  flip: boolean,
  tileSize: number
): { layout: DoodadLayout; scale: number; parts: DoodadPartLayout[] } {
  const bounds = doodadPartsBounds(parts);
  const image = { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
  const layout = layoutDoodad(anchor, footprint, image, flip, tileSize);
  const scale = layout.drawWidth / Math.max(1, image.width);
  const base = doodadBasePoint(anchor);
  // The base point inside the parts' box, in the parts' own pixels
  const baseInBoxX = bounds.left + base.x * image.width;
  const baseInBoxY = bounds.top + base.y * image.height;
  return {
    layout,
    scale,
    parts: parts.map((p) => ({
      name: p.name,
      x: layout.anchorX + layout.mirror * (p.offset_from_anchor[0] - baseInBoxX) * scale,
      y: layout.anchorY + (p.offset_from_anchor[1] - baseInBoxY) * scale,
      pivotX: p.pivot_anchor[0] / p.width,
      pivotY: p.pivot_anchor[1] / p.height,
      width: p.width * scale,
      height: p.height * scale,
      zIndex: p.z_index,
    })),
  };
}
