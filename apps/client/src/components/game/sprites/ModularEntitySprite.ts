import { Assets, Sprite, Texture, Container } from 'pixi.js';
import { BaseSprite } from './BaseSprite';
import type {
  SkeletonManifest,
  SkeletonPartDef,
  SkeletonHandJointDef,
  SkeletonToolSocketDef,
  ModularAnimationState,
} from '@mine-me/shared';
import { MINER_SKELETON_PATH, getAssetUrl } from '@mine-me/shared';

export type {
  SkeletonManifest,
  SkeletonPartDef,
  SkeletonHandJointDef,
  SkeletonToolSocketDef,
};

export interface ModularEntitySpriteOptions {
  manifestUrl?: string;
  manifestData?: SkeletonManifest;
  baseAssetPath?: string;
}

/**
 * ModularEntitySprite renders a 2D hierarchical skeletal puppet with procedural
 * joint animations (idle, walk, mine, attack, damage, death).
 *
 * This generic base class supports both player characters and mob/NPC units.
 */
export class ModularEntitySprite extends BaseSprite {
  public static readonly REFERENCE_HEIGHT = 880;
  public static readonly REFERENCE_WIDTH = 350;

  protected manifestUrl?: string;
  protected manifest: SkeletonManifest | null = null;
  protected baseAssetPath: string = '';

  // Hierarchical bone nodes
  protected pelvisNode: Container;
  protected torsoNode: Container;
  protected torsoBodyNode: Container;
  protected headNode: Container;
  protected armFrontNode: Container;
  protected armBackNode: Container;
  protected handFrontNode: Container;
  protected legFrontNode: Container;
  protected legBackNode: Container;
  protected toolSocket: Container;

  // Base part sprites
  protected partSprites: Map<string, Sprite> = new Map();

  // Animation controller
  protected animState: ModularAnimationState = 'idle';
  protected animTime: number = 0;
  protected walkSpeedMultiplier: number = 1.0;

  // Base neutral transformation offsets
  protected baseOffsets: Record<string, { x: number; y: number }> = {};

  constructor(
    parentContainer: Container,
    options?: ModularEntitySpriteOptions | string
  ) {
    super(parentContainer);

    if (typeof options === 'string') {
      this.manifestUrl = options;
    } else if (options) {
      this.manifestUrl = options.manifestUrl;
      this.manifest = options.manifestData ? JSON.parse(JSON.stringify(options.manifestData)) : null;
      this.baseAssetPath = options.baseAssetPath || '';
    }

    if (!this.manifestUrl && !this.manifest) {
      this.manifestUrl = getAssetUrl(MINER_SKELETON_PATH);
    }

    // Build joint container hierarchy
    this.pelvisNode = new Container();
    this.torsoNode = new Container();
    this.torsoBodyNode = new Container();
    this.headNode = new Container();
    this.armFrontNode = new Container();
    this.armBackNode = new Container();
    this.handFrontNode = new Container();
    this.legFrontNode = new Container();
    this.legBackNode = new Container();
    this.toolSocket = new Container();

    // Joint tree hierarchy:
    // wrapper -> pelvisNode
    //              |-- legBackNode (far leg)
    //              |-- torsoNode (trunk)
    //              |     |-- armBackNode (far arm)
    //              |     |-- torsoBodyNode (body trunk)
    //              |     |-- headNode (head)
    //              |     \-- armFrontNode (near arm)
    //              |           \-- handFrontNode (wrist / hand joint)
    //              |                 \-- toolSocket (hand attachment)
    //              \-- legFrontNode (near leg)

    this.handFrontNode.addChild(this.toolSocket);
    this.armFrontNode.addChild(this.handFrontNode);
    this.torsoNode.addChild(this.armBackNode);
    this.torsoNode.addChild(this.torsoBodyNode);
    this.torsoNode.addChild(this.headNode);
    this.torsoNode.addChild(this.armFrontNode);

    this.pelvisNode.addChild(this.legBackNode);
    this.pelvisNode.addChild(this.torsoNode);
    this.pelvisNode.addChild(this.legFrontNode);

    // Keep hidden initially until fully loaded, scaled, and rigged
    this.wrapper.visible = false;
    this.wrapper.addChild(this.pelvisNode);
  }

