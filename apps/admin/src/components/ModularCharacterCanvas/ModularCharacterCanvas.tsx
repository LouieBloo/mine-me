import { useEffect, useRef, useState } from 'react';
import { Application, Assets, Sprite, Texture, Container, Graphics } from 'pixi.js';
import { getAssetUrl, MINER_SKELETON_PATH, MODULAR_GEAR_SLOTS, type GearSubType } from '@mine-me/shared';
import './ModularCharacterCanvas.css';

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

export interface ModularCharacterCanvasProps {
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
  selectedGear?: Array<{ url: string; subType: GearSubType }>;
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
  className?: string;
}

export default function ModularCharacterCanvas({
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
  selectedGear = [],
  partOverrides = {},
  rootOffsetY = 0,
  width = 460,
  height = 520,
  className = '',
}: ModularCharacterCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // References to joint nodes and sprite instances for live updates
  const nodesRef = useRef<{
    root: Container | null;
    pelvis: Container | null;
    torso: Container | null;
    head: Container | null;
    armFront: Container | null;
    armBack: Container | null;
    legFront: Container | null;
    legBack: Container | null;
    toolSocket: Container | null;
    debugLayer: Graphics | null;
  }>({
    root: null,
    pelvis: null,
    torso: null,
    head: null,
    armFront: null,
    armBack: null,
    legFront: null,
    legBack: null,
    toolSocket: null,
    debugLayer: null,
  });

  const partSpritesRef = useRef<Map<string, Sprite>>(new Map());
  const gearSpritesRef = useRef<Map<string, Sprite[]>>(new Map());
  const baseOffsetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const animTimeRef = useRef<number>(0);

  // Live state refs so Pixi ticker uses latest props without reloading
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
    rootOffsetY,
    width,
    height,
  ]);

  // Load Pixi Application and Skeleton
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
        rootContainer.y = height / 2 + 100; // Position feet comfortably above bottom

        const pelvisNode = new Container();
        const torsoNode = new Container();
        const torsoBodyNode = new Container();
        const headNode = new Container();
        const armFrontNode = new Container();
        const armBackNode = new Container();
        const legFrontNode = new Container();
        const legBackNode = new Container();
        const toolSocket = new Container();
        const debugLayer = new Graphics();

        // Joint hierarchy
        torsoNode.addChild(armBackNode);
        torsoNode.addChild(torsoBodyNode);
        torsoNode.addChild(headNode);
        torsoNode.addChild(armFrontNode);
        armFrontNode.addChild(toolSocket);

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
          legFront: legFrontNode,
          legBack: legBackNode,
          toolSocket,
          debugLayer,
        };

        toolSocket.x = -10;
        toolSocket.y = 120;

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
          // Base scale factor so 1024 character fits nicely in ~500px canvas height
          const baseScaleRatio = Math.min(width / 450, height / 850) * 0.85 * currentScaleProp;
          nodes.root.scale.y = baseScaleRatio;
          nodes.root.scale.x = currentIsFlipped ? -baseScaleRatio : baseScaleRatio;
          nodes.root.x = width / 2;
          nodes.root.y = height / 2 + (currentRootOffsetY !== undefined ? currentRootOffsetY : 20);

          // Part visibility, size & highlighting
          partSpritesRef.current.forEach((sprite, partName) => {
            sprite.visible = !currentHidden.includes(partName);
            if (currentHighlight === partName) {
              sprite.tint = 0xfde047; // Bright yellow highlight
            } else {
              sprite.tint = 0xffffff;
            }

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

          // Procedural animation update
          const dt = (ticker.deltaTime || 1) / 60;
          if (currentIsPlaying) {
            animTimeRef.current += dt * currentSpeed;
          }

          const animTime = animTimeRef.current;

          // Base offsets with live override support
          const getOffset = (part: string, defaultOffset: { x: number; y: number }) => {
            const base = baseOffsetsRef.current[part] || defaultOffset;
            const ov = currentOverrides?.[part];
            return {
              x: ov?.offsetX !== undefined ? ov.offsetX : base.x,
              y: ov?.offsetY !== undefined ? ov.offsetY : base.y,
            };
          };

          const baseTorso = getOffset('torso', { x: 0, y: 0 });
          const baseHead = getOffset('head', { x: 2, y: -245 });
          const baseArmFront = getOffset('arm_front', { x: -78, y: -145 });
          const baseArmBack = getOffset('arm_back', { x: 90, y: -180 });
          const baseLegFront = getOffset('leg_front', { x: -20, y: -55 });
          const baseLegBack = getOffset('leg_back', { x: 35, y: -55 });

          // Position static arm joints if not animating or starting from base
          nodes.armFront.x = baseArmFront.x;
          nodes.armBack.x = baseArmBack.x;
          nodes.head.x = baseHead.x;
          nodes.legFront.x = baseLegFront.x;
          nodes.legBack.x = baseLegBack.x;
          nodes.torso.x = baseTorso.x;

          if (currentAnimState === 'idle') {
            const breath = Math.sin(animTime * 2.2);
            nodes.torso.rotation = 0;
            nodes.torso.y = baseTorso.y + breath * 3;
            nodes.head.y = baseHead.y + breath * 2;
            nodes.head.rotation = breath * 0.02;

            nodes.armFront.y = baseArmFront.y;
            nodes.armBack.y = baseArmBack.y;
            nodes.armFront.rotation = breath * 0.04;
            nodes.armBack.rotation = -breath * 0.03;

            nodes.legFront.rotation = 0;
            nodes.legBack.rotation = 0;
            nodes.legFront.y = baseLegFront.y;
            nodes.legBack.y = baseLegBack.y;
          } else if (currentAnimState === 'walk') {
            const freq = 9.0;
            const stride = Math.sin(animTime * freq);
            const strideCos = Math.cos(animTime * freq);
            const bounce = Math.abs(stride) * 8;

            nodes.torso.rotation = 0;
            nodes.torso.y = baseTorso.y + bounce;
            nodes.head.y = baseHead.y + bounce * 0.8;
            nodes.head.rotation = stride * 0.03;

            const legAmp = 0.5;
            nodes.legFront.rotation = stride * legAmp;
            nodes.legBack.rotation = -stride * legAmp;

            nodes.legFront.y = baseLegFront.y - Math.max(0, strideCos) * 6;
            nodes.legBack.y = baseLegBack.y - Math.max(0, -strideCos) * 6;

            nodes.armFront.y = baseArmFront.y;
            nodes.armBack.y = baseArmBack.y;
            nodes.armFront.rotation = -stride * 0.35;
            nodes.armBack.rotation = stride * 0.35;
          } else if (currentAnimState === 'mine') {
            const swingFreq = 6.0;
            const progress = (animTime * swingFreq) % (Math.PI * 2);
            const swing = Math.sin(progress);

            nodes.armFront.y = baseArmFront.y;
            nodes.armBack.y = baseArmBack.y;
            nodes.armFront.rotation = -0.6 + swing * 1.2;
            nodes.torso.rotation = swing > 0 ? 0.12 : -0.05;
            nodes.torso.y = baseTorso.y + (swing > 0 ? 6 : -2);
            nodes.head.y = baseHead.y;
            nodes.head.rotation = swing * 0.1;

            nodes.legFront.y = baseLegFront.y;
            nodes.legBack.y = baseLegBack.y;
            nodes.legFront.rotation = 0.1;
            nodes.legBack.rotation = -0.15;
          }

          // Draw Debug Overlays
          const g = nodes.debugLayer;
          if (g) {
            g.clear();

            if (bonesDebug) {
              // Draw skeleton connection lines
              g.moveTo(0, 0); // Pelvis
              g.lineTo(nodes.torso.x, nodes.torso.y); // Pelvis -> Torso
              g.lineTo(nodes.torso.x + nodes.head.x, nodes.torso.y + nodes.head.y); // Torso -> Head

              // Pelvis -> Leg Front & Back
              g.moveTo(0, 0);
              g.lineTo(nodes.legFront.x, nodes.legFront.y);
              g.moveTo(0, 0);
              g.lineTo(nodes.legBack.x, nodes.legBack.y);

              // Torso -> Arms
              g.moveTo(nodes.torso.x, nodes.torso.y);
              g.lineTo(nodes.torso.x + nodes.armFront.x, nodes.torso.y + nodes.armFront.y);
              g.moveTo(nodes.torso.x, nodes.torso.y);
              g.lineTo(nodes.torso.x + nodes.armBack.x, nodes.torso.y + nodes.armBack.y);

              g.stroke({ width: 3, color: 0x38bdf8, alpha: 0.8 }); // sky-400
            }

            if (jointsDebug) {
              // Pelvis joint (Green)
              g.circle(0, 0, 8);
              g.fill(0x22c55e);

              // Head / Neck joint (Yellow)
              g.circle(nodes.torso.x + nodes.head.x, nodes.torso.y + nodes.head.y, 6);
              g.fill(0xfacc15);

              // Shoulder Front & Back (Orange)
              g.circle(nodes.torso.x + nodes.armFront.x, nodes.torso.y + nodes.armFront.y, 6);
              g.fill(0xf97316);
              g.circle(nodes.torso.x + nodes.armBack.x, nodes.torso.y + nodes.armBack.y, 5);
              g.fill(0xf97316);

              // Hip joints (Purple)
              g.circle(nodes.legFront.x, nodes.legFront.y, 6);
              g.fill(0xa855f7);
              g.circle(nodes.legBack.x, nodes.legBack.y, 5);
              g.fill(0xa855f7);

              // Tool socket (Red)
              g.circle(
                nodes.torso.x + nodes.armFront.x + nodes.toolSocket.x,
                nodes.torso.y + nodes.armFront.y + nodes.toolSocket.y,
                6
              );
              g.fill(0xef4444);
            }

            if (bboxDebug) {
              partSpritesRef.current.forEach((sprite) => {
                if (!sprite.visible) return;
                const b = sprite.getBounds();
                // Map screen bounds to root container local coordinates
                const localTL = nodes.root!.toLocal({ x: b.x, y: b.y });
                g.rect(localTL.x, localTL.y, b.width / baseScaleRatio, b.height / baseScaleRatio);
                g.stroke({ width: 1.5, color: 0xec4899, alpha: 0.7 }); // pink-500
              });
            }
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

  // Handle live gear layers equipping
  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes.root) return;

    // Clear previous gear
    gearSpritesRef.current.forEach((sprites) => {
      sprites.forEach((s) => {
        if (s.parent) s.parent.removeChild(s);
        s.destroy();
      });
    });
    gearSpritesRef.current.clear();

    if (!selectedGear || selectedGear.length === 0) return;

    let active = true;
    const loadGear = async () => {
      for (const gear of selectedGear) {
        if (!active) return;
        try {
          const cacheKey = `admin_gear_${gear.url}_${Date.now()}`;
          const texture = await Assets.load({ src: gear.url, alias: cacheKey });
          if (!active) return;

          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);

          const slotNodeName = MODULAR_GEAR_SLOTS[gear.subType] || 'torso';
          let targetNode: Container | null = null;
          if (slotNodeName === 'headNode') targetNode = nodes.head;
          else if (slotNodeName === 'torsoNode') targetNode = nodes.torso;
          else if (slotNodeName === 'legFrontNode') targetNode = nodes.legFront;
          else if (slotNodeName === 'toolSocket') targetNode = nodes.toolSocket;
          else targetNode = nodes.torso;

          if (targetNode) {
            targetNode.addChild(sprite);
            const list = gearSpritesRef.current.get(gear.subType) || [];
            list.push(sprite);
            gearSpritesRef.current.set(gear.subType, list);
          }
        } catch (e) {
          console.warn(`[ModularCharacterCanvas] Could not load gear layer ${gear.url}:`, e);
        }
      }
    };

    loadGear();

    return () => {
      active = false;
    };
  }, [selectedGear]);

  return (
    <div
      ref={containerRef}
      className={`modular-character-canvas-wrapper relative ${className}`}
      style={{ width, height }}
    >
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-20">
          <div className="w-10 h-10 border-4 border-sol border-t-transparent rounded-full animate-spin mb-3"></div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Loading Skeleton Rig...
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 m-4 text-center text-red-400 font-bold text-sm bg-red-950/60 rounded-xl border border-red-900/60 z-20">
          {error}
        </div>
      )}
    </div>
  );
}
