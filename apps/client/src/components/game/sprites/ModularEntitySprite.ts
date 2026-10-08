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

  // Resting forearm angle in arm_front.png (0 rad = horizontal forward aiming aligned with Admin preview)
  public static readonly NEUTRAL_ARM_ANGLE = 0;

  // Aiming controller
  protected aimAngle: number | null = null;
  protected targetAimAngle: number | null = null;
  protected recoilKick: number = 0;

  // Base part sprites
  protected partSprites: Map<string, Sprite> = new Map();

  // Animation controller
  protected animState: ModularAnimationState = 'idle';
  protected animTime: number = 0;
  protected walkSpeedMultiplier: number = 1.0;
  protected swingSpeed: number = 1.5; // swings per second
  protected mineAnimTime: number = 0; // dedicated time for mining / attack swings

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
    if ((state === 'mine' || state === 'attack') && this.animState !== 'mine' && this.animState !== 'attack') {
      this.mineAnimTime = 0;
    }
    this.animState = state;
  }

  /**
   * Get the current animation state.
   */
  getState(): ModularAnimationState {
    return this.animState;
  }

  /**
   * Set mining / melee swing speed in swings per second (e.g. 1.5, 2.0).
   */
  setSwingSpeed(speed: number): void {
    if (typeof speed === 'number' && speed > 0) {
      this.swingSpeed = speed;
    }
  }

  /**
   * Get the configured swing speed in swings per second.
   */
  getSwingSpeed(): number {
    return this.swingSpeed;
  }

  /**
   * Get the current cycle progress phi in [0, 1) of the mining/attack swing.
   */
  getSwingProgress(): number {
    if (this.animState !== 'mine' && this.animState !== 'attack') return 0;
    return (this.mineAnimTime * this.swingSpeed) % 1;
  }

  /**
   * Set moving velocity to automatically toggle between 'idle' and 'walk'.
   */
  setMoveVelocity(vx: number, vy: number): void {
    const speed = Math.hypot(vx, vy);
    if (speed > 0.005) {
      this.walkSpeedMultiplier = 1.0;
      if (this.animState !== 'walk') {
        this.setState('walk');
      }
    } else {
      this.walkSpeedMultiplier = 1.0;
      if (this.animState !== 'idle') {
        this.setState('idle');
      }
    }
  }

  setWalkSpeedMultiplier(multiplier: number): void {
    this.walkSpeedMultiplier = multiplier;
  }

  getWalkSpeedMultiplier(): number {
    return this.walkSpeedMultiplier;
  }

  /**
   * Set target aim angle in character-local radians.
   * 0 rad points horizontally forward in the direction the character is facing.
   * Negative angles point upwards (-Math.PI/2 is straight up).
   * Positive angles point downwards (+Math.PI/2 is straight down).
   * Passing null releases aiming and returns to default procedural idle/walk arm swing.
   */
  setAimAngle(angle: number | null, immediate: boolean = false): void {
    this.targetAimAngle = angle;
    if (immediate || this.aimAngle === null || angle === null) {
      this.aimAngle = angle;
    }
  }

  /**
   * Get the current aim angle in local character space, or null if not aiming.
   */
  getAimAngle(): number | null {
    return this.aimAngle;
  }

  /**
   * Trigger an instantaneous recoil kickback impulse on the aiming arm
   * (e.g. when firing a weapon), which recovers smoothly over time.
   */
  triggerRecoil(kickAmount: number = 0.25): void {
    this.recoilKick = kickAmount;
  }

  /**
   * Return the unscaled local offset of the front arm shoulder pivot relative to the pelvis origin.
   */
  getShoulderOffset(): { x: number; y: number } {
    const baseArm = this.baseOffsets['arm_front'] || { x: -153, y: -95 };
    // Pivot anchor [0.08, 0.18] on 271x150 arm_front texture = [21.68, 27]
    return { x: baseArm.x + 22, y: baseArm.y + 27 };
  }

  /**
   * Frame tick update to drive procedural joint transformations.
   */
  update(deltaTime: number): void {
    if (this.destroyed) return;
    this.animTime += deltaTime;
    if (this.animState === 'mine' || this.animState === 'attack') {
      this.mineAnimTime += deltaTime;
    }

    // Smoothly interpolate dynamic aim angle towards target
    if (this.targetAimAngle !== null) {
      if (this.aimAngle === null) {
        this.aimAngle = this.targetAimAngle;
      } else {
        let diff = this.targetAimAngle - this.aimAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const lerpFactor = Math.min(1.0, 1 - Math.exp(-28 * deltaTime));
        this.aimAngle += diff * lerpFactor;
      }
    } else {
      this.aimAngle = null;
    }

    // Decay recoil kick impulse
    if (Math.abs(this.recoilKick) > 0.001) {
      this.recoilKick *= Math.exp(-22 * deltaTime);
    } else {
      this.recoilKick = 0;
    }

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

    const isAiming = this.aimAngle !== null && this.animState !== 'damage' && this.animState !== 'death';
    // Angle rotation for arm_front: aimAngle directly sets arm rotation matching the Admin preview (0 rad = horizontal forward)
    const baseAimRotation = isAiming
      ? this.aimAngle! - ModularEntitySprite.NEUTRAL_ARM_ANGLE - this.recoilKick
      : 0;

    if (this.animState === 'idle') {
      // Gentle breathing loop
      const breath = Math.sin(this.animTime * 2.2);
      this.torsoNode.rotation = 0;
      this.torsoNode.y = baseTorso.y + breath * 3;
      this.torsoNode.rotation = 0;

      if (isAiming) {
        this.headNode.y = baseHead.y + breath * 2;
        this.headNode.rotation = Math.max(-0.35, Math.min(0.35, this.aimAngle! * 0.22)) + breath * 0.01;
        this.armFrontNode.y = baseArmFront.y;
        this.armBackNode.y = baseArmBack.y;
        this.armFrontNode.rotation = baseAimRotation;
        this.armBackNode.rotation = -breath * 0.03;
      } else {
        this.headNode.y = baseHead.y + breath * 2;
        this.headNode.rotation = breath * 0.02;
        this.armFrontNode.y = baseArmFront.y;
        this.armBackNode.y = baseArmBack.y;
        this.armFrontNode.rotation = breath * 0.04;
        this.armBackNode.rotation = -breath * 0.03;
      }

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

      const legAmplitude = 0.5;
      this.legFrontNode.rotation = stride * legAmplitude;
      this.legBackNode.rotation = -stride * legAmplitude;

      this.legFrontNode.y = baseLegFront.y - Math.max(0, strideCos) * 6;
      this.legBackNode.y = baseLegBack.y - Math.max(0, -strideCos) * 6;

      this.armFrontNode.y = baseArmFront.y;
      this.armBackNode.y = baseArmBack.y;
      this.armBackNode.rotation = stride * 0.35;

      if (isAiming) {
        this.headNode.y = baseHead.y + bounce * 0.8;
        this.headNode.rotation = Math.max(-0.35, Math.min(0.35, this.aimAngle! * 0.22));
        this.armFrontNode.rotation = baseAimRotation;
      } else {
        this.headNode.y = baseHead.y + bounce * 0.8;
        this.headNode.rotation = stride * 0.03;
        this.armFrontNode.rotation = -stride * 0.35;
      }
    } else if (this.animState === 'mine') {
      if (this.manifest?.miningStyle === 'hands') {
        // Dual-hand rapid claw digging animation scaled by swingSpeed
        const digFreq = 6.0 * Math.PI * (this.swingSpeed / 1.5);
        const swingFront = Math.sin(this.mineAnimTime * digFreq);
        const swingBack = Math.sin(this.mineAnimTime * digFreq + Math.PI);

        this.armFrontNode.x = baseArmFront.x + Math.cos(this.mineAnimTime * digFreq) * 16;
        this.armBackNode.x = baseArmBack.x + Math.cos(this.mineAnimTime * digFreq + Math.PI) * 16;
        this.armFrontNode.y = baseArmFront.y + Math.abs(swingFront) * 8;
        this.armBackNode.y = baseArmBack.y + Math.abs(swingBack) * 8;
        this.armFrontNode.rotation = -0.15 + swingFront * 0.65;
        this.armBackNode.rotation = -0.15 + swingBack * 0.65;

        this.torsoNode.rotation = 0.16 + Math.sin(this.mineAnimTime * digFreq * 2) * 0.04;
        this.torsoNode.y = baseTorso.y + 4 + Math.sin(this.mineAnimTime * digFreq * 2) * 3;
        this.headNode.y = baseHead.y + 2;
        this.headNode.rotation = 0.14 + Math.sin(this.mineAnimTime * digFreq) * 0.06;

        this.legFrontNode.y = baseLegFront.y;
        this.legBackNode.y = baseLegBack.y;
        this.legFrontNode.rotation = 0.15;
        this.legBackNode.rotation = -0.2;
      } else {
        // Natural mining tool swing cycle:
        // phi in [0, 1) represents position in swing cycle (1 full cycle = 1 / swingSpeed seconds)
        const phi = (this.mineAnimTime * this.swingSpeed) % 1;
        let swing = 0;
        if (phi < 0.5) {
          // Wind-up phase (0 -> 0.5): draw back arm smoothly from 0 to -1
          swing = -Math.sin(Math.PI * phi);
        } else if (phi < 0.75) {
          // Power strike phase (0.5 -> 0.75): snap forward fast from -1 to +1 (impact at 0.75)
          const tau = (phi - 0.5) / 0.25;
          swing = -Math.cos(Math.PI * tau);
        } else {
          // Recovery phase (0.75 -> 1.0): return smoothly from +1 back to 0
          const tau = (phi - 0.75) / 0.25;
          swing = Math.cos((Math.PI / 2) * tau);
        }

        this.armFrontNode.y = baseArmFront.y;
        this.armBackNode.y = baseArmBack.y;
        this.torsoNode.rotation = swing > 0 ? swing * 0.12 : swing * 0.05;
        this.torsoNode.y = baseTorso.y + (swing > 0 ? swing * 6 : swing * 2);
        this.headNode.y = baseHead.y;

        if (isAiming) {
          // Dynamic swing superimposed around the aim line directly towards the target tile
          this.armFrontNode.rotation = baseAimRotation + (-0.2 + swing * 0.8);
          this.headNode.rotation = Math.max(-0.35, Math.min(0.35, this.aimAngle! * 0.22)) + swing * 0.05;
        } else {
          this.armFrontNode.rotation = -0.6 + swing * 1.2;
          this.headNode.rotation = swing * 0.1;
        }

        this.legFrontNode.y = baseLegFront.y;
        this.legBackNode.y = baseLegBack.y;
        this.legFrontNode.rotation = 0.1;
        this.legBackNode.rotation = -0.15;
      }

    } else if (this.animState === 'attack') {
      // Melee attack swing aligned with swingSpeed
      const phi = (this.mineAnimTime * this.swingSpeed) % 1;
      let swing = 0;
      if (phi < 0.5) {
        swing = -Math.sin(Math.PI * phi);
      } else if (phi < 0.75) {
        const tau = (phi - 0.5) / 0.25;
        swing = -Math.cos(Math.PI * tau);
      } else {
        const tau = (phi - 0.75) / 0.25;
        swing = Math.cos((Math.PI / 2) * tau);
      }

      this.armFrontNode.y = baseArmFront.y;
      this.armBackNode.y = baseArmBack.y;
      this.armBackNode.rotation = 0.4 - swing * 0.6;
      this.torsoNode.rotation = swing > 0 ? swing * 0.18 : swing * 0.08;
      this.torsoNode.y = baseTorso.y + (swing > 0 ? swing * 8 : swing * 3);
      this.headNode.y = baseHead.y;

      if (isAiming) {
        this.armFrontNode.rotation = baseAimRotation + (-0.2 + swing * 0.95);
        this.headNode.rotation = Math.max(-0.35, Math.min(0.35, this.aimAngle! * 0.22)) + swing * 0.06;
      } else {
        this.armFrontNode.rotation = -0.8 + swing * 1.5;
        this.headNode.rotation = swing * 0.15;
      }

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
