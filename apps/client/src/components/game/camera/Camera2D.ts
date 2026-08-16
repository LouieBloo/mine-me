import { Container } from 'pixi.js';
import type { Vector2D } from '@mine-me/shared';

export interface CameraOptions {
  targetContainer: Container;
  screenWidth: number;
  screenHeight: number;
  minZoom?: number;
  maxZoom?: number;
  defaultZoom?: number;
  smoothing?: number;
}

/**
 * Camera2D handles 2D viewport positioning, uniform world scaling (zoom),
 * and screen-to-world / world-to-screen coordinate projections.
 */
export class Camera2D {
  private targetContainer: Container;
  private screenWidth: number;
  private screenHeight: number;

  public readonly minZoom: number;
  public readonly maxZoom: number;
  private currentZoom: number;
  private targetZoom: number;

  private currentCenter: Vector2D = { x: 0, y: 0 };
  private isDestroyed: boolean = false;

  constructor(options: CameraOptions) {
    this.targetContainer = options.targetContainer;
    this.screenWidth = options.screenWidth;
    this.screenHeight = options.screenHeight;
    this.minZoom = options.minZoom ?? 1.0;
    this.maxZoom = options.maxZoom ?? 2.0;

    const initialZoom = Math.min(this.maxZoom, Math.max(this.minZoom, options.defaultZoom ?? 1.5));
    this.currentZoom = initialZoom;
    this.targetZoom = initialZoom;
  }

  /**
   * Set the camera zoom level (automatically clamped within [minZoom, maxZoom]).
   */
  public setZoom(zoom: number, instant: boolean = true): void {
    const clamped = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    this.targetZoom = clamped;
    if (instant) {
      this.currentZoom = clamped;
    }
  }

  /**
   * Get the current zoom level.
   */
  public getZoom(): number {
    return this.currentZoom;
  }

  /**
   * Update viewport screen dimensions (e.g. on window resize).
   */
  public setScreenSize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  /**
   * Center the camera on a world coordinate (in pixel space) and apply zoom transformation.
   *
   * Formula:
   * container.scale = zoom
   * container.x = (screenWidth / 2) - (lookAtX * zoom)
   * container.y = (screenHeight / 2) - (lookAtY * zoom)
   */
  public update(lookAtPos: Vector2D, dt: number = 0.016): void {
    if (this.isDestroyed || !this.targetContainer || (this.targetContainer as any).destroyed) {
      return;
    }

    // Smooth zoom transition if currentZoom != targetZoom
    if (Math.abs(this.currentZoom - this.targetZoom) > 0.001) {
      const zoomFactor = Math.min(1.0, 1 - Math.exp(-20 * dt));
      this.currentZoom += (this.targetZoom - this.currentZoom) * zoomFactor;
    } else {
      this.currentZoom = this.targetZoom;
    }

    this.currentCenter = { x: lookAtPos.x, y: lookAtPos.y };

    // Apply scale to world container
    this.targetContainer.scale.set(this.currentZoom);

    // Center viewport on lookAt position
    this.targetContainer.x = this.screenWidth / 2 - lookAtPos.x * this.currentZoom;
    this.targetContainer.y = this.screenHeight / 2 - lookAtPos.y * this.currentZoom;
  }

  /**
   * Convert screen pixel coordinate to world pixel coordinate.
   */
  public screenToWorld(screenPos: Vector2D): Vector2D {
    return {
      x: (screenPos.x - this.targetContainer.x) / this.currentZoom,
      y: (screenPos.y - this.targetContainer.y) / this.currentZoom,
    };
  }

  /**
   * Convert world pixel coordinate to screen pixel coordinate.
   */
  public worldToScreen(worldPos: Vector2D): Vector2D {
    return {
      x: worldPos.x * this.currentZoom + this.targetContainer.x,
      y: worldPos.y * this.currentZoom + this.targetContainer.y,
    };
  }

  /**
   * Get the current center point of the camera in world coordinates.
   */
  public getCenter(): Vector2D {
    return { ...this.currentCenter };
  }

  /**
   * Clean up references.
   */
  public destroy(): void {
    this.isDestroyed = true;
  }
}
