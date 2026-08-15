import { Graphics, Container } from 'pixi.js';
import type { Vector2D } from '@mine-me/shared';
import { LightSource } from './LightSource';

/**
 * Directional flashlight / spotlight with a forward cone beam and a 360-degree body aura.
 */
export class SpotLight extends LightSource {
  public direction: Vector2D;
  public coneAngleDeg: number;
  public innerAuraRadius: number; // in tile units
  public penumbraRatio: number;

  constructor(
    id: string,
    position: Vector2D,
    direction: Vector2D = { x: 1, y: 0 },
    color: number = 0xfffae6, // crisp warm white
    intensity: number = 1.0,
    radius: number = 5.5,
    coneAngleDeg: number = 75,
    innerAuraRadius: number = 1.6,
    penumbraRatio: number = 0.3
  ) {
    super(id, position, color, intensity, radius);
    this.direction = { x: 1, y: 0 };
    this.setDirection(direction.x, direction.y);
    this.coneAngleDeg = coneAngleDeg;
    this.innerAuraRadius = innerAuraRadius;
    this.penumbraRatio = penumbraRatio;
  }

  public setDirection(x: number, y: number): void {
    const len = Math.hypot(x, y);
    if (len > 0.0001) {
      this.direction.x = x / len;
      this.direction.y = y / len;
    }
  }

  public update(_dt: number): void {
    this.currentIntensity = this.baseIntensity;
  }

  public render(_container: Container, graphics: Graphics, tileSize: number): void {
    if (!this.enabled || this.currentIntensity <= 0.001 || this.radius <= 0) return;

    const centerX = this.position.x * tileSize;
    const centerY = this.position.y * tileSize;
    const intensity = Math.min(1.5, this.currentIntensity);

    // 1. Render 360-degree ambient body aura (so player can see immediately around themselves)
    if (this.innerAuraRadius > 0) {
      const auraPixelRadius = this.innerAuraRadius * tileSize;
      const numAuraRings = 7; // Increased rings for smoother blur
      for (let i = numAuraRings; i >= 1; i--) {
        const fraction = i / numAuraRings;
        const r = auraPixelRadius * fraction;
        const falloff = Math.pow(1 - fraction * fraction, 1.5);
        const alpha = Math.min(1.0, falloff * intensity * 0.35);
        if (alpha > 0.005) {
          graphics.circle(centerX, centerY, r);
          graphics.fill({ color: this.color, alpha });
        }
      }
    }

    // 2. Render forward directional cone beam
    const centerAngle = Math.atan2(this.direction.y, this.direction.x);
    const halfAngleRad = ((this.coneAngleDeg / 2) * Math.PI) / 180;
    const maxPixelRadius = this.radius * tileSize;

    const numBeamRings = 14; // Increased rings from 7 to 14 for much smoother beam
    for (let i = numBeamRings; i >= 1; i--) {
      const fraction = i / numBeamRings;
      const r = maxPixelRadius * fraction;
      // Smooth falloff along distance
      const distanceFalloff = Math.pow(1 - fraction * fraction, 1.6);
      const ringAlpha = Math.min(1.0, distanceFalloff * intensity * 0.45);

      if (ringAlpha > 0.005) {
        const startAngle = centerAngle - halfAngleRad;
        const endAngle = centerAngle + halfAngleRad;

        graphics.moveTo(centerX, centerY);
        graphics.arc(centerX, centerY, r, startAngle, endAngle);
        graphics.closePath();
        graphics.fill({ color: this.color, alpha: ringAlpha });
      }
    }

    // Hot central forward core
    const coreRadius = maxPixelRadius * 0.4;
    const coreHalfAngle = halfAngleRad * 0.5;
    graphics.moveTo(centerX, centerY);
    graphics.arc(centerX, centerY, coreRadius, centerAngle - coreHalfAngle, centerAngle + coreHalfAngle);
    graphics.closePath();
    graphics.fill({ color: this.color, alpha: Math.min(1.0, intensity * 0.6) });
  }
}
