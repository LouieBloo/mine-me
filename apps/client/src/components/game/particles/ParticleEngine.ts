import { Container, Sprite, Texture, Graphics, type Renderer } from 'pixi.js';
import type { ParticleEffectConfig, ParticleShape } from '@mine-me/shared';

export interface ActiveParticle {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
  endAlpha: number;
  startColor: { r: number; g: number; b: number };
  endColor: { r: number; g: number; b: number };
  rotationSpeed: number;
  gravityX: number;
  gravityY: number;
  friction: number;
  active: boolean;
}

export interface EmitterHandle {
  id: string;
  config: ParticleEffectConfig;
  position: { x: number; y: number };
  active: boolean;
  elapsed: number;
  accumulator: number;
  setPosition: (pos: { x: number; y: number }) => void;
  stop: () => void;
  destroy: () => void;
}

// Color parsing helper
export function parseColor(c: string | number): { r: number; g: number; b: number } {
  if (typeof c === 'number') {
    return {
      r: (c >> 16) & 0xff,
      g: (c >> 8) & 0xff,
      b: c & 0xff,
    };
  }
  let hex = c.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((char) => char + char).join('');
  }
  const num = parseInt(hex, 16);
  if (isNaN(num)) return { r: 255, g: 255, b: 255 };
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function rgbToHex(r: number, g: number, b: number): number {
  return ((Math.round(r) & 0xff) << 16) | ((Math.round(g) & 0xff) << 8) | (Math.round(b) & 0xff);
}

export class ParticleEngine {
  private container: Container;
  private renderer?: Renderer;
  private pool: ActiveParticle[] = [];
  private activeCount: number = 0;
  private maxParticles: number;
  private textureCache: Map<string, Texture> = new Map();
  private emitters: Map<string, EmitterHandle> = new Map();
  private nextEmitterId: number = 1;

  constructor(container: Container, renderer?: Renderer, maxParticles: number = 2000) {
    this.container = container;
    this.renderer = renderer;
    this.maxParticles = maxParticles;
  }

  public getActiveParticleCount(): number {
    return this.activeCount;
  }

  public getMaxParticles(): number {
    return this.maxParticles;
  }

  public getEmitterCount(): number {
    return this.emitters.size;
  }

  /**
   * Generates or retrieves a cached procedural texture for standard particle shapes.
   */
  public getShapeTexture(shape: ParticleShape = 'circle'): Texture {
    if (this.textureCache.has(shape)) {
      return this.textureCache.get(shape)!;
    }

    if (!this.renderer) {
      // Fallback to White Texture if no WebGL/WebGPU renderer available (e.g. testing)
      return Texture.WHITE;
    }

    try {
      const g = new Graphics();
      switch (shape) {
        case 'circle':
          g.circle(8, 8, 7).fill(0xffffff);
          break;
        case 'square':
        case 'pixel':
          g.rect(2, 2, 12, 12).fill(0xffffff);
          break;
        case 'spark':
          g.poly([
            { x: 8, y: 0 },
            { x: 10, y: 6 },
            { x: 16, y: 8 },
            { x: 10, y: 10 },
            { x: 8, y: 16 },
            { x: 6, y: 10 },
            { x: 0, y: 8 },
            { x: 6, y: 6 },
          ]).fill(0xffffff);
          break;
        case 'smoke':
          g.circle(12, 12, 10).fill({ color: 0xffffff, alpha: 0.9 });
          g.circle(16, 14, 7).fill({ color: 0xffffff, alpha: 0.8 });
          g.circle(9, 15, 6).fill({ color: 0xffffff, alpha: 0.7 });
          break;
      }
      const tex = this.renderer.generateTexture(g);
      this.textureCache.set(shape, tex);
      return tex;
    } catch {
      return Texture.WHITE;
    }
  }

