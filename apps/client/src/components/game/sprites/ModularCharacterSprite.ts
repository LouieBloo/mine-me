import { Assets, Sprite, Texture, Container } from 'pixi.js';
import { BaseSprite } from './BaseSprite';
import type { GearSubType } from '@mine-me/shared';
import { MINER_SKELETON_PATH, MODULAR_GEAR_SLOTS, getAssetUrl } from '@mine-me/shared';

/**
 * Descriptor for an equipped gear layer to be attached to the modular character skeleton.
 */
export interface GearLayerDescriptor {
  url: string;
  subType: GearSubType;
}

export interface SkeletonPartDef {
  file: string;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  pivot_anchor: [number, number];
  offset_from_pelvis: [number, number];
  z_index: number;
  slot: string;
}

export interface SkeletonManifest {
  version: string;
  canvas_size: [number, number];
  pelvis_origin: [number, number];
  parts: Record<string, SkeletonPartDef>;
}

export type CharacterAnimationState = 'idle' | 'walk' | 'mine';

/**
 * ModularCharacterSprite renders a 2D hierarchical skeletal puppet with procedural
 * animations (walk cycles, idle breathing, and tool mining swings).
 *
 * Equipped gear layers attach directly to joint nodes (head, torso, legs, tool socket)
 * and inherit all rotational, scale, and translational movements.
 */
export class ModularCharacterSprite extends BaseSprite {
  public static readonly REFERENCE_HEIGHT = 880;
  public static readonly REFERENCE_WIDTH = 350;

  private manifestUrl: string;
  private manifest: SkeletonManifest | null = null;

  // Hierarchical bone nodes
  private pelvisNode: Container;
  private torsoNode: Container;
  private torsoBodyNode: Container;
  private headNode: Container;
  private armFrontNode: Container;
  private armBackNode: Container;
  private legFrontNode: Container;
  private legBackNode: Container;
  private toolSocket: Container;

  // Base part sprites
  private partSprites: Map<string, Sprite> = new Map();
  private gearSprites: Map<string, Sprite[]> = new Map();

  // Animation controller
  private animState: CharacterAnimationState = 'idle';
  private animTime: number = 0;
  private walkSpeedMultiplier: number = 1.0;

  // Base neutral transformation offsets
  private baseOffsets: Record<string, { x: number; y: number }> = {};

  constructor(parentContainer: Container, manifestUrl?: string) {
    super(parentContainer);
    this.manifestUrl = manifestUrl || getAssetUrl(MINER_SKELETON_PATH);

    // Build joint container hierarchy
    this.pelvisNode = new Container();
    this.torsoNode = new Container();
    this.torsoBodyNode = new Container();
    this.headNode = new Container();
    this.armFrontNode = new Container();
    this.armBackNode = new Container();
    this.legFrontNode = new Container();
    this.legBackNode = new Container();
    this.toolSocket = new Container();

    // Tree hierarchy:
    // wrapper -> pelvisNode
    //              |-- legBackNode (far leg, z: 10)
    //              |-- torsoNode (trunk, z: 20)
    //              |     |-- armBackNode (far arm, z: 5)
    //              |     |-- torsoBodyNode (body trunk, z: 20)
    //              |     |-- headNode (head, z: 30)
    //              |     \-- armFrontNode (near arm, z: 40)
    //              |           \-- toolSocket (hand attachment)
    //              \-- legFrontNode (near leg, z: 25)

    this.torsoNode.addChild(this.armBackNode);
    this.torsoNode.addChild(this.torsoBodyNode);
    this.torsoNode.addChild(this.headNode);
    this.torsoNode.addChild(this.armFrontNode);
    this.armFrontNode.addChild(this.toolSocket);

    this.pelvisNode.addChild(this.legBackNode);
    this.pelvisNode.addChild(this.torsoNode);
    this.pelvisNode.addChild(this.legFrontNode);

    // Keep hidden initially until fully loaded, scaled, and rigged
    this.wrapper.visible = false;
    this.wrapper.addChild(this.pelvisNode);
  }

