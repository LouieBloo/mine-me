import { hash01 } from './weather';

/**
 * The clouds (ticket 131): where each one is is a pure function of the seed and the time, so every client shows the same sky
 * without being told. The weather sets how many show and how dark they are.
 */

/** The most clouds a sky ever holds. */
export const MAX_CLOUDS = 24;
/** How wide the cloud sky is before it wraps round, in pixels. */
export const CLOUD_PERIOD_PX = 3600;

export interface CloudSpec {
  /** The cloud shows when the weather's density is above this (0 to 1). */
  threshold: number;
  /** Where it starts along the period, 0 to 1. */
  x0: number;
  /** Where in the cloud height band, 0 (low) to 1 (high). */
  y: number;
  /** Drift in pixels per second. */
  speed: number;
  /** Size multiplier. */
  scale: number;
  /** Which picture it uses (an index; the caller wraps it by the number of pictures). */
  variant: number;
  /** How the cloud moves against the camera, like a scenery layer (0 = with the terrain, 1 = fixed on screen). */
  parallax: number;
}

/** The clouds a seed makes, `count` of them. The first ones are the ones that show in thin cloud cover. */
export function cloudSpecs(seed: number, count: number): CloudSpec[] {
  const n = Math.max(0, Math.min(MAX_CLOUDS, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => ({
    threshold: n === 1 ? 0 : i / n,
    x0: hash01(seed, i, 21),
    y: hash01(seed, i, 22),
    speed: 6 + hash01(seed, i, 23) * 14,
    scale: 0.7 + hash01(seed, i, 24) * 0.9,
    variant: Math.floor(hash01(seed, i, 25) * 1000),
    parallax: 0.55 + hash01(seed, i, 26) * 0.3,
  }));
}

/** How visible a cloud is for a cover (0 to 1): it fades in over a tenth of the cover above its threshold. */
export function cloudAlpha(cloud: Pick<CloudSpec, 'threshold'>, density: number): number {
  return Math.min(1, Math.max(0, (density - cloud.threshold) / 0.1));
}

/** Where a cloud is along the period at a time, 0 to the period (it wraps round). */
export function cloudX(cloud: Pick<CloudSpec, 'x0' | 'speed'>, t: number, period: number = CLOUD_PERIOD_PX): number {
  const x = (cloud.x0 * period + cloud.speed * Math.max(0, t)) % period;
  return x < 0 ? x + period : x;
}
