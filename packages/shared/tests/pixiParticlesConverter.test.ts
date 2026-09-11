import { describe, it, expect } from 'vitest';
import { convertPixiParticlesConfig } from '../src/utils/pixiParticlesConverter';
import type { ParticleEffectConfig } from '../src/types/particles';

describe('convertPixiParticlesConfig', () => {
  it('throws an error for invalid input', () => {
    expect(() => convertPixiParticlesConfig(null)).toThrow();
    expect(() => convertPixiParticlesConfig(undefined)).toThrow();
    expect(() => convertPixiParticlesConfig('not an object')).toThrow();
  });

  it('passes through configs already in ParticleEffectConfig format', () => {
    const existing: ParticleEffectConfig = {
      emitterType: 'continuous',
      shape: 'flame',
      rate: 35,
      lifetime: { min: 0.4, max: 0.8 },
      speed: { min: 40, max: 80 },
      angle: { min: 260, max: 280 },
      gravity: { x: 0, y: -50 },
      friction: 0.98,
      scale: { start: 1.2, end: 0.2 },
      color: { start: '#ffffff', end: '#ff2200' },
      alpha: { start: 1, end: 0 },
      blendMode: 'add',
      offset: { x: -2, y: -10 },
    };

    const result = convertPixiParticlesConfig(existing);
    expect(result).toEqual(existing);
  });

  it('converts modern PixiParticles editor JSON with list-based ramps', () => {
    const pixiConfig = {
      alpha: {
        list: [
          { value: 0.9, time: 0 },
          { value: 0.0, time: 1 },
        ],
      },
      scale: {
        list: [
          { value: 1.5, time: 0 },
          { value: 0.2, time: 1 },
        ],
      },
      color: {
        list: [
          { value: 'fff176', time: 0 },
          { value: 'e65100', time: 1 },
        ],
      },
      speed: {
        start: 75,
        end: 20,
        min: 60,
        max: 90,
      },
      acceleration: {
        x: 0,
        y: -40,
      },
      startRotation: {
        min: 265,
        max: 275,
      },
      lifetime: {
        min: 0.4,
        max: 0.9,
      },
      blendMode: 'add',
      frequency: 0.025,
      emitterLifetime: -1,
      pos: {
        x: -4,
        y: -14,
      },
      spawnCircle: {
        x: 0,
        y: 0,
        r: 6,
      },
    };

    const result = convertPixiParticlesConfig(pixiConfig);
    expect(result.emitterType).toBe('continuous');
    expect(result.rate).toBe(40); // 1 / 0.025
    expect(result.lifetime).toEqual({ min: 0.4, max: 0.9 });
    expect(result.speed).toEqual({ min: 60, max: 90 });
    expect(result.angle).toEqual({ min: 265, max: 275 });
    expect(result.gravity).toEqual({ x: 0, y: -40 });
    expect(result.scale).toEqual({ start: 1.5, end: 0.2 });
    expect(result.alpha).toEqual({ start: 0.9, end: 0.0 });
    expect(result.color).toEqual({ start: '#fff176', end: '#e65100' });
    expect(result.blendMode).toBe('add');
    expect(result.shape).toBe('flame');
    expect(result.spawnRadius).toBe(6);
    expect(result.offset).toEqual({ x: -4, y: -14 });
  });

  it('correctly detects burst emitter type for short emitterLifetime', () => {
    const burstConfig = {
      alpha: { start: 1, end: 0 },
      scale: { start: 0.8, end: 0.1 },
      color: { start: '#888888', end: '#222222' },
      speed: { start: 100, end: 0 },
      lifetime: { min: 0.2, max: 0.5 },
      emitterLifetime: 0.05,
      particlesPerWave: 24,
      spawnType: 'rect',
      spawnRect: { w: 16, h: 16 },
    };

    const result = convertPixiParticlesConfig(burstConfig);
    expect(result.emitterType).toBe('burst');
    expect(result.burstCount).toBe(24);
    expect(result.shape).toBe('pixel');
    expect(result.spawnWidth).toBe(16);
    expect(result.spawnHeight).toBe(16);
  });
});