  /**
   * Toggle visibility of character wrapper.
   */
  setVisible(visible: boolean): void {
    if (!this.destroyed && this.wrapper) {
      this.wrapper.visible = visible;
    }
  }

  /**
   * Load the skeleton manifest and all sub-part textures.
   */
  async load(): Promise<void> {
    if (this.destroyed || this.wrapper?.destroyed) return;

    try {
      const resp = await fetch(this.manifestUrl);
      if (!resp.ok) {
        throw new Error(`Failed to load skeleton manifest: ${resp.statusText}`);
      }
      this.manifest = await resp.json();
    } catch (err) {
      console.error('[ModularCharacterSprite] Failed to load skeleton manifest:', err);
      return;
    }

    if (!this.manifest || this.destroyed || this.wrapper?.destroyed) return;

    // Derive base directory from manifest URL
    const lastSlash = this.manifestUrl.lastIndexOf('/');
    const baseDir = lastSlash !== -1 ? this.manifestUrl.substring(0, lastSlash + 1) : '';

    // Load textures and instantiate part sprites
    const parts = this.manifest.parts;
    for (const [partName, partDef] of Object.entries(parts)) {
      if (this.destroyed || this.wrapper?.destroyed) return;

      const partUrl = `${baseDir}${partDef.file}`;
      const cacheKey = `modular_part_${partUrl}`;
      try {
        const texture: Texture = await Assets.load({ src: partUrl, alias: cacheKey });
        if (this.destroyed || this.wrapper?.destroyed) return;

        const sprite = new Sprite(texture);
        if (partDef.width && partDef.width > 0) {
          sprite.width = partDef.width;
        }
        if (partDef.height && partDef.height > 0) {
          sprite.height = partDef.height;
        }
        sprite.anchor.set(partDef.pivot_anchor[0], partDef.pivot_anchor[1]);
        this.partSprites.set(partName, sprite);

        // Position joint node and attach sprite
        const targetNode = this.getNodeForPart(partName);
        if (targetNode && !targetNode.destroyed && partDef.offset_from_pelvis) {
          targetNode.x = partDef.offset_from_pelvis[0];
          targetNode.y = partDef.offset_from_pelvis[1];
          this.baseOffsets[partName] = { x: targetNode.x, y: targetNode.y };
          targetNode.addChild(sprite);
        }
      } catch (e) {
        if (!this.destroyed && !this.wrapper?.destroyed) {
          console.warn(`[ModularCharacterSprite] Could not load part texture ${partUrl}:`, e);
        }
      }
    }

    if (this.destroyed || this.wrapper?.destroyed) return;

    // Hand/tool socket default position on arm_front
    if (this.toolSocket && !this.toolSocket.destroyed) {
      this.toolSocket.x = -10;
      this.toolSocket.y = 120;
    }
  }

  /**
   * Resolve joint container for a given part name.
   */
  private getNodeForPart(partName: string): Container | null {
    switch (partName) {
      case 'head':
        return this.headNode;
      case 'torso':
        return this.torsoBodyNode;
      case 'arm_front':
        return this.armFrontNode;
      case 'arm_back':
        return this.armBackNode;
      case 'leg_front':
        return this.legFrontNode;
      case 'leg_back':
        return this.legBackNode;
      default:
        return null;
    }
  }

  /**
   * Set or change the current animation state.
   */
  setState(state: CharacterAnimationState): void {
    if (this.animState === state) return;
    this.animState = state;
  }

  /**
   * Get the current animation state.
   */
  getState(): CharacterAnimationState {
    return this.animState;
  }

  /**
   * Set moving velocity to automatically toggle between 'idle' and 'walk'.
   */
  setMoveVelocity(vx: number, vy: number): void {
    const speed = Math.hypot(vx, vy);
    if (speed > 0.005) {
      this.walkSpeedMultiplier = Math.min(2.5, Math.max(0.6, speed * 25));
      if (this.animState !== 'walk') {
        this.setState('walk');
      }
    } else {
      if (this.animState !== 'idle') {
        this.setState('idle');
      }
    }
  }

