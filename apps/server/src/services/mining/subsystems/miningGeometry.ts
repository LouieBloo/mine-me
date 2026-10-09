import { MINING_CONFIG, isTileSolid, type Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';

const SAMPLE_STEP = 0.25;

function isSolidAt(grid: ServerMiningGrid, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= MINING_CONFIG.GRID_WIDTH) return true;
  if (ty < 0) return false; // open sky
  if (ty >= MINING_CONFIG.GRID_HEIGHT) return true;
  const tile = grid[ty]?.[tx];
  return tile ? isTileSolid(tile.type) : false;
}

/** True if any solid tile lies on the segment (the start point is not tested). */
export function isSegmentBlocked(grid: ServerMiningGrid, from: Vector2D, to: Vector2D): boolean {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(dist / SAMPLE_STEP));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (isSolidAt(grid, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) return true;
  }
  return false;
}
