import type { ItemLightConfig } from '@mine-me/shared';
import type { LightSource } from './LightSource';
import { PointLight } from './PointLight';
import { SpotLight } from './SpotLight';

/** Parses a hex string ("#fbbf24") or number colour; falls back to warm gold. */
export function parseLightColor(color?: string | number): number {
  if (typeof color === 'number') return color;
  if (typeof color === 'string') {
    const parsed = parseInt(color.replace('#', ''), 16);
    if (!isNaN(parsed)) return parsed;
  }
  return 0xfbbf24;
}

/**
 * Builds the light described by an item's light config (the one shape used for ground and held
 * lights), at a position in tile coordinates.
 */
export function createItemLight(id: string, config: ItemLightConfig, x: number, y: number): LightSource {
  const color = parseLightColor(config.color);
  const radius = Math.max(0.5, config.radius ?? 1.8);
  const intensity = Math.max(0.05, config.intensity ?? 0.5);

  if (config.type === 'SPOT') {
    const rad = ((config.spotAngle ?? 90) * Math.PI) / 180;
    return new SpotLight(id, { x, y }, { x: Math.cos(rad), y: Math.sin(rad) }, color, intensity, radius, config.spotConeAngle ?? 45);
  }

  let options:
    | {
        flicker?: { speed: number; amount: number };
        pulse?: { speed: number; minIntensity: number; maxIntensity: number };
      }
    | undefined;
  if (config.effect === 'PULSE') {
    options = {
      pulse: {
        speed: config.pulseSpeed ?? 2.5,
        minIntensity: config.minIntensity ?? Math.max(0.05, intensity * 0.6),
        maxIntensity: config.maxIntensity ?? intensity * 1.3,
      },
    };
  } else if (config.effect === 'FLICKER') {
    options = { flicker: { speed: config.flickerSpeed ?? 12, amount: config.flickerAmount ?? 0.2 } };
  }
  return new PointLight(id, { x, y }, color, intensity, radius, options);
}
