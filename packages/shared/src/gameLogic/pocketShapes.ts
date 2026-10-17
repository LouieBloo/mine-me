import { POCKET_SHAPES, resolveShapeWeights, type PocketShape, type PocketShapeWeights } from '../types/fluid';

/** One cell of a pocket, relative to the pocket's top-left corner (so x and y are never negative). */
export interface PocketCell {
  x: number;
  y: number;
}

/** A pocket outline: its cells (always one connected region) and the box around them. */
export interface PocketOutline {
  shape: PocketShape;
  cells: PocketCell[];
  width: number;
  height: number;
}

/** Random numbers in [0, 1). */
export type Rng = () => number;

const between = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

/** How far a vein may wander, as a multiple of the largest pocket side: stops one vein crossing the map. */
export const VEIN_REACH = 3;

/** Picks a shape by weight. */
export function pickPocketShape(weights: PocketShapeWeights | null | undefined, rng: Rng): PocketShape {
  const resolved = resolveShapeWeights(weights);
  const total = POCKET_SHAPES.reduce((sum, shape) => sum + resolved[shape], 0);
  let roll = rng() * total;
  for (const shape of POCKET_SHAPES) {
    roll -= resolved[shape];
    if (roll < 0) return shape;
  }
  return POCKET_SHAPES[POCKET_SHAPES.length - 1];
}

function box(shape: PocketShape, width: number, height: number): PocketOutline {
  const cells: PocketCell[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push({ x, y });
  return { shape, cells, width, height };
}

/**
 * Grows a vein of exactly `count` cells: a random walk that mostly keeps its heading, bends now and then, and
 * sometimes starts a branch from a cell it already has. Every new cell touches an old one, so the vein is one
 * connected region by construction; it is kept within `reach` cells of where it started on each axis.
 */
function vein(count: number, reach: number, rng: Rng): PocketOutline {
  const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const cells: PocketCell[] = [{ x: 0, y: 0 }];
  const have = new Set<string>(['0,0']);
  let walker = { x: 0, y: 0, heading: Math.floor(rng() * 4) };
  let stuck = 0;

  while (cells.length < count && stuck < 200) {
    if (rng() < 0.15) {
      // Branch: carry on from any cell already in the vein, in a fresh direction
      const from = cells[Math.floor(rng() * cells.length)];
      walker = { x: from.x, y: from.y, heading: Math.floor(rng() * 4) };
    } else if (rng() < 0.3) {
      walker.heading = Math.floor(rng() * 4);
    }
    const [dx, dy] = DIRECTIONS[walker.heading];
    const x = walker.x + dx;
    const y = walker.y + dy;
    if (Math.abs(x) > reach || Math.abs(y) > reach) {
      walker.heading = Math.floor(rng() * 4);
      stuck++;
      continue;
    }
    walker.x = x;
    walker.y = y;
    const key = `${x},${y}`;
    if (have.has(key)) {
      stuck++;
      continue;
    }
    stuck = 0;
    have.add(key);
    cells.push({ x, y });
  }

  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const shifted = cells.map((c) => ({ x: c.x - minX, y: c.y - minY }));
  return {
    shape: 'VEIN',
    cells: shifted,
    width: Math.max(...shifted.map((c) => c.x)) + 1,
    height: Math.max(...shifted.map((c) => c.y)) + 1,
  };
}

/**
 * Draws the outline of one pocket. Sides are between `minSize` and `maxSize`: a square has one side, a rectangle draws
 * its width and height separately, and a vein has as many cells as a square of a drawn side would (so the amount of
 * fluid per pocket stays about the same whatever the shape). Always one connected region.
 */
export function generatePocketOutline(shape: PocketShape, minSize: number, maxSize: number, rng: Rng): PocketOutline {
  switch (shape) {
    case 'SQUARE': {
      const side = between(rng, minSize, maxSize);
      return box('SQUARE', side, side);
    }
    case 'RECTANGLE':
      return box('RECTANGLE', between(rng, minSize, maxSize), between(rng, minSize, maxSize));
    case 'VEIN': {
      const side = between(rng, minSize, maxSize);
      return vein(side * side, Math.max(2, maxSize * VEIN_REACH), rng);
    }
  }
}

/** True when every cell can be reached from the first through cells that touch along an edge. */
export function isConnected(cells: readonly PocketCell[]): boolean {
  if (cells.length === 0) return true;
  const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
  const seen = new Set<string>();
  const queue = [cells[0]];
  seen.add(`${cells[0].x},${cells[0].y}`);
  while (queue.length > 0) {
    const { x, y } = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (keys.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push({ x: x + dx, y: y + dy });
      }
    }
  }
  return seen.size === keys.size;
}
