import { raycastSolidTiles, type Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';

/** True if any solid tile lies on the segment (the start point is not tested). */
export function isSegmentBlocked(grid: ServerMiningGrid, from: Vector2D, to: Vector2D): boolean {
  return raycastSolidTiles(grid, from, to) !== null;
}
