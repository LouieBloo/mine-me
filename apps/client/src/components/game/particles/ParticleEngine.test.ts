import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { ParticleEngine, parseColor, lerp, rgbToHex } from './ParticleEngine';
import type { ParticleEffectConfig } from '@mine-me/shared';

describe('ParticleEngine Utilities', () => {
  it('should parse hex strings and numbers to RGB', () => {
    expect(parseColor(0xff0000)).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseColor('#00f')).toEqual({ r: 0, g: 0, b: 255 });
    expect(parseColor('invalid')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('should lerp values correctly', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('should convert RGB components to hex integer', () => {
    expect(rgbToHex(255, 0, 0)).toBe(0xff0000);
    expect(rgbToHex(0, 255, 0)).toBe(0x00ff00);
    expect(rgbToHex(0, 0, 255)).toBe(0x0000ff);
  });
});

describe('ParticleEngine', () => {
  let container: Container;
  let engine: ParticleEngine;

  const burstConfig: ParticleEffectConfig = {
    emitterType: 'burst',
    shape: 'pixel',
    burstCount: 10,
    lifetime: { min: 0.5, max: 0.5 },
    speed: { min: 100, max: 100 },
    angle: { min: 0, max: 0 }, // Moves strictly right (+x)
    gravity: { x: 0, y: 50 },
    scale: { start: 1.0, end: 0.2 },
    alpha: { start: 1.0, end: 0.0 },
    color: { start: '#ffaa00', end: '#ff0000' },
  };

  const continuousConfig: ParticleEffectConfig = {
    emitterType: 'continuous',
    shape: 'circle',
    rate: 20, // 20 per second
    lifetime: { min: 1.0, max: 1.0 },
    speed: { min: 10, max: 10 },
    angle: { min: -90, max: -90 }, // Upward
    scale: { start: 1.0, end: 0.0 },
    alpha: { start: 1.0, end: 0.0 },
    color: { start: '#ffffff', end: '#000000' },
  };

  beforeEach(() => {
    container = new Container();
    engine = new ParticleEngine(container, undefined, 50);
  });

  it('should initialize with 0 active particles and return max limit', () => {
    expect(engine.getActiveParticleCount()).toBe(0);
    expect(engine.getMaxParticles()).toBe(50);
    expect(engine.getEmitterCount()).toBe(0);
  });

  it('should spawn a burst of particles', () => {
    engine.spawnBurst(burstConfig, { x: 100, y: 100 });
    expect(engine.getActiveParticleCount()).toBe(10);
    expect(container.children.length).toBe(10);
  });

  it('should enforce maxParticles cap during burst', () => {
    const smallEngine = new ParticleEngine(container, undefined, 5);
    smallEngine.spawnBurst(burstConfig, { x: 0, y: 0 });
    expect(smallEngine.getActiveParticleCount()).toBe(5);
  });

  it('should advance particle positions and apply gravity over time', () => {
    engine.spawnBurst(burstConfig, { x: 0, y: 0 });

    // 0.1s delta update
    engine.update(0.1);

    expect(engine.getActiveParticleCount()).toBe(10);
    const sprite = container.children[0];
    // initial vx is 100, so after 0.1s x >= 10
    expect(sprite.x).toBeGreaterThan(0);
    // gravity is y: 50, so vy >= 5, y > 0
    expect(sprite.y).toBeGreaterThan(0);
  });

  it('should recycle particles once their lifetime is exceeded', () => {
    engine.spawnBurst(burstConfig, { x: 0, y: 0 });
    expect(engine.getActiveParticleCount()).toBe(10);

    // burstConfig has lifetime of 0.5s. Updating by 0.6s should expire all
    engine.update(0.6);
    expect(engine.getActiveParticleCount()).toBe(0);

    // Spawning another burst should reuse existing pool without creating new sprites
    engine.spawnBurst(burstConfig, { x: 50, y: 50 });
    expect(engine.getActiveParticleCount()).toBe(10);
    expect(container.children.length).toBe(10); // Reused same sprites
  });

  it('should manage continuous emitters', () => {
    const emitter = engine.addEmitter(continuousConfig, { x: 200, y: 200 });
    expect(engine.getEmitterCount()).toBe(1);

    // Update by 0.1s: rate is 20/s, so accumulator reaches 2 particles
    engine.update(0.1);
    expect(engine.getActiveParticleCount()).toBeGreaterThanOrEqual(2);

    // Update position
    emitter.setPosition({ x: 300, y: 300 });
    expect(emitter.position.x).toBe(300);

    // Stop emitter
    emitter.stop();
    engine.update(0.1);
    expect(engine.getEmitterCount()).toBe(0);
  });

  it('should respect emitter duration', () => {
    const durationConfig: ParticleEffectConfig = {
      ...continuousConfig,
      duration: 0.25,
    };
    engine.addEmitter(durationConfig, { x: 0, y: 0 });
    expect(engine.getEmitterCount()).toBe(1);

    // Advance past duration
    engine.update(0.3);
    expect(engine.getEmitterCount()).toBe(0);
  });

  it('should clear all active particles and emitters on clear()', () => {
    engine.addEmitter(continuousConfig, { x: 0, y: 0 });
    engine.spawnBurst(burstConfig, { x: 0, y: 0 });

    expect(engine.getEmitterCount()).toBe(1);
    expect(engine.getActiveParticleCount()).toBe(10);

    engine.clear();
    expect(engine.getEmitterCount()).toBe(0);
    expect(engine.getActiveParticleCount()).toBe(0);
  });

  it('should destroy all sprites and textures cleanly', () => {
    engine.spawnBurst(burstConfig, { x: 0, y: 0 });
    engine.destroy();
    expect(engine.getActiveParticleCount()).toBe(0);
  });
});
