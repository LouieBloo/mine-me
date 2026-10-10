import { MINING_CONFIG, isTileSolid, type Vector2D, type MiningTileType } from '../types/mining';
import type { MiningCollisionGrid } from './MiningPhysicsBody';

export interface GridRayHit {
  /** The solid tile that was hit, or null when the ray hit the cavern wall/floor outside the grid. */
  tile: { x: number; y: number } | null;
  /** Where the ray entered the solid cell. */
  point: Vector2D;
  /** How far along the segment the hit is, 0..1. */
  t: number;
}

export interface GridRayOptions {
  /** Return true to ignore a hit (e.g. the shooter's own muzzle clearance). */
  ignore?: (hit: GridRayHit) => boolean;
}

/** Solid for ray purposes: the side walls and floor of the cavern are solid, the sky above row 0 is open. */
function isSolidCell(grid: MiningCollisionGrid, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= MINING_CONFIG.GRID_WIDTH) return ty >= 0;
  if (ty < 0) return false;
  if (ty >= MINING_CONFIG.GRID_HEIGHT) return true;
  const tile = grid[ty]?.[tx] as { type: MiningTileType } | undefined;
  return tile ? isTileSolid(tile.type) : false;
}

/**
 * Exact grid traversal (Amanatides-Woo) from `from` to `to`: returns the first solid cell the segment
 * enters, so a fast mover can never skip over a thin wall. The cell containing `from` is not tested.
 */
export function raycastSolidTiles(
  grid: MiningCollisionGrid,
  from: Vector2D,
  to: Vector2D,
  options: GridRayOptions = {}
): GridRayHit | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (![from.x, from.y, dx, dy].every(Number.isFinite) || (dx === 0 && dy === 0)) return null;

  let cx = Math.floor(from.x);
  let cy = Math.floor(from.y);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? cx + 1 - from.x : from.x - cx) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? cy + 1 - from.y : from.y - cy) * tDeltaY;

  // Bounded by the number of cells the segment can cross.
  const maxSteps = Math.ceil(Math.abs(dx) + Math.abs(dy)) + 2;
  for (let i = 0; i < maxSteps; i++) {
    let t: number;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      cy += stepY;
    }
    if (t > 1) return null;
    if (!isSolidCell(grid, cx, cy)) continue;

    const inGrid = cx >= 0 && cx < MINING_CONFIG.GRID_WIDTH && cy >= 0 && cy < MINING_CONFIG.GRID_HEIGHT;
    const hit: GridRayHit = {
      tile: inGrid ? { x: cx, y: cy } : null,
      point: { x: from.x + dx * t, y: from.y + dy * t },
      t,
    };
    if (!options.ignore?.(hit)) return hit;
  }
  return null;
}
