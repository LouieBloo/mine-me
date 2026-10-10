import { MINING_CONFIG } from '../types/mining';
import type { Vector2D } from '../types/mining';

/**
 * Whether something at `position` is close enough to `center` (a player) to be worth telling that
 * player about. The box is slightly larger for things the client already knows (`wasInterested`),
 * so an entity wandering along the edge does not flicker in and out of existence.
 */
export function isInInterest(center: Vector2D, position: Vector2D, wasInterested = false): boolean {
  const slack = wasInterested ? MINING_CONFIG.INTEREST_HYSTERESIS : 0;
  return (
    Math.abs(position.x - center.x) <= MINING_CONFIG.INTEREST_RADIUS_X + slack &&
    Math.abs(position.y - center.y) <= MINING_CONFIG.INTEREST_RADIUS_Y + slack
  );
}

/** Rounds to 1/100 (tiles, tiles/s): plenty for drawing, and about a third of the bytes of a raw float. */
export function roundWire(n: number): number {
  return Math.round(n * 100) / 100;
}
