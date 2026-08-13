import { Assets, Sprite, Texture, Container } from 'pixi.js';
import { BaseSprite } from './BaseSprite';
import type { GearSubType } from '@mine-me/shared';
import { GEAR_OFFSETS } from '@mine-me/shared';

/**
 * Descriptor for a gear layer to be rendered on top of the base body.
 */
export interface GearLayerDescriptor {
  url: string;
  subType: GearSubType;
}

/**
 * CompositeEntitySprite renders a layered static entity — a base body image
 * with gear pieces overlaid at predefined offsets.
 *
 * Used for player characters whose appearance is composed of multiple
 * static sprites (body + head + chest + boots, etc.).
 *
 * Usage:
 *   const sprite = new CompositeEntitySprite(stage, baseBodyUrl);
 *   await sprite.load();
 *   await sprite.setGearLayers([
 *     { url: '/assets/gear/iron-helm.png', subType: 'HEAD' },
 *     { url: '/assets/gear/iron-chest.png', subType: 'CHEST' },
 *   ]);
 */
export class CompositeEntitySprite extends BaseSprite {
  private baseBodyUrl: string;
  private baseSprite: Sprite | null = null;
  private gearSprites: Sprite[] = [];

  constructor(parentContainer: Container, baseBodyUrl: string) {
    super(parentContainer);
    this.baseBodyUrl = baseBodyUrl;
  }

  /**
   * Load the base body texture and add it to the wrapper.
   */
  async load(): Promise<void> {
    if (this.destroyed) return;

    const cacheKey = `composite_base_${this.baseBodyUrl}`;
    const texture: Texture = await Assets.load({ src: this.baseBodyUrl, alias: cacheKey });
    if (this.destroyed) return;

    this.baseSprite = new Sprite(texture);
    this.baseSprite.anchor.set(0.5);
    this.wrapper.addChild(this.baseSprite);
  }

  /**
   * Set (or replace) gear layers on top of the base body.
   * Each gear piece is positioned using the shared GEAR_OFFSETS constants.
   */
  async setGearLayers(layers: GearLayerDescriptor[]): Promise<void> {
    if (this.destroyed) return;

    // Remove existing gear sprites
    this.clearGearLayers();

    // Load and position each gear layer
    for (const layer of layers) {
      if (this.destroyed) return;

      try {
        const cacheKey = `composite_gear_${layer.url}`;
        const texture: Texture = await Assets.load({ src: layer.url, alias: cacheKey });
        if (this.destroyed) return;

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);

        // Apply the predefined offset for this gear slot
        const offset = GEAR_OFFSETS[layer.subType];
        if (offset) {
          sprite.x = offset.x;
          sprite.y = offset.y;
        }

        this.gearSprites.push(sprite);
        this.wrapper.addChild(sprite);
      } catch (err) {
        console.warn(`[CompositeEntitySprite] Failed to load gear layer: ${layer.url}`, err);
      }
    }
  }

  /**
   * Remove all gear layer sprites.
   */
  private clearGearLayers(): void {
    for (const sprite of this.gearSprites) {
      this.wrapper.removeChild(sprite);
      sprite.destroy();
    }
    this.gearSprites = [];
  }

  /**
   * Clean up all Pixi resources.
   */
  destroy(): void {
    this.clearGearLayers();
    if (this.baseSprite) {
      this.baseSprite.destroy();
      this.baseSprite = null;
    }
    super.destroy();
  }
}
