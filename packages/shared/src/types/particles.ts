export type ParticleEmitterType = 'continuous' | 'burst';

export type ParticleShape = 'circle' | 'square' | 'spark' | 'smoke' | 'pixel';

export interface ParticleEffectConfig {
  emitterType: ParticleEmitterType;
  rate?: number; // particles emitted per second (for continuous)
  burstCount?: number; // number of particles per burst (for burst)
  duration?: number; // duration of emitter in seconds (undefined = infinite/until destroyed)
  lifetime: { min: number; max: number }; // particle lifetime in seconds
  speed: { min: number; max: number }; // initial speed in pixels/sec
  angle: { min: number; max: number }; // emission angle in degrees (0 = right, 90 = down, 180 = left, 270 = up)
  gravity?: { x: number; y: number }; // gravitational acceleration (px/sec²)
  friction?: number; // velocity damping factor per second (e.g. 0.95)
  scale: {
    start: number;
    end: number;
    minScale?: number;
    maxScale?: number;
  };
  color: {
    start: string | number;
    end: string | number;
  };
  alpha: {
    start: number;
    end: number;
  };
  blendMode?: 'normal' | 'add' | 'screen' | 'multiply';
  shape?: ParticleShape;
  textureUrl?: string; // Optional custom sprite texture
  spawnRadius?: number; // Optional radial dispersion from emitter center
  spawnWidth?: number; // Optional rectangular dispersion width
  spawnHeight?: number; // Optional rectangular dispersion height
  rotationSpeed?: { min: number; max: number }; // rad/sec
}

export interface ParticleEffect {
  id: string;
  name: string;
  description?: string | null;
  type: 'CONTINUOUS' | 'BURST';
  config: ParticleEffectConfig;
  createdAt: string;
  updatedAt: string;
}
