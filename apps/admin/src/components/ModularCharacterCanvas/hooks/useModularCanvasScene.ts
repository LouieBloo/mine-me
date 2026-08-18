import { useEffect, useRef, useState } from 'react';
import { Application, Assets, Sprite, Texture, Container, Graphics } from 'pixi.js';
import { getAssetUrl, MINER_SKELETON_PATH } from '@mine-me/shared';
import type { CharacterJointNodes } from '../animation/ModularAnimationEngine';
import { ModularAnimationEngine, type CharacterAnimationState } from '../animation/ModularAnimationEngine';
import { ModularDebugRenderer } from '../renderers/ModularDebugRenderer';

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

export interface SkeletonHandJointDef {
  offset: [number, number];
}

export interface SkeletonToolSocketDef {
  offset: [number, number];
  scale?: number;
  rotation?: number;
}

export interface SkeletonManifest {
  version: string;
  canvas_size: [number, number];
  pelvis_origin: [number, number];
  hand_joint?: SkeletonHandJointDef;
  tool_socket?: SkeletonToolSocketDef;
  parts: Record<string, SkeletonPartDef>;
}

export interface HandJointOverride {
  offsetX: number;
  offsetY: number;
}

export interface ToolSocketOverride {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
}

export interface UseModularCanvasSceneOptions {
  manifestUrl?: string;
  animationState?: CharacterAnimationState;
  speedMultiplier?: number;
  isPlaying?: boolean;
  isFlipped?: boolean;
  scale?: number;
  showDebugJoints?: boolean;
  showDebugBones?: boolean;
  showDebugBbox?: boolean;
  hiddenParts?: string[];
  highlightedPart?: string | null;
  handJointOverride?: HandJointOverride;
  toolSocketOverride?: ToolSocketOverride;
  partOverrides?: Record<
    string,
    {
      width?: number;
      height?: number;
      offsetX?: number;
      offsetY?: number;
      pivotX?: number;
      pivotY?: number;
    }
  >;
  rootOffsetY?: number;
  width?: number;
  height?: number;
}

