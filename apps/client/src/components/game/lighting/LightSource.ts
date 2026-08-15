import { Graphics } from 'pixi.js';
import type { Vector2D } from '@mine-me/shared';

/**
 * Abstract base class for all light emitters in the 2D lighting system.
 */
export abstract class LightSource {
  public id: string;
  public position: Vector2D;
  public color: number;
  public baseIntensity: number;
  public currentIntensity: number;
  public radius: number; // in world tile units
  public enabled: boolean;

  constructor(
    id: string,
    position: Vector2D,
    color: number = 0xffffff,
    intensity: number = 1.0,
    radius: number = 3.0
  ) {
    this.id = id;
    this.position = { ...position };
    this.color = color;
    this.baseIntensity = intensity;
    this.currentIntensity = intensity;
    this.radius = radius;
    this.enabled = true;
  }

  /**
   * Update internal animation, flicker, or pulse states.
   */
  public abstract update(dt: number): void;

  /**
   * Render this light onto the provided container and graphics buffer in local pixel coordinates.
   * @param container The container to add sprites to (for texture-based lights)
   * @param graphics The additive graphics context on the lightmap (for vector-based lights)
   * @param tileSize Size of one tile in pixels
   */
  public abstract render(container: import('pixi.js').Container, graphics: Graphics, tileSize: number): void;

  /**
   * Set world position (in tile coordinates).
   */
  public setPosition(x: number, y: number): void {
    this.position.x = x;
    this.position.y = y;
  }

  /**
   * Set light color.
   */
  public setColor(color: number): void {
    this.color = color;
  }

  /**
   * Set base intensity.
   */
  public setIntensity(intensity: number): void {
    this.baseIntensity = intensity;
    this.currentIntensity = intensity;
  }

  /**
   * Set light radius (in tile units).
   */
  public setRadius(radius: number): void {
    this.radius = radius;
  }

  /**
   * Clean up any internal resources.
   */
  public destroy(): void {
    this.enabled = false;
  }
}
