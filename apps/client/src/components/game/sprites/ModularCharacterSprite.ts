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
  shootsProjectiles?: boolean;
  throwable?: boolean;
  holdOffsetX?: number;
  holdOffsetY?: number;
  holdRotation?: number; // in degrees
  muzzleOffsetX?: number;
  muzzleOffsetY?: number;
}

/**
 * ModularCharacterSprite renders a 2D hierarchical skeletal puppet with procedural
 * animations, inheriting the full rig/joint animation engine from ModularEntitySprite,
 * and adding player-specific gear layers that attach directly to joint nodes.
 */
export class ModularCharacterSprite extends ModularEntitySprite {
  private gearSprites: Map<string, Sprite[]> = new Map();
  private weaponSprite: Sprite | null = null;
  private currentMuzzleOffset: { x: number; y: number } = { x: 0, y: 0 };

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
          this.weaponSprite = sprite;
          this.currentMuzzleOffset = {
            x: layer.muzzleOffsetX ?? 0,
            y: layer.muzzleOffsetY ?? 0,
          };

          const targetToolDimension = 280;
          const maxDim = Math.max(texture.width, texture.height);
          if (maxDim > targetToolDimension) {
            const toolScale = targetToolDimension / maxDim;
            sprite.scale.set(toolScale);
          }

          if (layer.throwable && sprite.scale) {
            const currentScaleX = typeof sprite.scale.x === 'number' ? sprite.scale.x : 1;
            sprite.scale.set(currentScaleX * 0.75);
          }

          const hasCustomHold =
            typeof layer.holdOffsetX === 'number' ||
            typeof layer.holdOffsetY === 'number' ||
            typeof layer.holdRotation === 'number';

          if (hasCustomHold) {
            sprite.x = layer.holdOffsetX ?? 0;
            sprite.y = layer.holdOffsetY ?? 0;
            sprite.rotation = ((layer.holdRotation ?? 0) * Math.PI) / 180;
          } else if (layer.shootsProjectiles) {
            // Weapon shoots projectiles default fallback (0 rad neutral matching Admin preview)
            sprite.rotation = 0;
            sprite.x = 0;
            sprite.y = 0;
          } else if (layer.throwable) {
            // Throwable consumable held in hand default fallback (0 rad neutral matching Admin preview)
            sprite.rotation = 0;
            sprite.x = 0;
            sprite.y = 0;
          } else {
            // Axes, pickaxes, and melee tools: angled forward ready to strike
            sprite.rotation = 0.25;
            sprite.x = 5;
            sprite.y = -10;
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
   * Returns the currently equipped weapon sprite, if any.
   */
  getWeaponSprite(): Sprite | null {
    return this.weaponSprite;
  }

  /**
   * Calculate the world position of the projectile launch point
   * relative to a given coordinate container (e.g. gridContainer).
   * Automatically accounts for the character arm aiming angle, recoil, and flip.
   */
  getMuzzleWorldPosition(
    relativeToContainer: Container,
    customOffset?: { x: number; y: number }
  ): { x: number; y: number } | null {
    if (!this.weaponSprite || this.weaponSprite.destroyed || !this.weaponSprite.parent) {
      return null;
    }
    const offset = customOffset ?? this.currentMuzzleOffset;
    if (typeof this.weaponSprite.toGlobal !== 'function') {
      return { x: offset.x, y: offset.y };
    }
    const globalPos = this.weaponSprite.toGlobal(offset);
    if (typeof relativeToContainer.toLocal !== 'function') {
      return globalPos;
    }
    const localPos = relativeToContainer.toLocal(globalPos);
    return localPos;
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
    this.weaponSprite = null;
    this.currentMuzzleOffset = { x: 0, y: 0 };
  }

  /**
   * Clean up all Pixi resources including gear layers.
   */
  override destroy(): void {
    this.clearGearLayers();
    super.destroy();
  }
}