export function useModularCanvasScene({
  manifestUrl,
  animationState = 'idle',
  speedMultiplier = 1.0,
  isPlaying = true,
  isFlipped = false,
  scale = 1.0,
  showDebugJoints = false,
  showDebugBones = false,
  showDebugBbox = false,
  hiddenParts = [],
  highlightedPart = null,
  partOverrides = {},
  handJointOverride,
  toolSocketOverride,
  rootOffsetY = 0,
  width = 460,
  height = 520,
}: UseModularCanvasSceneOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nodesRef = useRef<CharacterJointNodes & { debugLayer: Graphics | null }>({
    root: null,
    pelvis: null,
    torso: null,
    head: null,
    armFront: null,
    armBack: null,
    handFront: null,
    legFront: null,
    legBack: null,
    toolSocket: null,
    debugLayer: null,
  });

  const partSpritesRef = useRef<Map<string, Sprite>>(new Map());
  const baseOffsetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const animTimeRef = useRef<number>(0);

  const statePropsRef = useRef({
    animationState,
    speedMultiplier,
    isPlaying,
    isFlipped,
    scale,
    showDebugJoints,
    showDebugBones,
    showDebugBbox,
    hiddenParts,
    highlightedPart,
    partOverrides,
    handJointOverride,
    toolSocketOverride,
    rootOffsetY,
    width,
    height,
  });

  useEffect(() => {
    statePropsRef.current = {
      animationState,
      speedMultiplier,
      isPlaying,
      isFlipped,
      scale,
      showDebugJoints,
      showDebugBones,
      showDebugBbox,
      hiddenParts,
      highlightedPart,
      partOverrides,
      handJointOverride,
      toolSocketOverride,
      rootOffsetY,
      width,
      height,
    };
  }, [
    animationState,
    speedMultiplier,
    isPlaying,
    isFlipped,
    scale,
    showDebugJoints,
    showDebugBones,
    showDebugBbox,
    hiddenParts,
    highlightedPart,
    partOverrides,
    handJointOverride,
    toolSocketOverride,
    rootOffsetY,
    width,
    height,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    let pixiApp: Application | null = null;

    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        const app = new Application();
        await app.init({
          backgroundAlpha: 0,
          antialias: false,
          roundPixels: true,
          width,
          height,
        });

        if (destroyed) {
          if (app.renderer) {
            app.destroy({ removeView: true });
          }
          return;
        }

        pixiApp = app;
        appRef.current = app;
        if (containerRef.current) {
          containerRef.current.appendChild(app.canvas);
        }

        const targetManifestUrl = manifestUrl || getAssetUrl(MINER_SKELETON_PATH);
        const resp = await fetch(targetManifestUrl);
        if (!resp.ok) throw new Error(`Failed to load skeleton manifest (${resp.statusText})`);
        const manifest: SkeletonManifest = await resp.json();

        if (destroyed) {
          if (app.renderer) {
            app.destroy({ removeView: true });
          }
          return;
        }

        const lastSlash = targetManifestUrl.lastIndexOf('/');
        const baseDir = lastSlash !== -1 ? targetManifestUrl.substring(0, lastSlash + 1) : '';

        // Root container centered in canvas
        const rootContainer = new Container();
        rootContainer.x = width / 2;
        rootContainer.y = height / 2 + 100;

        const pelvisNode = new Container();
        const torsoNode = new Container();
        const torsoBodyNode = new Container();
        const headNode = new Container();
        const armFrontNode = new Container();
        const armBackNode = new Container();
        const handFrontNode = new Container();
        const legFrontNode = new Container();
        const legBackNode = new Container();
        const toolSocket = new Container();
        const debugLayer = new Graphics();

        // Joint hierarchy
        handFrontNode.addChild(toolSocket);
        armFrontNode.addChild(handFrontNode);
        torsoNode.addChild(armBackNode);
        torsoNode.addChild(torsoBodyNode);
        torsoNode.addChild(headNode);
        torsoNode.addChild(armFrontNode);

        pelvisNode.addChild(legBackNode);
        pelvisNode.addChild(torsoNode);
        pelvisNode.addChild(legFrontNode);

        rootContainer.addChild(pelvisNode);
        rootContainer.addChild(debugLayer);
        pixiApp.stage.addChild(rootContainer);

        nodesRef.current = {
          root: rootContainer,
          pelvis: pelvisNode,
          torso: torsoNode,
          head: headNode,
          armFront: armFrontNode,
          armBack: armBackNode,
          handFront: handFrontNode,
          legFront: legFrontNode,
          legBack: legBackNode,
          toolSocket,
          debugLayer,
        };

        if (manifest.hand_joint) {
          handFrontNode.x = manifest.hand_joint.offset[0];
          handFrontNode.y = manifest.hand_joint.offset[1];
        } else {
          handFrontNode.x = 210;
          handFrontNode.y = 100;
        }

        toolSocket.x = 0;
        toolSocket.y = 0;

        // Load and attach part sprites
        partSpritesRef.current.clear();
        baseOffsetsRef.current = {};

        for (const [partName, partDef] of Object.entries(manifest.parts)) {
          if (destroyed) return;

          const partUrl = `${baseDir}${partDef.file}`;
          const cacheKey = `admin_part_${partUrl}_${Date.now()}`;
          const texture: Texture = await Assets.load({ src: partUrl, alias: cacheKey });
          if (destroyed) return;

          const sprite = new Sprite(texture);
          sprite.anchor.set(partDef.pivot_anchor[0], partDef.pivot_anchor[1]);
          partSpritesRef.current.set(partName, sprite);

          let targetNode: Container | null = null;
          switch (partName) {
            case 'head': targetNode = headNode; break;
            case 'torso': targetNode = torsoBodyNode; break;
            case 'arm_front': targetNode = armFrontNode; break;
            case 'arm_back': targetNode = armBackNode; break;
            case 'leg_front': targetNode = legFrontNode; break;
            case 'leg_back': targetNode = legBackNode; break;
          }

          if (targetNode) {
            targetNode.x = partDef.offset_from_pelvis[0];
            targetNode.y = partDef.offset_from_pelvis[1];
            baseOffsetsRef.current[partName] = { x: targetNode.x, y: targetNode.y };
            targetNode.addChild(sprite);
          }
        }

        // Add 60 FPS update ticker
        pixiApp.ticker.add((ticker) => {
          const {
            animationState: currentAnimState,
            speedMultiplier: currentSpeed,
            isPlaying: currentIsPlaying,
            isFlipped: currentIsFlipped,
            scale: currentScaleProp,
            showDebugJoints: jointsDebug,
            showDebugBones: bonesDebug,
            showDebugBbox: bboxDebug,
            hiddenParts: currentHidden,
            highlightedPart: currentHighlight,
            partOverrides: currentOverrides,
            rootOffsetY: currentRootOffsetY,
          } = statePropsRef.current;

          const nodes = nodesRef.current;
          if (
            !nodes.root ||
            !nodes.torso ||
            !nodes.head ||
            !nodes.armFront ||
            !nodes.armBack ||
            !nodes.legFront ||
            !nodes.legBack ||
            !nodes.toolSocket
          ) {
            return;
          }

          // Scale, Flipping & Viewport Positioning
          const baseScaleRatio = Math.min(width / 450, height / 850) * 0.85 * currentScaleProp;
          nodes.root.scale.y = baseScaleRatio;
          nodes.root.scale.x = currentIsFlipped ? -baseScaleRatio : baseScaleRatio;
          nodes.root.x = width / 2;
          nodes.root.y = height / 2 + (currentRootOffsetY !== undefined ? currentRootOffsetY : 20);

          // Part visibility, size & highlighting
          partSpritesRef.current.forEach((sprite, partName) => {
            sprite.visible = !currentHidden.includes(partName);
            sprite.tint = currentHighlight === partName ? 0xfde047 : 0xffffff;

            const override = currentOverrides?.[partName];
            if (override) {
              if (override.width !== undefined && override.width > 0) {
                sprite.width = override.width;
              }
              if (override.height !== undefined && override.height > 0) {
                sprite.height = override.height;
              }
              if (override.pivotX !== undefined && override.pivotY !== undefined) {
                sprite.anchor.set(override.pivotX, override.pivotY);
              }
            }
          });

          // Apply hand joint live override or manifest config
          if (nodes.handFront) {
            const handOv = statePropsRef.current.handJointOverride;
            if (handOv) {
              nodes.handFront.x = handOv.offsetX;
              nodes.handFront.y = handOv.offsetY;
            } else if (manifest.hand_joint) {
              nodes.handFront.x = manifest.hand_joint.offset[0];
              nodes.handFront.y = manifest.hand_joint.offset[1];
            } else {
              nodes.handFront.x = 210;
              nodes.handFront.y = 100;
            }
          }

          // Apply tool socket live override or manifest config
          const socketOv = statePropsRef.current.toolSocketOverride;
          if (socketOv) {
            nodes.toolSocket.x = socketOv.offsetX;
            nodes.toolSocket.y = socketOv.offsetY;
            nodes.toolSocket.scale.set(socketOv.scale);
            nodes.toolSocket.rotation = socketOv.rotation;
          } else if (manifest.tool_socket) {
            nodes.toolSocket.x = manifest.tool_socket.offset[0];
            nodes.toolSocket.y = manifest.tool_socket.offset[1];
            if (manifest.tool_socket.scale !== undefined) {
              nodes.toolSocket.scale.set(manifest.tool_socket.scale);
            }
            if (manifest.tool_socket.rotation !== undefined) {
              nodes.toolSocket.rotation = manifest.tool_socket.rotation;
            }
          } else {
            nodes.toolSocket.x = 0;
            nodes.toolSocket.y = 0;
            nodes.toolSocket.scale.set(1);
            nodes.toolSocket.rotation = 0;
          }

          // Procedural animation update
          const dt = (ticker.deltaTime || 1) / 60;
          if (currentIsPlaying) {
            animTimeRef.current += dt * currentSpeed;
          }

          const animTime = animTimeRef.current;

          const getOffset = (part: string, defaultOffset: { x: number; y: number }) => {
            const base = baseOffsetsRef.current[part] || defaultOffset;
            const ov = currentOverrides?.[part];
            return {
              x: ov?.offsetX !== undefined ? ov.offsetX : base.x,
              y: ov?.offsetY !== undefined ? ov.offsetY : base.y,
            };
          };

          const baseOffsets = {
            torso: getOffset('torso', { x: 0, y: 0 }),
            head: getOffset('head', { x: 2, y: -245 }),
            armFront: getOffset('arm_front', { x: -78, y: -145 }),
            armBack: getOffset('arm_back', { x: 90, y: -180 }),
            legFront: getOffset('leg_front', { x: -20, y: -55 }),
            legBack: getOffset('leg_back', { x: 35, y: -55 }),
          };

          ModularAnimationEngine.updateJoints(nodes, currentAnimState, animTime, baseOffsets);

          if (nodes.debugLayer) {
            ModularDebugRenderer.renderDebug(nodes.debugLayer, nodes, partSpritesRef.current, {
              showBones: bonesDebug,
              showJoints: jointsDebug,
              showBbox: bboxDebug,
              baseScaleRatio,
            });
          }
        });

        setLoading(false);
      } catch (err: any) {
        console.error('[ModularCharacterCanvas] Error:', err);
        setError(err.message || 'Failed to load modular character');
        setLoading(false);
      }
    };

    init();

    return () => {
      destroyed = true;
      if (pixiApp) {
        try {
          if (pixiApp.renderer) {
            pixiApp.destroy({ removeView: true });
          }
        } catch (err) {
          console.warn('[ModularCharacterCanvas] Cleanup warning:', err);
        }
      }
      appRef.current = null;
    };
  }, [manifestUrl, width, height]);

  return {
    containerRef,
    nodesRef,
    loading,
    error,
  };
}
