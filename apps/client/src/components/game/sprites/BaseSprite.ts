import { Container } from 'pixi.js';

/**
 * BaseSprite is the abstract base class for all renderable game entities
 * (player characters, mobs, NPCs, etc.).
 *
 * It manages a wrapper Container on a parent Container and provides shared
 * positioning, scaling, and lifecycle methods.
 *
 * Subclasses must implement `load()` to set up their specific visuals.
 */
export abstract class BaseSprite {
  protected parentContainer: Container;
  protected wrapper: Container;
  protected destroyed = false;

  constructor(parentContainer: Container) {
    this.parentContainer = parentContainer;
    this.wrapper = new Container();
    this.parentContainer.addChild(this.wrapper);
  }

  /**
   * Load resources required to render this sprite.
   * Must be called before the sprite is visible.
   */
  abstract load(): Promise<void>;

  /**
   * Set the position of the sprite within its parent container.
   */
  setPosition(x: number, y: number): void {
    this.wrapper.x = x;
    this.wrapper.y = y;
  }

  /**
   * Set uniform scale.
   */
  setScale(scale: number): void {
    this.wrapper.scale.set(scale);
  }

  /**
   * Scale the sprite uniformly to fit within a target size (in pixels).
   * Uses the wrapper's current width as the reference dimension.
   */
  scaleToFit(targetSize: number): void {
    if (this.wrapper.width > 0) {
      const currentScale = this.wrapper.scale.x;
      const nativeWidth = this.wrapper.width / currentScale;
      const scaleFactor = targetSize / nativeWidth;
      this.wrapper.scale.set(scaleFactor);
    }
  }

  /**
   * Flip the sprite horizontally (e.g. player facing right in combat).
   */
  setFlipped(flipped: boolean): void {
    this.wrapper.scale.x = flipped
      ? -Math.abs(this.wrapper.scale.x)
      : Math.abs(this.wrapper.scale.x);
  }

  /**
   * Get the internal wrapper Container for advanced use.
   */
  getContainer(): Container {
    return this.wrapper;
  }

  /**
   * Clean up all Pixi resources.
   */
  destroy(): void {
    this.destroyed = true;
    if (this.wrapper.parent) {
      this.wrapper.parent.removeChild(this.wrapper);
    }
    this.wrapper.destroy({ children: true });
  }
}
