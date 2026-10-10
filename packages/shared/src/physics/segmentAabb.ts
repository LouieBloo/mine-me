import type { Vector2D } from '../types/mining';

/**
 * Swept test of a moving circle (a bullet) against an axis-aligned box: the segment `from`->`to` is
 * tested against the box grown by `radius` on every side (Minkowski sum; corners are squared off,
 * which is the usual slightly generous approximation).
 *
 * Returns the fraction 0..1 along the segment where it first touches the box, or null if it never does.
 * A segment that starts inside the box returns 0.
 */
export function segmentAabbEntryTime(
  from: Vector2D,
  to: Vector2D,
  center: Vector2D,
  halfWidth: number,
  halfHeight: number,
  radius = 0
): number | null {
  const minX = center.x - halfWidth - radius;
  const maxX = center.x + halfWidth + radius;
  const minY = center.y - halfHeight - radius;
  const maxY = center.y + halfHeight + radius;
  if (![from.x, from.y, to.x, to.y, minX, maxX, minY, maxY].every(Number.isFinite)) return null;

  let tEnter = 0;
  let tExit = 1;
  const axes: Array<[number, number, number, number]> = [
    [from.x, to.x - from.x, minX, maxX],
    [from.y, to.y - from.y, minY, maxY],
  ];
  for (const [start, delta, lo, hi] of axes) {
    if (delta === 0) {
      if (start < lo || start > hi) return null;
      continue;
    }
    let t1 = (lo - start) / delta;
    let t2 = (hi - start) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tEnter = Math.max(tEnter, t1);
    tExit = Math.min(tExit, t2);
    if (tEnter > tExit) return null;
  }
  return tEnter;
}
