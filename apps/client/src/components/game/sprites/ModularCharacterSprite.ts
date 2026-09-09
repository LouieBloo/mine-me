import { Assets, Sprite, Texture, Container } from 'pixi.js';
import { ModularEntitySprite, type ModularEntitySpriteOptions } from './ModularEntitySprite';
import type {
  GearSubType,
  SkeletonManifest,
  SkeletonPartDef,
  SkeletonHandJointDef,
  SkeletonToolSocketDef,
  ModularAnimationState,
} from '@mine-me/shared';
import { MODULAR_GEAR_SLOTS } from '@mine-me/shared';

export type CharacterAnimationState = ModularAnimationState;

export type {
  SkeletonManifest,
  SkeletonPartDef,
  SkeletonHandJointDef,
  SkeletonToolSocketDef,
};

/**
 * Descriptor for an equipped gear layer to be attached to the modular character skeleton.
 */
export interface GearLayerDescriptor {
  url: string;
  subType: GearSubType;
}

/**
 * ModularCharacterSprite renders a 2D hierarchical skeletal puppet with procedural
 * animations, inheriting the full rig/joint animation engine from ModularEntitySprite,
 * and adding player-specific gear layers that attach directly to joint nodes.
 */
export class ModularCharacterSprite extends ModularEntitySprite {
  private gearSprites: Map<string, Sprite[]> = new Map();

  constructor(
    parentContainer: Container,
    options?: ModularEntitySpriteOptions | string
  ) {
    super(parentContainer, options);
  }

  /**
   * Set or update equipped gear layers.
   * Attaches gear sprites directly to corresponding joint nodes.
   */
  async setGearLayers(layers: GearLayerDescriptor[]): Promise<void> {
    if (this.destroyed || this.wrapper?.destroyed) return;

    this.clearGearLayers();

    for (const layer of layers) {
      if (this.destroyed || this.wrapper?.destroyed) return;

      try {
        const cacheKey = `modular_gear_${layer.url}`;
        const texture: Texture = await Assets.load({ src: layer.url, alias: cacheKey });
        if (this.destroyed || this.wrapper?.destroyed) return;

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);

        // Normalize weapons/tools so they scale proportionally to character body parts
        if (layer.subType === 'WEAPON') {
          const targetToolDimension = 280;
          const maxDim = Math.max(texture.width, texture.height);
          if (maxDim > targetToolDimension) {
            const toolScale = targetToolDimension / maxDim;
            sprite.scale.set(toolScale);
          }
        }

        // Determine which joint node this gear slot attaches to
        const slotNodeName = MODULAR_GEAR_SLOTS[layer.subType] || 'torsoNode';
        let targetNode: Container | null = null;
        if (slotNodeName === 'toolSocket') targetNode = this.toolSocket;
        else if (slotNodeName === 'headNode') targetNode = this.headNode;
        else if (slotNodeName === 'torsoNode') targetNode = this.torsoBodyNode;
        else if (slotNodeName === 'armFrontNode') targetNode = this.armFrontNode;
        else if (slotNodeName === 'armBackNode') targetNode = this.armBackNode;
        else if (slotNodeName === 'legFrontNode') targetNode = this.legFrontNode;
        else if (slotNodeName === 'legBackNode') targetNode = this.legBackNode;
        else if (slotNodeName === 'pelvisNode') targetNode = this.pelvisNode;
        else targetNode = this.torsoBodyNode;

        if (targetNode && !targetNode.destroyed) {
          targetNode.addChild(sprite);
          const list = this.gearSprites.get(layer.subType) || [];
          list.push(sprite);
          this.gearSprites.set(layer.subType, list);
        }
      } catch (err) {
        if (!this.destroyed && !this.wrapper?.destroyed) {
          console.warn(`[ModularCharacterSprite] Failed to load gear layer: ${layer.url}`, err);
        }
      }
    }
  }

  /**
   * Clear all equipped gear layer sprites.
   */
  private clearGearLayers(): void {
    this.gearSprites.forEach((sprites) => {
      for (const s of sprites) {
        if (s.parent) {
          s.parent.removeChild(s);
        }
        s.destroy();
      }
    });
    this.gearSprites.clear();
  }

  /**
   * Clean up all Pixi resources including gear layers.
   */
  override destroy(): void {
    this.clearGearLayers();
    super.destroy();
  }
}
