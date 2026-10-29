import { hash01 } from '../weather/weather';

/**
 * The geometry of the procedural surface art (tickets 130, 131, 134): outlines, cloud puffs and a bolt as plain numbers, so
 * the drawing code stays thin and the shapes can be tested without a canvas.
 */

/** The outline of a scenery layer as polygon points (x, y pairs) in a box `width` x `height`, standing on the bottom edge. Heights are 0 to 1. */
export function silhouettePolygon(heights: readonly number[], width: number, height: number): number[] {
  const n = heights.length;
  if (n < 2) return [0, height, width, height, width, height - height * (heights[0] ?? 1), 0, height - height * (heights[0] ?? 1)];
  const points: number[] = [0, height];
  for (let i = 0; i < n; i++) points.push((i / n) * width, height - heights[i] * height);
  // The last point meets the first one, so the strip tiles
  points.push(width, height - heights[0] * height, width, height);
  return points;
}

/** One soft puff of a cloud, as fractions of the cloud's box (centre and radii). */
export interface CloudPuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** The puffs of cloud variant `variant`: a flat base and a few round tops, different for each variant. */
export function cloudPuffs(variant: number): CloudPuff[] {
  const count = 4 + (Math.abs(Math.floor(variant)) % 3);
  const puffs: CloudPuff[] = [{ x: 0.5, y: 0.68, rx: 0.46, ry: 0.2 }];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const y = 0.55 - Math.sin(t * Math.PI) * (0.18 + hash01(variant, i, 61) * 0.12);
    const rx = 0.12 + hash01(variant, i, 62) * 0.1;
    puffs.push({
      x: 0.22 + t * 0.56,
      y,
      rx,
      ry: Math.min(y * 0.98, 0.1 + hash01(variant, i, 63) * 0.1 + Math.sin(t * Math.PI) * 0.08),
    });
  }
  return puffs;
}

/** A bolt of lightning from (x, top) down to about `bottom`, as points (x, y pairs): a jagged line that wanders left and right. */
export function lightningBolt(seed: number, x: number, top: number, bottom: number, segments = 9, wander = 40): number[] {
  const points: number[] = [x, top];
  let px = x;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    px += (hash01(seed, i, 71) * 2 - 1) * wander;
    points.push(px, top + (bottom - top) * t);
  }
  return points;
}

/** A small side branch off a bolt: from a point on it, a short line going out and down. */
export function boltBranch(seed: number, from: { x: number; y: number }, length: number): number[] {
  const dir = hash01(seed, 5, 72) < 0.5 ? -1 : 1;
  return [from.x, from.y, from.x + dir * length * 0.5, from.y + length * 0.5, from.x + dir * length, from.y + length * 0.9];
}
