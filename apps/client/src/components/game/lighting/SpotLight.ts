import { Graphics, Container, Sprite } from 'pixi.js';
import type { Vector2D } from '@mine-me/shared';
import { LightSource } from './LightSource';
import { LightTextureFactory } from './LightTextureFactory';

/**
 * Directional flashlight / spotlight with a forward cone beam and a 360-degree body aura.
 * Uses cached textures and persistent sprites for high-performance zero-geometry-allocation rendering.
 */
export class SpotLight extends LightSource {
  public direction: Vector2D;
  public coneAngleDeg: number;
  public innerAuraRadius: number; // in tile units
  public penumbraRatio: number;

  private beamSprite?: Sprite;
  private auraSprite?: Sprite;

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

  public render(container: Container, _graphics: Graphics, tileSize: number): void {
    if (!this.enabled || this.currentIntensity <= 0.001 || this.radius <= 0) {
      if (this.beamSprite) this.beamSprite.visible = false;
      if (this.auraSprite) this.auraSprite.visible = false;
      return;
    }

    const centerX = this.position.x * tileSize;
    const centerY = this.position.y * tileSize;
    const intensity = Math.min(1.5, this.currentIntensity);

    // 1. Render 360-degree ambient body aura (so player can see immediately around themselves)
    if (this.innerAuraRadius > 0) {
      if (!this.auraSprite) {
        const auraTex = LightTextureFactory.getRadialTexture(128);
        if (auraTex) {
          this.auraSprite = new Sprite(auraTex);
          this.auraSprite.anchor.set(0.5);
          this.auraSprite.blendMode = 'add';
          container.addChild(this.auraSprite);
        }
      }

      if (this.auraSprite) {
        this.auraSprite.visible = true;
        this.auraSprite.x = centerX;
        this.auraSprite.y = centerY;
        const auraPixelRadius = this.innerAuraRadius * tileSize;
        this.auraSprite.width = auraPixelRadius * 2;
        this.auraSprite.height = auraPixelRadius * 2;
        this.auraSprite.tint = this.color;
        this.auraSprite.alpha = Math.min(1.0, intensity * 0.4);
      }
    } else if (this.auraSprite) {
      this.auraSprite.visible = false;
    }

    // 2. Render forward directional cone beam
    if (!this.beamSprite) {
      const coneTex = LightTextureFactory.getConeTexture(256, this.coneAngleDeg);
      if (coneTex) {
        this.beamSprite = new Sprite(coneTex);
        this.beamSprite.anchor.set(0.0, 0.5);
        this.beamSprite.blendMode = 'add';
        container.addChild(this.beamSprite);
      }
    }

    if (this.beamSprite) {
      this.beamSprite.visible = true;
      this.beamSprite.x = centerX;
      this.beamSprite.y = centerY;
      const angle = Math.atan2(this.direction.y, this.direction.x);
      this.beamSprite.rotation = angle;

      const maxPixelRadius = this.radius * tileSize;
      const halfAngleRad = ((this.coneAngleDeg / 2) * Math.PI) / 180;
      this.beamSprite.width = maxPixelRadius;
      this.beamSprite.height = Math.max(1, maxPixelRadius * Math.tan(halfAngleRad) * 2);
      this.beamSprite.tint = this.color;
      this.beamSprite.alpha = Math.min(1.0, intensity * 0.85);
    }
  }

  public destroy(): void {
    super.destroy();
    if (this.beamSprite) {
      this.beamSprite.destroy();
      this.beamSprite = undefined;
    }
    if (this.auraSprite) {
      this.auraSprite.destroy();
      this.auraSprite = undefined;
    }
  }
}