  /**
   * Toggle visibility of entity wrapper.
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

    if (!this.manifest && this.manifestUrl) {
      try {
        const resp = await fetch(this.manifestUrl);
        if (!resp.ok) {
          throw new Error(`Failed to load skeleton manifest: ${resp.statusText}`);
        }
        this.manifest = await resp.json();
      } catch (err) {
        console.error('[ModularEntitySprite] Failed to load skeleton manifest:', err);
        return;
      }
    }

    if (!this.manifest || this.destroyed || this.wrapper?.destroyed) return;

    // Determine base asset directory if not explicitly provided
    let baseDir = this.baseAssetPath;
    if (!baseDir && this.manifestUrl) {
      const lastSlash = this.manifestUrl.lastIndexOf('/');
      baseDir = lastSlash !== -1 ? this.manifestUrl.substring(0, lastSlash + 1) : '';
    }
    if (!baseDir) {
      baseDir = getAssetUrl('/assets/sprites/characters/miner/');
    }

    // Load textures and instantiate part sprites
    const parts = this.manifest.parts;
    for (const [partName, partDef] of Object.entries(parts)) {
      if (this.destroyed || this.wrapper?.destroyed) return;

      const partUrl = partDef.file.startsWith('/') || partDef.file.startsWith('http')
        ? partDef.file
        : `${baseDir}${partDef.file}`;

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
          console.warn(`[ModularEntitySprite] Could not load part texture ${partUrl}:`, e);
        }
      }
    }

    if (this.destroyed || this.wrapper?.destroyed) return;

    // Position hand joint on arm_front
    if (this.handFrontNode && !this.handFrontNode.destroyed) {
      if (this.manifest?.hand_joint) {
        this.handFrontNode.x = this.manifest.hand_joint.offset[0];
        this.handFrontNode.y = this.manifest.hand_joint.offset[1];
      } else {
        this.handFrontNode.x = 210;
        this.handFrontNode.y = 100;
      }
    }

    // Tool socket attached to handFrontNode
    if (this.toolSocket && !this.toolSocket.destroyed) {
      if (this.manifest?.tool_socket) {
        this.toolSocket.x = this.manifest.tool_socket.offset[0];
        this.toolSocket.y = this.manifest.tool_socket.offset[1];
        if (this.manifest.tool_socket.scale !== undefined) {
          this.toolSocket.scale.set(this.manifest.tool_socket.scale);
        }
        if (this.manifest.tool_socket.rotation !== undefined) {
          this.toolSocket.rotation = this.manifest.tool_socket.rotation;
        }
      } else {
        this.toolSocket.x = 0;
        this.toolSocket.y = 0;
      }
    }
  }

  /**
   * Resolve joint container for a given part name.
   */
  protected getNodeForPart(partName: string): Container | null {
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
  setState(state: ModularAnimationState): void {
    if (this.animState === state) return;
    this.animState = state;
  }

  /**
   * Get the current animation state.
   */
  getState(): ModularAnimationState {
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
   */
  update(deltaTime: number): void {
    if (this.destroyed) return;
    this.animTime += deltaTime;

    const baseTorso = this.baseOffsets['torso'] || { x: 0, y: 0 };
    const baseHead = this.baseOffsets['head'] || { x: 2, y: -245 };
    const baseLegFront = this.baseOffsets['leg_front'] || { x: -20, y: -55 };
    const baseLegBack = this.baseOffsets['leg_back'] || { x: 35, y: -55 };
    const baseArmFront = this.baseOffsets['arm_front'] || { x: -153, y: -95 };
    const baseArmBack = this.baseOffsets['arm_back'] || { x: 90, y: -180 };

    // Reset base positions
    this.armFrontNode.x = baseArmFront.x;
    this.armBackNode.x = baseArmBack.x;
    this.headNode.x = baseHead.x;
    this.legFrontNode.x = baseLegFront.x;
    this.legBackNode.x = baseLegBack.x;
    this.torsoNode.x = baseTorso.x;

    if (this.animState === 'idle') {
      // Gentle breathing loop
      const breath = Math.sin(this.animTime * 2.2);
      this.torsoNode.rotation = 0;
      this.torsoNode.y = baseTorso.y + breath * 3;
      this.headNode.y = baseHead.y + breath * 2;
      this.headNode.rotation = breath * 0.02;

      this.armFrontNode.y = baseArmFront.y;
      this.armBackNode.y = baseArmBack.y;
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

      this.torsoNode.rotation = 0;
      this.torsoNode.y = baseTorso.y + bounce;
      this.headNode.y = baseHead.y + bounce * 0.8;
      this.headNode.rotation = stride * 0.03;

      const legAmplitude = 0.5;
      this.legFrontNode.rotation = stride * legAmplitude;
      this.legBackNode.rotation = -stride * legAmplitude;

      this.legFrontNode.y = baseLegFront.y - Math.max(0, strideCos) * 6;
      this.legBackNode.y = baseLegBack.y - Math.max(0, -strideCos) * 6;

      this.armFrontNode.y = baseArmFront.y;
      this.armBackNode.y = baseArmBack.y;
      this.armFrontNode.rotation = -stride * 0.35;
      this.armBackNode.rotation = stride * 0.35;
    } else if (this.animState === 'mine') {
      // Mining tool swing cycle
      const swingFreq = 6.0;
      const progress = (this.animTime * swingFreq) % (Math.PI * 2);
      const swing = Math.sin(progress);

      this.armFrontNode.y = baseArmFront.y;
      this.armBackNode.y = baseArmBack.y;
      this.armFrontNode.rotation = -0.6 + swing * 1.2;
      this.torsoNode.rotation = swing > 0 ? 0.12 : -0.05;
      this.torsoNode.y = baseTorso.y + (swing > 0 ? 6 : -2);
      this.headNode.y = baseHead.y;
      this.headNode.rotation = swing * 0.1;

      this.legFrontNode.y = baseLegFront.y;
      this.legBackNode.y = baseLegBack.y;
      this.legFrontNode.rotation = 0.1;
      this.legBackNode.rotation = -0.15;
    } else if (this.animState === 'attack') {
      // Melee attack swing
      const attackFreq = 7.5;
      const progress = (this.animTime * attackFreq) % (Math.PI * 2);
      const swing = Math.sin(progress);

      this.armFrontNode.y = baseArmFront.y;
      this.armBackNode.y = baseArmBack.y;
      this.armFrontNode.rotation = -0.8 + swing * 1.5;
      this.armBackNode.rotation = 0.4 - swing * 0.6;
      this.torsoNode.rotation = swing > 0 ? 0.18 : -0.08;
      this.torsoNode.y = baseTorso.y + (swing > 0 ? 8 : -3);
      this.headNode.y = baseHead.y;
      this.headNode.rotation = swing * 0.15;

      this.legFrontNode.y = baseLegFront.y;
      this.legBackNode.y = baseLegBack.y;
      this.legFrontNode.rotation = 0.15;
      this.legBackNode.rotation = -0.2;
    } else if (this.animState === 'damage') {
      // Recoil / hit reaction
      const wobble = Math.sin(this.animTime * 18.0) * Math.exp(-this.animTime * 2);
      this.torsoNode.rotation = -0.15 + wobble * 0.1;
      this.torsoNode.y = baseTorso.y + 4;
      this.headNode.rotation = -0.2 + wobble * 0.15;
      this.headNode.y = baseHead.y - 2;

      this.armFrontNode.rotation = -0.4 + wobble * 0.2;
      this.armBackNode.rotation = 0.3 + wobble * 0.2;
      this.legFrontNode.rotation = -0.1;
      this.legBackNode.rotation = 0.1;
    } else if (this.animState === 'death') {
      // Slump and fall
      this.torsoNode.rotation = -0.6;
      this.torsoNode.y = baseTorso.y + 16;
      this.headNode.rotation = -0.4;
      this.headNode.y = baseHead.y + 12;

      this.armFrontNode.rotation = 0.8;
      this.armBackNode.rotation = 0.6;
      this.legFrontNode.rotation = 0.4;
      this.legBackNode.rotation = 0.7;
    }
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
    this.partSprites.forEach((sprite) => sprite.destroy());
    this.partSprites.clear();
    super.destroy();
  }
}
