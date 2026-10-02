import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  calculateAttenuation,
  calculatePan,
  calculateSpatialAudio,
} from '../SpatialAudio';
import {
  DEFAULT_SPATIAL_AUDIO_CONFIG,
  MINING_SPATIAL_AUDIO_PRESETS,
} from '../../types/sound';

describe('SpatialAudio', () => {
  describe('calculateDistance', () => {
    it('calculates euclidean distance between two 2D coordinates', () => {
      expect(calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
      expect(calculateDistance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
      expect(calculateDistance({ x: -2, y: -5 }, { x: 1, y: -1 })).toBe(5);
    });
  });

  describe('calculateAttenuation', () => {
    it('returns 1.0 when distance is at or below minDistance', () => {
      expect(calculateAttenuation(0, 2, 16)).toBe(1.0);
      expect(calculateAttenuation(1.5, 2, 16)).toBe(1.0);
      expect(calculateAttenuation(2.0, 2, 16)).toBe(1.0);
    });

    it('returns 0.0 when distance is at or above maxDistance', () => {
      expect(calculateAttenuation(16, 2, 16)).toBe(0.0);
      expect(calculateAttenuation(25, 2, 16)).toBe(0.0);
    });

    it('returns 0.0 if maxDistance <= minDistance', () => {
      expect(calculateAttenuation(5, 10, 5)).toBe(0.0);
    });

    it('calculates linear falloff correctly', () => {
      // Range: 2 to 16 -> midpoint is 9.0
      // t = (9 - 2) / 14 = 0.5 -> volume = 1 - 0.5 = 0.5
      expect(calculateAttenuation(9, 2, 16, 'linear')).toBeCloseTo(0.5);
      // t = (5.5 - 2) / 14 = 0.25 -> volume = 0.75
      expect(calculateAttenuation(5.5, 2, 16, 'linear')).toBeCloseTo(0.75);
    });

    it('calculates quadratic falloff correctly', () => {
      // t = 0.5 -> (1 - 0.5)^2 = 0.25
      expect(calculateAttenuation(9, 2, 16, 'quadratic')).toBeCloseTo(0.25);
    });

    it('calculates smoothstep falloff correctly', () => {
      // t = 0.5 -> 1 - (3 * 0.25 - 2 * 0.125) = 1 - (0.75 - 0.25) = 0.5
      expect(calculateAttenuation(9, 2, 16, 'smoothstep')).toBeCloseTo(0.5);
    });

    it('calculates exponential falloff correctly', () => {
      // t = 0.5 -> exp(-1.5) ≈ 0.2231
      expect(calculateAttenuation(9, 2, 16, 'exponential')).toBeCloseTo(Math.exp(-1.5));
    });
  });

  describe('calculatePan', () => {
    it('returns 0.0 when source is at same horizontal coordinate as listener', () => {
      expect(calculatePan({ x: 5, y: 5 }, { x: 5, y: 12 }, 12)).toBe(0);
    });

    it('returns negative value when source is to the left of listener', () => {
      expect(calculatePan({ x: 10, y: 5 }, { x: 4, y: 5 }, 12)).toBeCloseTo(-0.5);
    });

    it('returns positive value when source is to the right of listener', () => {
      expect(calculatePan({ x: 10, y: 5 }, { x: 16, y: 5 }, 12)).toBeCloseTo(0.5);
    });

    it('clamps pan to -1.0 and 1.0 when beyond panRange', () => {
      expect(calculatePan({ x: 10, y: 5 }, { x: -10, y: 5 }, 12)).toBe(-1.0);
      expect(calculatePan({ x: 10, y: 5 }, { x: 30, y: 5 }, 12)).toBe(1.0);
    });

    it('returns 0 if panRange is 0 or negative', () => {
      expect(calculatePan({ x: 10, y: 5 }, { x: 15, y: 5 }, 0)).toBe(0);
    });
  });

  describe('calculateSpatialAudio', () => {
    it('returns full volume and neutral pan when listener is not provided', () => {
      const result = calculateSpatialAudio(null, { x: 10, y: 10 });
      expect(result.volumeScale).toBe(1.0);
      expect(result.pan).toBe(0.0);
      expect(result.isAudible).toBe(true);
    });

    it('marks sound as inaudible and volume 0 when beyond max distance', () => {
      const listener = { x: 0, y: 0 };
      const distantSource = { x: 25, y: 0 }; // 25 tiles away (max is 16)
      const result = calculateSpatialAudio(listener, distantSource);

      expect(result.distance).toBe(25);
      expect(result.volumeScale).toBe(0.0);
      expect(result.isAudible).toBe(false);
    });

    it('marks sound as audible and 100% volume within min distance', () => {
      const listener = { x: 10, y: 10 };
      const adjacentSource = { x: 11, y: 10 }; // 1 tile away
      const result = calculateSpatialAudio(listener, adjacentSource);

      expect(result.distance).toBe(1);
      expect(result.volumeScale).toBe(1.0);
      expect(result.isAudible).toBe(true);
    });

    it('scales volume and stereo pan appropriately at mid distance', () => {
      const listener = { x: 10, y: 10 };
      const source = { x: 17, y: 10 }; // 7 tiles to the right
      const result = calculateSpatialAudio(listener, source, {
        minDistance: 2,
        maxDistance: 16,
        panRange: 14,
      });

      expect(result.distance).toBe(7);
      // t = (7 - 2) / 14 = 5 / 14 ≈ 0.3571 -> vol = 1 - 5/14 = 9/14 ≈ 0.6428
      expect(result.volumeScale).toBeCloseTo(9 / 14);
      expect(result.pan).toBeCloseTo(7 / 14); // 0.5
      expect(result.isAudible).toBe(true);
    });

    it('disables panning when enablePanning is false', () => {
      const listener = { x: 10, y: 10 };
      const source = { x: 18, y: 10 };
      const result = calculateSpatialAudio(listener, source, { enablePanning: false });

      expect(result.pan).toBe(0.0);
    });

    it('works with BLOCK_MINING preset', () => {
      const listener = { x: 5, y: 5 };
      const mobMiningFar = { x: 25, y: 5 }; // 20 tiles away > 16 maxDistance
      const resultFar = calculateSpatialAudio(
        listener,
        mobMiningFar,
        MINING_SPATIAL_AUDIO_PRESETS.BLOCK_MINING
      );
      expect(resultFar.isAudible).toBe(false);
      expect(resultFar.volumeScale).toBe(0.0);

      const mobMiningNear = { x: 7, y: 5 }; // 2 tiles away <= minDistance (2)
      const resultNear = calculateSpatialAudio(
        listener,
        mobMiningNear,
        MINING_SPATIAL_AUDIO_PRESETS.BLOCK_MINING
      );
      expect(resultNear.isAudible).toBe(true);
      expect(resultNear.volumeScale).toBe(1.0);
    });
  });
});
