import { Graphics, Sprite, Container } from 'pixi.js';
import type { Vector2D } from '@mine-me/shared';
import { LightSource } from './LightSource';
import { LightTextureFactory } from './LightTextureFactory';

export interface FlickerConfig {
  speed: number;
  amount: number; // e.g. 0.15 for ±15% variation
}

export interface PulseConfig {
  speed: number;
  minIntensity: number;
  maxIntensity: number;
}

/**
 * 360-degree omnidirectional point light with smooth quadratic falloff.
 * Supports organic torch micro-flicker and gem pulsation modes.
 */
export class PointLight extends LightSource {
  public flicker?: FlickerConfig;
  public pulse?: PulseConfig;
  private animTimer: number = 0;
  private sprite?: Sprite;

  constructor(
    id: string,
    position: Vector2D,
    color: number = 0xf59e0b, // warm amber by default
    intensity: number = 1.0,
    radius: number = 3.5,
    options?: {
      flicker?: FlickerConfig;
      pulse?: PulseConfig;
    }
  ) {
    super(id, position, color, intensity, radius);
    this.flicker = options?.flicker;
    this.pulse = options?.pulse;
    // Offset timer uniquely based on id hash to prevent synchronized flickering
    this.animTimer = (Math.abs(this.hashString(id)) % 100) * 0.1;
  }

  public update(dt: number): void {
    if (!this.enabled) return;
    this.animTimer += dt;

    if (this.flicker) {
      // Multi-frequency harmonic sine oscillation for organic flame flicker
      const t = this.animTimer * this.flicker.speed;
      const wave1 = Math.sin(t * 1.0) * 0.5;
      const wave2 = Math.sin(t * 2.3 + 1.2) * 0.3;
      const wave3 = Math.sin(t * 4.7 + 2.4) * 0.2;
      const combined = wave1 + wave2 + wave3;
      const flickerOffset = combined * this.flicker.amount;
      this.currentIntensity = Math.max(0.1, this.baseIntensity * (1 + flickerOffset));
    } else if (this.pulse) {
      // Gentle breathing pulse
      const t = this.animTimer * this.pulse.speed;
      const s = (Math.sin(t) + 1) / 2; // 0 to 1
      this.currentIntensity = this.pulse.minIntensity + s * (this.pulse.maxIntensity - this.pulse.minIntensity);
    } else {
      this.currentIntensity = this.baseIntensity;
    }
  }

  public render(container: Container, _graphics: Graphics, tileSize: number): void {
    if (!this.enabled || this.currentIntensity <= 0.001 || this.radius <= 0) {
      if (this.sprite) this.sprite.visible = false;
      return;
    }

    if (!this.sprite) {
      const tex = LightTextureFactory.getRadialTexture(256);
      if (tex) {
        this.sprite = new Sprite(tex);
        this.sprite.anchor.set(0.5);
        this.sprite.blendMode = 'add';
        container.addChild(this.sprite);
      }
    }

    if (this.sprite) {
      this.sprite.visible = true;
      this.sprite.x = this.position.x * tileSize;
      this.sprite.y = this.position.y * tileSize;
      const pixelRadius = this.radius * tileSize;
      this.sprite.width = pixelRadius * 2;
      this.sprite.height = pixelRadius * 2;
      this.sprite.tint = this.color;
      // Adjusted alpha to look good with 'add' blend mode
      this.sprite.alpha = Math.min(1.0, this.currentIntensity * 1.2);
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  public destroy(): void {
    super.destroy();
    if (this.sprite) {
      this.sprite.destroy();
    }
  }
}
