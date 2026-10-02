import type { Vector2D } from '../types/mining';
import {
  type AudioFalloffModel,
  type SpatialAudioConfig,
  type SpatialAudioCalculation,
  DEFAULT_SPATIAL_AUDIO_CONFIG,
} from '../types/sound';

/**
 * Calculates euclidean distance between two 2D coordinates.
 */
export function calculateDistance(a: Vector2D, b: Vector2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates volume attenuation factor in the range [0.0, 1.0] based on distance.
 */
export function calculateAttenuation(
  distance: number,
  minDistance: number,
  maxDistance: number,
  model: AudioFalloffModel = 'linear'
): number {
  if (maxDistance <= minDistance) {
    return 0.0;
  }
  if (distance <= minDistance) {
    return 1.0;
  }
  if (distance >= maxDistance) {
    return 0.0;
  }

  const range = maxDistance - minDistance;
  const t = Math.max(0, Math.min(1, (distance - minDistance) / range));

  switch (model) {
    case 'quadratic':
      return (1.0 - t) * (1.0 - t);
    case 'smoothstep':
      // 1 - Hermite smoothstep (3t^2 - 2t^3)
      return 1.0 - (3 * t * t - 2 * t * t * t);
    case 'exponential':
      // Steep initial drop-off with smooth tail
      return Math.exp(-3 * t);
    case 'linear':
    default:
      return 1.0 - t;
  }
}

/**
 * Calculates stereo panning value in the range [-1.0 (left), 1.0 (right)]
 * based on horizontal distance relative to the listener.
 */
export function calculatePan(
  listener: Vector2D,
  source: Vector2D,
  panRange: number = DEFAULT_SPATIAL_AUDIO_CONFIG.panRange
): number {
  if (panRange <= 0) return 0;
  const dx = source.x - listener.x;
  return Math.max(-1.0, Math.min(1.0, dx / panRange));
}

/**
 * Computes complete spatial audio properties (attenuated volume, stereo pan,
 * distance, audibility) between a sound emitter source and a listener (player).
 */
export function calculateSpatialAudio(
  listener: Vector2D | null | undefined,
  source: Vector2D,
  config?: SpatialAudioConfig
): SpatialAudioCalculation {
  if (!listener) {
    return {
      volumeScale: 1.0,
      pan: 0.0,
      distance: 0,
      isAudible: true,
    };
  }

  const minDistance = config?.minDistance ?? DEFAULT_SPATIAL_AUDIO_CONFIG.minDistance;
  const maxDistance = config?.maxDistance ?? DEFAULT_SPATIAL_AUDIO_CONFIG.maxDistance;
  const model = config?.falloffModel ?? DEFAULT_SPATIAL_AUDIO_CONFIG.falloffModel;
  const panRange = config?.panRange ?? DEFAULT_SPATIAL_AUDIO_CONFIG.panRange;
  const enablePanning = config?.enablePanning ?? DEFAULT_SPATIAL_AUDIO_CONFIG.enablePanning;

  const distance = calculateDistance(listener, source);

  if (distance >= maxDistance) {
    return {
      volumeScale: 0.0,
      pan: 0.0,
      distance,
      isAudible: false,
    };
  }

  const volumeScale = calculateAttenuation(distance, minDistance, maxDistance, model);
  const pan = enablePanning ? calculatePan(listener, source, panRange) : 0.0;

  return {
    volumeScale,
    pan,
    distance,
    isAudible: volumeScale > 0.001,
  };
}
