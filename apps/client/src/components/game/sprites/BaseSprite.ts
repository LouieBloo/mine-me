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

  protected currentScale: number = 1.0;
  protected isFlipped: boolean = false;

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
   * Set uniform scale while preserving horizontal flip state.
   */
  setScale(scale: number): void {
    this.currentScale = Math.abs(scale);
    this.wrapper.scale.y = this.currentScale;
    this.wrapper.scale.x = this.isFlipped ? -this.currentScale : this.currentScale;
  }

  /**
   * Get current scale magnitude.
   */
  getScale(): number {
    return this.currentScale;
  }

  /**
   * Scale uniformly based on a reference height.
   */
  scaleToHeight(targetHeight: number, referenceHeight: number = 880): void {
    if (referenceHeight > 0) {
      this.setScale(targetHeight / referenceHeight);
    }
  }

  /**
   * Scale the sprite uniformly to fit within a target size (in pixels).
   * Default implementation scales by target height.
   */
  scaleToFit(targetSize: number): void {
    this.scaleToHeight(targetSize);
  }

  /**
   * Flip the sprite horizontally (e.g. player facing left/right).
   */
  setFlipped(flipped: boolean): void {
    this.isFlipped = flipped;
    this.wrapper.scale.x = flipped ? -this.currentScale : this.currentScale;
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
