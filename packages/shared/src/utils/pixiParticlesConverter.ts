import type { ParticleEffectConfig, ParticleEmitterType, ParticleShape } from '../types/particles';

/**
 * Converts a standard PixiParticles / @pixi/particle-emitter JSON configuration into ParticleEffectConfig.
 * Supports legacy format (start/end), color lists, and acceleration/rotation specs.
 */
export function convertPixiParticlesConfig(input: any): ParticleEffectConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid JSON input for PixiParticles configuration.');
  }

  // If it's already in our ParticleEffectConfig format, return it directly
  if (input.emitterType && input.lifetime && input.speed) {
    return input as ParticleEffectConfig;
  }

  // 1. Emitter Type & Rate
  const frequency = Number(input.frequency) || 0.02;
  const rate = Math.max(1, Math.min(200, Math.round(1 / frequency)));
  const emitterLifetime = Number(input.emitterLifetime);
  const emitterType: ParticleEmitterType =
    emitterLifetime > 0 && emitterLifetime < 0.1 ? 'burst' : 'continuous';
  const burstCount = input.particlesPerWave || input.burstCount || (emitterType === 'burst' ? 16 : undefined);

  // 2. Lifetime
  let lifetimeMin = 0.5;
  let lifetimeMax = 1.0;
  if (input.lifetime) {
    lifetimeMin = Number(input.lifetime.min ?? input.lifetime.start ?? 0.5);
    lifetimeMax = Number(input.lifetime.max ?? input.lifetime.end ?? lifetimeMin ?? 1.0);
  }

  // 3. Speed
  let speedMin = 40;
  let speedMax = 80;
  if (input.speed) {
    speedMin = Number(input.speed.min ?? input.speed.start ?? 40);
    speedMax = Number(input.speed.max ?? input.speed.end ?? speedMin ?? 80);
  }

  // 4. Angle / Start Rotation
  let angleMin = 250;
  let angleMax = 290;
  if (input.startRotation) {
    angleMin = Number(input.startRotation.min ?? 0);
    angleMax = Number(input.startRotation.max ?? angleMin);
  } else if (input.angle) {
    angleMin = Number(input.angle.min ?? 0);
    angleMax = Number(input.angle.max ?? angleMin);
  }

  // 5. Gravity / Acceleration
  let gravityX = 0;
  let gravityY = 0;
  if (input.acceleration) {
    gravityX = Number(input.acceleration.x ?? 0);
    gravityY = Number(input.acceleration.y ?? 0);
  } else if (input.gravity) {
    gravityX = Number(input.gravity.x ?? 0);
    gravityY = Number(input.gravity.y ?? 0);
  }

  // 6. Scale
  let startScale = 1.0;
  let endScale = 0.2;
  if (input.scale) {
    if (Array.isArray(input.scale.list) && input.scale.list.length > 0) {
      startScale = Number(input.scale.list[0].value ?? 1.0);
      endScale = Number(input.scale.list[input.scale.list.length - 1].value ?? startScale);
    } else {
      startScale = Number(input.scale.start ?? 1.0);
      endScale = Number(input.scale.end ?? startScale * 0.2);
    }
  }

  // 7. Alpha
  let startAlpha = 1.0;
  let endAlpha = 0.0;
  if (input.alpha) {
    if (Array.isArray(input.alpha.list) && input.alpha.list.length > 0) {
      startAlpha = Number(input.alpha.list[0].value ?? 1.0);
      endAlpha = Number(input.alpha.list[input.alpha.list.length - 1].value ?? 0.0);
    } else {
      startAlpha = Number(input.alpha.start ?? 1.0);
      endAlpha = Number(input.alpha.end ?? 0.0);
    }
  }

  // 8. Color
  let startColor: string | number = '#ffffff';
  let endColor: string | number = '#ff0000';
  if (input.color) {
    if (Array.isArray(input.color.list) && input.color.list.length > 0) {
      const firstVal = input.color.list[0].value;
      const lastVal = input.color.list[input.color.list.length - 1].value;
      startColor = String(firstVal).startsWith('#') ? firstVal : `#${firstVal}`;
      endColor = String(lastVal).startsWith('#') ? lastVal : `#${lastVal}`;
    } else {
      if (input.color.start) {
        startColor = String(input.color.start).startsWith('#') ? input.color.start : `#${input.color.start}`;
      }
      if (input.color.end) {
        endColor = String(input.color.end).startsWith('#') ? input.color.end : `#${input.color.end}`;
      }
    }
  }

  // 9. Shape & Blend Mode
  const blendMode = input.blendMode === 'add' || input.blendMode === 'screen' ? input.blendMode : 'normal';
  let shape: ParticleShape = 'flame';
  if (input.shape) {
    shape = input.shape;
  } else if (input.spawnType === 'rect') {
    shape = 'pixel';
  } else if (blendMode === 'add') {
    shape = 'flame';
  }

  // 10. Spawn dispersion
  let spawnRadius: number | undefined;
  let spawnWidth: number | undefined;
  let spawnHeight: number | undefined;
  if (input.spawnCircle?.r) {
    spawnRadius = Number(input.spawnCircle.r);
  } else if (input.spawnRadius) {
    spawnRadius = Number(input.spawnRadius);
  }
  if (input.spawnRect) {
    spawnWidth = Number(input.spawnRect.w);
    spawnHeight = Number(input.spawnRect.h);
  }

  // 11. Offset
  let offset: { x: number; y: number } | undefined;
  if (input.pos && (input.pos.x !== 0 || input.pos.y !== 0)) {
    offset = { x: Number(input.pos.x), y: Number(input.pos.y) };
  } else if (input.offset) {
    offset = { x: Number(input.offset.x), y: Number(input.offset.y) };
  }

  return {
    emitterType,
    rate,
    burstCount,
    duration: emitterLifetime > 0 ? emitterLifetime : undefined,
    lifetime: { min: lifetimeMin, max: lifetimeMax },
    speed: { min: speedMin, max: speedMax },
    angle: { min: angleMin, max: angleMax },
    gravity: { x: gravityX, y: gravityY },
    friction: Number(input.friction ?? 0.98),
    scale: { start: startScale, end: endScale },
    color: { start: startColor, end: endColor },
    alpha: { start: startAlpha, end: endAlpha },
    blendMode,
    shape,
    spawnRadius,
    spawnWidth,
    spawnHeight,
    offset,
  };
}
