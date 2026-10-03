import { useEffect, useRef } from 'react';
import type { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ModularCharacterSprite } from '../../../../../components/game/sprites';
import type { MiningRemotePlayerRenderer } from '../renderers/MiningRemotePlayerRenderer';
import type { MiningMobRenderer } from '../renderers/MiningMobRenderer';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import type { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import type { Camera2D } from '../../../../../components/game/camera/Camera2D';
import type { ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import type { DynamiteVisualManager } from '../renderers/DynamiteVisualManager';
import type { DroppedItemVisualManager } from '../renderers/DroppedItemVisualManager';
import type { ProjectileVisualManager } from '../renderers/ProjectileVisualManager';
import type { SoundManager } from '../../../../../services/sound';
import {
  MINING_CONFIG,
  type Vector2D,
  type MiningSessionClientState,
  type MiningClientTile,
  type MiningInputState,
  type MiningPosition,
  type MiningActiveDynamite,
  type MiningActiveProjectile,
  type MiningDroppedItem,
  type MiningPlayerBody,
} from '@mine-me/shared';
import type { ActiveFallingRock } from '../renderers/MiningEntityRenderer';
import { miningProfiler } from '../utils/MiningProfiler';
import type { MiningMouseController } from '../input/MiningMouseController';

// Frame Systems
import { MiningPredictionSystem } from '../systems/MiningPredictionSystem';
import { MiningLocalSimulationSystem } from '../systems/MiningLocalSimulationSystem';
import { MiningReticleRenderer } from '../systems/MiningReticleRenderer';
import { MiningDebugRenderer } from '../systems/MiningDebugRenderer';

export interface UseMiningTickerOptions {
  app: Application | null;
  playerContainerRef: React.RefObject<Container | null>;
  gridContainerRef: React.RefObject<Container | null>;
  fallingRocksContainerRef: React.RefObject<Container | null>;
  currentRenderPosRef: React.MutableRefObject<Vector2D>;
  targetServerPosRef: React.MutableRefObject<Vector2D>;
  isFacingLeftRef: React.MutableRefObject<boolean>;
  playerFacingDirRef: React.MutableRefObject<Vector2D>;
  playerSpriteRef: React.RefObject<ModularCharacterSprite | null>;
  remotePlayerRendererRef?: React.RefObject<MiningRemotePlayerRenderer | null>;
  mobRendererRef?: React.RefObject<MiningMobRenderer | null>;
  activeFallingRocksRef: React.MutableRefObject<ActiveFallingRock[]>;
  fallingRockGraphicsMap: React.MutableRefObject<Map<string, Sprite | Graphics>>;
  dynamitesContainerRef?: React.RefObject<Container | null>;
  activeDynamitesRef?: React.MutableRefObject<MiningActiveDynamite[]>;
  dynamiteGraphicsMap?: React.MutableRefObject<Map<string, Sprite | Graphics>>;
  dynamiteTextureRef?: React.RefObject<Texture | null>;
  dynamiteVisualManagerRef?: React.RefObject<DynamiteVisualManager | null>;
  projectilesContainerRef?: React.RefObject<Container | null>;
  activeProjectilesRef?: React.MutableRefObject<MiningActiveProjectile[]>;
  projectileGraphicsMap?: React.MutableRefObject<Map<string, Sprite | Graphics>>;
  bulletTextureRef?: React.RefObject<Texture | null>;
  bulletScaleRef?: React.MutableRefObject<number> | React.RefObject<number>;
  projectileVisualManagerRef?: React.RefObject<ProjectileVisualManager | null>;
  droppedItemVisualManagerRef?: React.RefObject<DroppedItemVisualManager | null>;
  droppedItemsRef?: React.MutableRefObject<MiningDroppedItem[]>;
  reticleGraphicsRef?: React.RefObject<Graphics | null>;
  mouseControllerRef?: React.MutableRefObject<MiningMouseController | null>;
  debugGraphicsRef: React.RefObject<Graphics | null>;
  showDebugRef: React.MutableRefObject<boolean>;
  flashlightRef: React.RefObject<SpotLight | null>;
  lightingEngineRef: React.RefObject<LightingEngine | null>;
  cameraRef: React.RefObject<Camera2D | null>;
  particleEngineRef?: React.RefObject<ParticleEngine | null>;
  playerBodyRef?: React.MutableRefObject<MiningPlayerBody | null>;
  gridRef?: React.MutableRefObject<MiningClientTile[][]>;
  keysPressedRef?: React.MutableRefObject<MiningInputState>;
  isMiningRef?: React.MutableRefObject<boolean>;
  miningTargetRef?: React.MutableRefObject<MiningPosition | null>;
  blockTexturesRef?: React.MutableRefObject<Map<number, Texture>>;
  sessionState?: MiningSessionClientState;
  soundManager?: SoundManager | null;
  weaponSoundUrlRef?: React.MutableRefObject<string | null>;
}

export function useMiningTicker({
  app,
  playerContainerRef,
  gridContainerRef,
  fallingRocksContainerRef,
  currentRenderPosRef,
  targetServerPosRef,
  isFacingLeftRef,
  playerFacingDirRef,
  playerSpriteRef,
  remotePlayerRendererRef,
  mobRendererRef,
  activeFallingRocksRef,
  fallingRockGraphicsMap,
  dynamitesContainerRef,
  activeDynamitesRef,
  dynamiteGraphicsMap,
  dynamiteTextureRef,
  dynamiteVisualManagerRef,
  projectilesContainerRef,
  activeProjectilesRef,
  projectileGraphicsMap,
  bulletTextureRef,
  bulletScaleRef,
  projectileVisualManagerRef,
  droppedItemVisualManagerRef,
  droppedItemsRef,
  reticleGraphicsRef,
  mouseControllerRef,
  debugGraphicsRef,
  showDebugRef,
  flashlightRef,
  lightingEngineRef,
  cameraRef,
  particleEngineRef,
  playerBodyRef,
  gridRef,
  keysPressedRef,
  isMiningRef,
  miningTargetRef,
  blockTexturesRef,
  sessionState,
  soundManager,
  weaponSoundUrlRef,
}: UseMiningTickerOptions) {
  const animTimeRef = useRef<number>(0);
  const lastSwingTimeRef = useRef<number>(0);
  const lastSwingSoundTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!app) return;

    // Instrument renderer.render to accurately measure offscreen lightmap and main stage rendering
    const renderer = app.renderer;
    let originalRender: any = null;
    if (renderer && typeof renderer.render === 'function') {
      originalRender = renderer.render.bind(renderer);
      renderer.render = (opts: any) => {
        const isOffscreen = !!opts?.target;
        const sectionName = isOffscreen ? 'Lightmap FBO Render' : 'Pixi Stage Render';
        miningProfiler.startSection(sectionName);
        const res = originalRender(opts);
        miningProfiler.endSection();
        if (!isOffscreen) {
          miningProfiler.endFrame();
        }
        return res;
      };
    }

    const tickerCallback = () => {
      miningProfiler.beginFrame();
      const playerContainer = playerContainerRef.current;
      const gridContainer = gridContainerRef.current;
      const fallingRocksContainer = fallingRocksContainerRef.current;
      if (!playerContainer || !gridContainer) return;

      const playerBody = playerBodyRef?.current ?? null;
      const grid = gridRef?.current ?? null;
      const dt = Math.min(0.05, app.ticker.deltaMS / 1000);
      animTimeRef.current += dt;
      const animTime = animTimeRef.current;
      const currentPos = currentRenderPosRef.current;
      const targetPos = targetServerPosRef.current;
      const isMining = isMiningRef?.current ?? sessionState?.isMining ?? false;
      const miningTarget = miningTargetRef?.current ?? sessionState?.miningTarget ?? null;

      // 1. Client-Side Prediction & Server Reconciliation System
      const inputs = keysPressedRef?.current ?? {
        up: false,
        down: false,
        left: false,
        right: false,
        jump: false,
        miningKey: false,
        sequence: 0,
      };

      MiningPredictionSystem.update(
        {
          playerBody,
          grid,
          inputs,
          targetPos,
          currentPos,
          playerContainer,
          soundManager,
        },
        dt
      );

      // 2. Camera Tracking
      miningProfiler.startSection('Camera');
      if (cameraRef.current) {
        cameraRef.current.setScreenSize(app.screen.width, app.screen.height);
        cameraRef.current.update({ x: playerContainer.x, y: playerContainer.y }, dt);
      } else {
        const screenWidth = app.screen.width;
        const screenHeight = app.screen.height;
        gridContainer.x = screenWidth / 2 - playerContainer.x;
        gridContainer.y = screenHeight / 2 - playerContainer.y;
      }

      // 3. Mouse Aiming, Continuous Hover Retargeting & Character Facing direction
      miningProfiler.startSection('Mouse & Aiming');
      const mouseController = mouseControllerRef?.current ?? null;
      if (mouseController) {
        mouseController.setPlayerPosition(currentPos);
        if (cameraRef?.current) {
          mouseController.setCamera(cameraRef.current);
        }
        mouseController.update();
      }

      const mouseWorld = mouseController?.getWorldMousePosition();
      if (mouseWorld) {
        const aimDx = mouseWorld.x - playerContainer.x;
        const aimDy = mouseWorld.y - playerContainer.y;
        const aimLen = Math.hypot(aimDx, aimDy);
        if (aimLen > 1) {
          playerFacingDirRef.current = { x: aimDx / aimLen, y: aimDy / aimLen };
          const aimFacingLeft = aimDx < 0;
          if (isFacingLeftRef.current !== aimFacingLeft) {
            isFacingLeftRef.current = aimFacingLeft;
            playerSpriteRef.current?.setFlipped(aimFacingLeft);
          }
        }
      } else if (playerBody && Math.abs(playerBody.velocity.x) > 0.01) {
        const isMovingLeft = playerBody.velocity.x < 0;
        if (isFacingLeftRef.current !== isMovingLeft) {
          isFacingLeftRef.current = isMovingLeft;
          playerSpriteRef.current?.setFlipped(isMovingLeft);
        }
      }

      // 4. Sprites & Animation
      miningProfiler.startSection('Sprites & Anim');
      const isMiningKeyDown = Boolean(keysPressedRef?.current?.miningKey);
      const nowMs = performance.now();
      if (isMiningKeyDown || isMining) {
        lastSwingTimeRef.current = nowMs;
      }
      const isSwinging = isMining || isMiningKeyDown || (nowMs - lastSwingTimeRef.current < 260);

      if (isSwinging && soundManager && weaponSoundUrlRef?.current) {
        if (nowMs - lastSwingSoundTimeRef.current >= 380) {
          lastSwingSoundTimeRef.current = nowMs;
          soundManager.playSfx(weaponSoundUrlRef.current);
        }
      }

      if (playerSpriteRef.current) {
        if (isSwinging) {
          playerSpriteRef.current.setState('mine');
        } else if (playerBody) {
          const moveVx = playerBody.velocity.x;
          const moveVy = playerBody.isOnLadder ? playerBody.velocity.y : 0;
          playerSpriteRef.current.setMoveVelocity(moveVx, moveVy);
        }
        playerSpriteRef.current.update(dt);
      }

      // 5. Remote Players & Active Mobs
      miningProfiler.startSection('Remote Players');
      if (remotePlayerRendererRef?.current) {
        remotePlayerRendererRef.current.tick(dt);
      }

      miningProfiler.startSection('Active Mobs');
      if (mobRendererRef?.current) {
        mobRendererRef.current.tick(dt, soundManager);
      }

      // 6. Local Continuous Simulation (Rocks, Dynamites, Projectiles, Item Pickups)
      MiningLocalSimulationSystem.update(
        {
          fallingRocksContainer,
          activeFallingRocks: activeFallingRocksRef.current,
          fallingRockGraphicsMap: fallingRockGraphicsMap.current,
          blockTextures: blockTexturesRef?.current,
          dynamitesContainer: dynamitesContainerRef?.current,
          activeDynamites: activeDynamitesRef?.current,
          dynamiteGraphicsMap: dynamiteGraphicsMap?.current,
          dynamiteTexture: dynamiteTextureRef?.current,
          dynamiteVisualManager: dynamiteVisualManagerRef?.current,
          projectilesContainer: projectilesContainerRef?.current,
          activeProjectilesRef,
          projectileGraphicsMap: projectileGraphicsMap?.current,
          bulletTexture: bulletTextureRef?.current,
          bulletScale: typeof bulletScaleRef?.current === 'number' ? bulletScaleRef.current : 1.0,
          projectileVisualManager: projectileVisualManagerRef?.current,
          droppedItemVisualManager: droppedItemVisualManagerRef?.current,
          droppedItems: droppedItemsRef?.current,
          mobRenderer: mobRendererRef?.current,
          grid: gridRef?.current,
          lightingEngine: lightingEngineRef?.current,
          particleEngine: particleEngineRef?.current,
          soundManager,
        },
        dt
      );

      // 7. Reticle Rendering
      miningProfiler.startSection('Reticle');
      MiningReticleRenderer.render({
        reticleGraphics: reticleGraphicsRef?.current ?? null,
        mouseController,
        animTime,
        isMining,
        miningTarget,
        blockTextures: blockTexturesRef?.current,
      });

      // 8. Debug Graphics
      miningProfiler.startSection('Debug Graphics');
      MiningDebugRenderer.render({
        debugGraphics: debugGraphicsRef.current,
        showDebug: showDebugRef.current,
        currentPos,
        playerFacingDir: playerFacingDirRef.current,
        isFacingLeft: isFacingLeftRef.current,
        isMining,
        miningTarget,
        grid: gridRef?.current,
        activeDynamites: activeDynamitesRef?.current,
        activeFallingRocks: activeFallingRocksRef.current,
        droppedItems: droppedItemsRef?.current,
        mobRenderer: mobRendererRef?.current,
      });

      // 9. Lighting Engine & Flashlight
      miningProfiler.startSection('Lighting Engine');
      const flashlight = flashlightRef.current;
      if (flashlight) {
        flashlight.setPosition(currentPos.x, currentPos.y - 0.28);
        flashlight.setDirection(playerFacingDirRef.current.x, playerFacingDirRef.current.y);
      }

      const lightingEngine = lightingEngineRef.current;
      if (lightingEngine) {
        const reticleState = mouseController?.getReticleState();
        const isTorchPreview = Boolean(
          reticleState?.active &&
            reticleState?.target &&
            reticleState?.style?.showPreview &&
            reticleState?.style?.previewType === 'TORCH'
        );

        const TORCH_PREVIEW_LIGHT_ID = 'torch_preview';
        const previewLight = lightingEngine.getLight(TORCH_PREVIEW_LIGHT_ID);

        if (isTorchPreview && reticleState?.target) {
          const targetX = reticleState.target.x + 0.446;
          const targetY = reticleState.target.y + 0.35;

          if (previewLight) {
            if (previewLight.position.x !== targetX || previewLight.position.y !== targetY) {
              previewLight.setPosition(targetX, targetY);
              lightingEngine.markLightmapDirty();
            }
          } else {
            lightingEngine.addLight(
              new PointLight(
                TORCH_PREVIEW_LIGHT_ID,
                { x: targetX, y: targetY },
                0xf59e0b,
                1.25,
                MINING_CONFIG.TORCH_RADIUS,
                {
                  flicker: {
                    speed: MINING_CONFIG.TORCH_FLICKER_SPEED,
                    amount: MINING_CONFIG.TORCH_FLICKER_AMOUNT,
                  },
                }
              )
            );
          }
        } else if (previewLight) {
          lightingEngine.removeLight(TORCH_PREVIEW_LIGHT_ID);
        }
      }

      lightingEngineRef.current?.update(dt, currentPos, playerFacingDirRef.current);

      // 10. Particle Engine
      particleEngineRef?.current?.update(dt);

      if (!renderer || !originalRender) {
        miningProfiler.endFrame();
      }
    };

    app.ticker.add(tickerCallback);
    return () => {
      app.ticker.remove(tickerCallback);
      if (renderer && originalRender) {
        renderer.render = originalRender;
      }
      lightingEngineRef.current?.removeLight('torch_preview');
      dynamiteVisualManagerRef?.current?.destroy(
        particleEngineRef?.current,
        lightingEngineRef?.current
      );
      droppedItemVisualManagerRef?.current?.destroy(
        particleEngineRef?.current,
        lightingEngineRef?.current
      );
    };
  }, [app]);
}
