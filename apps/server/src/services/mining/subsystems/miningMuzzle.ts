import { MINING_CONFIG, type Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';
import { isSegmentBlocked } from './miningGeometry';

/**
 * Decides where a shot leaves the gun.
 *
 * The server cannot reproduce the exact barrel position (it depends on client sprite scale,
 * arm rotation and weapon art), so it computes an estimate: the shoulder pivot pushed out along
 * the aim direction. A client-reported muzzle is used only when it is close to that estimate and
 * there is no solid tile between the player and the muzzle; otherwise the estimate is used.
 * This keeps bullets visually leaving the barrel while preventing shots from starting behind walls.
 */
export function resolveMuzzlePosition(
  playerPos: Vector2D,
  target: Vector2D,
  grid: ServerMiningGrid,
  clientMuzzle?: Vector2D
): Vector2D {
  const shoulder = { x: playerPos.x, y: playerPos.y - MINING_CONFIG.MELEE_SHOULDER_OFFSET_Y };

  let dx = target.x - shoulder.x;
  let dy = target.y - shoulder.y;
  const len = Math.hypot(dx, dy);
  if (len > 0.001) {
    dx /= len;
    dy /= len;
  } else {
    dx = 1;
    dy = 0;
  }

  const estimate = {
    x: shoulder.x + dx * MINING_CONFIG.GUN_MUZZLE_REACH,
    y: shoulder.y + dy * MINING_CONFIG.GUN_MUZZLE_REACH,
  };

  // The estimate itself must not be behind a wall either: fall back to the shoulder.
  const safeEstimate = isSegmentBlocked(grid, playerPos, estimate) ? { ...shoulder } : estimate;

  if (clientMuzzle) {
    const deviation = Math.hypot(clientMuzzle.x - estimate.x, clientMuzzle.y - estimate.y);
    if (
      deviation <= MINING_CONFIG.GUN_MUZZLE_MAX_DEVIATION &&
      !isSegmentBlocked(grid, playerPos, clientMuzzle)
    ) {
      return { x: clientMuzzle.x, y: clientMuzzle.y };
    }
  }

  return safeEstimate;
}