  /**
   * Spawns a single particle instance from the pool.
   */
  private spawnParticle(
    config: ParticleEffectConfig,
    origin: { x: number; y: number },
    texture: Texture
  ): ActiveParticle | null {
    if (this.activeCount >= this.maxParticles) {
      return null;
    }

    let p: ActiveParticle | undefined;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        p = this.pool[i];
        break;
      }
    }

    if (!p) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      this.container.addChild(sprite);
      p = {
        sprite,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        startScale: 1,
        endScale: 0,
        startAlpha: 1,
        endAlpha: 0,
        startColor: { r: 255, g: 255, b: 255 },
        endColor: { r: 255, g: 255, b: 255 },
        rotationSpeed: 0,
        gravityX: 0,
        gravityY: 0,
        friction: 1.0,
        active: false,
      };
      this.pool.push(p);
    } else {
      p.sprite.texture = texture;
    }

    // Compute spawn offset
    let offsetX = 0;
    let offsetY = 0;
    if (config.spawnRadius && config.spawnRadius > 0) {
      const r = Math.random() * config.spawnRadius;
      const theta = Math.random() * Math.PI * 2;
      offsetX = Math.cos(theta) * r;
      offsetY = Math.sin(theta) * r;
    } else if (config.spawnWidth || config.spawnHeight) {
      const w = config.spawnWidth || 0;
      const h = config.spawnHeight || 0;
      offsetX = (Math.random() - 0.5) * w;
      offsetY = (Math.random() - 0.5) * h;
    }

    p.x = origin.x + offsetX;
    p.y = origin.y + offsetY;
    p.life = 0;

    const lifetimeMin = config.lifetime?.min ?? 0.5;
    const lifetimeMax = config.lifetime?.max ?? 1.0;
    p.maxLife = lifetimeMin + Math.random() * (lifetimeMax - lifetimeMin);

    const speedMin = config.speed?.min ?? 50;
    const speedMax = config.speed?.max ?? 100;
    const speed = speedMin + Math.random() * (speedMax - speedMin);

    const angleMin = (config.angle?.min ?? 0) * (Math.PI / 180);
    const angleMax = (config.angle?.max ?? 360) * (Math.PI / 180);
    const angle = angleMin + Math.random() * (angleMax - angleMin);

    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;

    p.gravityX = config.gravity?.x ?? 0;
    p.gravityY = config.gravity?.y ?? 0;
    p.friction = config.friction ?? 1.0;

    p.startScale = config.scale?.start ?? 1.0;
    p.endScale = config.scale?.end ?? 0.0;

    p.startAlpha = config.alpha?.start ?? 1.0;
    p.endAlpha = config.alpha?.end ?? 0.0;

    p.startColor = parseColor(config.color?.start ?? 0xffffff);
    p.endColor = parseColor(config.color?.end ?? 0xffffff);

    const rotMin = config.rotationSpeed?.min ?? 0;
    const rotMax = config.rotationSpeed?.max ?? 0;
    p.rotationSpeed = rotMin + Math.random() * (rotMax - rotMin);

    p.sprite.x = p.x;
    p.sprite.y = p.y;
    p.sprite.scale.set(p.startScale);
    p.sprite.alpha = p.startAlpha;
    p.sprite.tint = rgbToHex(p.startColor.r, p.startColor.g, p.startColor.b);
    p.sprite.rotation = Math.random() * Math.PI * 2;
    p.sprite.visible = true;

    p.active = true;
    this.activeCount++;

    return p;
  }

  /**
   * Spawns an immediate one-shot burst of particles (e.g. block strike, explosion).
   */
  public spawnBurst(config: ParticleEffectConfig, position: { x: number; y: number }): void {
    const count = config.burstCount || 12;
    const texture = this.getShapeTexture(config.shape);
    for (let i = 0; i < count; i++) {
      this.spawnParticle(config, position, texture);
    }
  }

  /**
   * Registers a persistent emitter (e.g. torch flame, magic aura) that continuously spawns particles.
   */
  public addEmitter(config: ParticleEffectConfig, initialPosition: { x: number; y: number }): EmitterHandle {
    const id = `emitter_${this.nextEmitterId++}`;
    const handle: EmitterHandle = {
      id,
      config,
      position: { ...initialPosition },
      active: true,
      elapsed: 0,
      accumulator: 0,
      setPosition: (pos: { x: number; y: number }) => {
        handle.position.x = pos.x;
        handle.position.y = pos.y;
      },
      stop: () => {
        handle.active = false;
      },
      destroy: () => {
        handle.active = false;
        this.emitters.delete(id);
      },
    };

    this.emitters.set(id, handle);
    return handle;
  }

  /**
   * Removes all active emitters and resets particles.
   */
  public clear(): void {
    this.emitters.clear();
    for (const p of this.pool) {
      p.active = false;
      p.sprite.visible = false;
    }
    this.activeCount = 0;
  }

  /**
   * Main per-frame update loop. Call this on each frame (ticker loop).
   * @param deltaSec delta time in seconds (e.g. 1/60 ~ 0.0166)
   */
  public update(deltaSec: number): void {
    // 1. Process active continuous emitters
    this.emitters.forEach((emitter, id) => {
      if (!emitter.active) {
        this.emitters.delete(id);
        return;
      }

      emitter.elapsed += deltaSec;
      if (emitter.config.duration && emitter.elapsed >= emitter.config.duration) {
        emitter.active = false;
        this.emitters.delete(id);
        return;
      }

      const rate = emitter.config.rate || 20;
      const interval = 1 / rate;
      emitter.accumulator += deltaSec;

      const texture = this.getShapeTexture(emitter.config.shape);
      while (emitter.accumulator >= interval) {
        emitter.accumulator -= interval;
        this.spawnParticle(emitter.config, emitter.position, texture);
      }
    });

    // 2. Update all active particles
    let activeTracker = 0;

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life += deltaSec;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }

      activeTracker++;
      const progress = p.life / p.maxLife;

      // Apply physics
      p.vx += p.gravityX * deltaSec;
      p.vy += p.gravityY * deltaSec;
      if (p.friction < 1.0) {
        const factor = Math.pow(p.friction, deltaSec * 60);
        p.vx *= factor;
        p.vy *= factor;
      }

      p.x += p.vx * deltaSec;
      p.y += p.vy * deltaSec;

      p.sprite.x = p.x;
      p.sprite.y = p.y;

      // Alpha fade
      p.sprite.alpha = lerp(p.startAlpha, p.endAlpha, progress);

      // Scale transition
      const s = lerp(p.startScale, p.endScale, progress);
      p.sprite.scale.set(Math.max(0.01, s));

      // Color lerp
      const r = lerp(p.startColor.r, p.endColor.r, progress);
      const g = lerp(p.startColor.g, p.endColor.g, progress);
      const b = lerp(p.startColor.b, p.endColor.b, progress);
      p.sprite.tint = rgbToHex(r, g, b);

      // Rotation
      if (p.rotationSpeed !== 0) {
        p.sprite.rotation += p.rotationSpeed * deltaSec;
      }
    }

    this.activeCount = activeTracker;
  }

  /**
   * Cleans up all resources, textures, and sprites.
   */
  public destroy(): void {
    this.clear();
    for (const p of this.pool) {
      p.sprite.destroy();
    }
    this.pool = [];
    this.textureCache.forEach((tex) => tex.destroy(true));
    this.textureCache.clear();
  }
}