  /**
   * Frame tick update to drive procedural joint transformations.
   * Call every frame from the Pixi application ticker.
   */
  update(deltaTime: number): void {
    if (this.destroyed) return;
    this.animTime += deltaTime;

    const baseTorso = this.baseOffsets['torso'] || { x: 0, y: 0 };
    const baseHead = this.baseOffsets['head'] || { x: 2, y: -245 };
    const baseLegFront = this.baseOffsets['leg_front'] || { x: -20, y: -55 };
    const baseLegBack = this.baseOffsets['leg_back'] || { x: 35, y: -55 };

    if (this.animState === 'idle') {
      // Gentle breathing loop
      const breath = Math.sin(this.animTime * 2.2);
      this.torsoNode.rotation = 0;
      this.torsoNode.y = baseTorso.y + breath * 3;
      this.headNode.y = baseHead.y + breath * 2;
      this.headNode.rotation = breath * 0.02;

      this.armFrontNode.rotation = breath * 0.04;
      this.armBackNode.rotation = -breath * 0.03;

      // Legs remain grounded
      this.legFrontNode.rotation = 0;
      this.legBackNode.rotation = 0;
      this.legFrontNode.y = baseLegFront.y;
      this.legBackNode.y = baseLegBack.y;
    } else if (this.animState === 'walk') {
      // Walk stride cycle
      const freq = 9.0 * this.walkSpeedMultiplier;
      const stride = Math.sin(this.animTime * freq);
      const strideCos = Math.cos(this.animTime * freq);
      const bounce = Math.abs(stride) * 8;

      // Pelvis / torso up-down bounce on each footfall
      this.torsoNode.rotation = 0;
      this.torsoNode.y = baseTorso.y + bounce;
      this.headNode.y = baseHead.y + bounce * 0.8;
      this.headNode.rotation = stride * 0.03;

      // Leg stride rotations
      const legAmplitude = 0.5; // ~28 degrees
      this.legFrontNode.rotation = stride * legAmplitude;
      this.legBackNode.rotation = -stride * legAmplitude;

      // Foot liftoff on passing step
      this.legFrontNode.y = baseLegFront.y - Math.max(0, strideCos) * 6;
      this.legBackNode.y = baseLegBack.y - Math.max(0, -strideCos) * 6;

      // Arms counter-swing opposite to legs
      this.armFrontNode.rotation = -stride * 0.35;
      this.armBackNode.rotation = stride * 0.35;
    } else if (this.animState === 'mine') {
      // Mining tool swing cycle
      const swingFreq = 6.0;
      const progress = (this.animTime * swingFreq) % (Math.PI * 2);
      const swing = Math.sin(progress);

      // Raise arm up, then slam down into rock
      this.armFrontNode.rotation = -0.6 + swing * 1.2;
      this.torsoNode.rotation = swing > 0 ? 0.12 : -0.05;
      this.torsoNode.y = baseTorso.y + (swing > 0 ? 6 : -2);
      this.headNode.rotation = swing * 0.1;

      // Legs firmly braced
      this.legFrontNode.rotation = 0.1;
      this.legBackNode.rotation = -0.15;
    }
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

        // Determine which joint node this gear slot attaches to
        const slotNodeName = MODULAR_GEAR_SLOTS[layer.subType] || 'torsoNode';
        const targetNode = (this as any)[slotNodeName] as Container | undefined;

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
   * Access the tool / weapon attachment socket.
   */
  getToolSocket(): Container {
    return this.toolSocket;
  }

  /**
   * Clean up all Pixi resources.
   */
  destroy(): void {
    this.clearGearLayers();
    this.partSprites.forEach((sprite) => sprite.destroy());
    this.partSprites.clear();
    super.destroy();
  }
}
