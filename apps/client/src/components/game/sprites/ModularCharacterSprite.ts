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
import { MODULAR_GEAR_SLOTS, type HeldLightConfig } from '@mine-me/shared';

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
  /** Particle effect (by id) emitted from the layer while it is held, and its origin in weapon-sprite space. */
  heldParticleEffectId?: string | null;
  heldParticleOffsetX?: number;
  heldParticleOffsetY?: number;
  /** Light the layer gives off while held (offset in weapon-sprite space). */
  heldLightConfig?: HeldLightConfig | null;
}

/** What the held weapon emits: the effect id and where, in the weapon sprite's local space. */
export interface HeldParticleSpec {
  effectId: string;
  offset: { x: number; y: number };
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
  private heldParticle: HeldParticleSpec | null = null;
  private heldLight: HeldLightConfig | null = null;

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

          this.heldParticle = layer.heldParticleEffectId
            ? {
                effectId: layer.heldParticleEffectId,
                offset: { x: layer.heldParticleOffsetX ?? 0, y: layer.heldParticleOffsetY ?? 0 },
              }
            : null;

          this.heldLight = layer.heldLightConfig?.enabled ? layer.heldLightConfig : null;

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
    return this.weaponPointToContainer(relativeToContainer, customOffset ?? this.currentMuzzleOffset);
  }

  /** The effect the equipped weapon emits while held, or null when it has none. */
  getHeldParticle(): HeldParticleSpec | null {
    if (!this.weaponSprite || this.weaponSprite.destroyed || !this.weaponSprite.parent) return null;
    return this.heldParticle;
  }

  /**
   * World position (in `relativeToContainer` space) of the held weapon's particle origin.
   * Follows the swing, aim and flip like the muzzle does.
   */
  getHeldParticleWorldPosition(relativeToContainer: Container): { x: number; y: number } | null {
    const spec = this.getHeldParticle();
    if (!spec) return null;
    return this.weaponPointToContainer(relativeToContainer, spec.offset);
  }

  /** The light the equipped weapon gives off while held, or null when it has none. */
  getHeldLight(): HeldLightConfig | null {
    if (!this.weaponSprite || this.weaponSprite.destroyed || !this.weaponSprite.parent) return null;
    return this.heldLight;
  }

  /** World position (in `relativeToContainer` space) of the held weapon's light. */
  getHeldLightWorldPosition(relativeToContainer: Container): { x: number; y: number } | null {
    const light = this.getHeldLight();
    if (!light) return null;
    return this.weaponPointToContainer(relativeToContainer, { x: light.offsetX ?? 0, y: light.offsetY ?? 0 });
  }

  /** Converts a point in the weapon sprite's local space into another container's space. */
  private weaponPointToContainer(
    relativeToContainer: Container,
    offset: { x: number; y: number }
  ): { x: number; y: number } {
    const weapon = this.weaponSprite!;
    if (typeof weapon.toGlobal !== 'function') {
      return { x: offset.x, y: offset.y };
    }
    const globalPos = weapon.toGlobal(offset);
    if (typeof relativeToContainer.toLocal !== 'function') {
      return globalPos;
    }
    return relativeToContainer.toLocal(globalPos);
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
    this.heldParticle = null;
    this.heldLight = null;
  }

  /**
   * Clean up all Pixi resources including gear layers.
   */
  override destroy(): void {
    this.clearGearLayers();
    super.destroy();
  }
}
