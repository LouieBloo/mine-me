import { useEffect, useRef } from 'react';
import type { Application } from 'pixi.js';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import type { SoundManager } from '../../../../../services/sound';
import {
  MINING_CONFIG,
  DEFAULT_MINING_SWING_SPEED,
  type MiningSessionClientState,
} from '@mine-me/shared';
import { miningProfiler } from '../utils/MiningProfiler';
import { installRenderInstrumentation } from '../utils/renderInstrumentation';

// Frame Systems
import type { MiningClientWorld } from '../systems/MiningClientWorld';
import { MiningPredictionSystem } from '../systems/MiningPredictionSystem';
import { MiningLocalSimulationSystem } from '../systems/MiningLocalSimulationSystem';
import { MiningReticleRenderer } from '../systems/MiningReticleRenderer';
import { MiningDebugRenderer } from '../systems/MiningDebugRenderer';

export interface UseMiningTickerOptions {
  app: Application | null;
  /** The refs, renderers and engines the frame systems read and update. */
  world: MiningClientWorld;
  sessionState?: MiningSessionClientState;
  soundManager?: SoundManager | null;
  /** Swings per second used to pace the swing animation and its sound. */
  miningSwingSpeed?: number;
}

export function useMiningTicker({
  app,
  world,
  sessionState,
  soundManager,
  miningSwingSpeed,
}: UseMiningTickerOptions) {
  const {
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
    projectileTexturesRef,
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
    predictionRef,
    gridRef,
    keysPressedRef,
    isMiningRef,
    miningTargetRef,
    blockTexturesRef,
    weaponSoundUrlRef,
    lastWeaponSoundTimeRef,
  } = world;
  const animTimeRef = useRef<number>(0);
  const lastSwingTimeRef = useRef<number>(0);
  const lastSwingSoundTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!app) return;

    // Profiling wraps renderer.render, so it is installed only while the profiler is switched on
    // (debug flag) and removed again when it is switched off
    const renderer = app.renderer;
    let restoreRender: (() => void) | null = null;
    const syncRenderInstrumentation = () => {
      if (miningProfiler.enabled && !restoreRender && renderer && typeof renderer.render === 'function') {
        restoreRender = installRenderInstrumentation(renderer, miningProfiler);
      } else if (!miningProfiler.enabled && restoreRender) {
        restoreRender();
        restoreRender = null;
      }
    };
    syncRenderInstrumentation();
    const unsubscribeProfiler = miningProfiler.subscribe(syncRenderInstrumentation);

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
          prediction: predictionRef?.current ?? null,
          grid,
          inputs,
          targetPos,
          currentPos,
          playerContainer,
          soundManager,
        },
        app.ticker.deltaMS / 1000
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
      let localAimAngle: number | null = null;
      if (mouseWorld) {
        const sprite = playerSpriteRef.current;
        const scale = sprite?.getScale() || 0.5;
        const shoulderOffset = sprite?.getShoulderOffset() || { x: -131, y: -68 };
        const isFacingLeft = isFacingLeftRef.current;
        const shoulderWorldX = playerContainer.x + (isFacingLeft ? -shoulderOffset.x : shoulderOffset.x) * scale;
        const shoulderWorldY = playerContainer.y + shoulderOffset.y * scale;

        const aimDx = mouseWorld.x - shoulderWorldX;
        const aimDy = mouseWorld.y - shoulderWorldY;
        const aimLen = Math.hypot(aimDx, aimDy);
        if (aimLen > 1) {
          playerFacingDirRef.current = { x: aimDx / aimLen, y: aimDy / aimLen };
          const aimFacingLeft = aimDx < 0;
          if (isFacingLeftRef.current !== aimFacingLeft) {
            isFacingLeftRef.current = aimFacingLeft;
            playerSpriteRef.current?.setFlipped(aimFacingLeft);
          }
          // Compute local angle relative to facing direction (forward = 0 rad)
          const localDx = aimFacingLeft ? -aimDx : aimDx;
          localAimAngle = Math.atan2(aimDy, localDx);

          // If charging a throwable item (dynamite/rock), pull the arm back slightly
          const activeAction = mouseController?.getActiveAction() as any;
          if (activeAction?.isCharging && typeof activeAction.chargeRatio === 'number') {
            localAimAngle -= activeAction.chargeRatio * 0.35;
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
      const currentSwingSpeed =
        typeof miningSwingSpeed === 'number' && miningSwingSpeed > 0
          ? miningSwingSpeed
          : DEFAULT_MINING_SWING_SPEED;
      const swingCycleDurationMs = (1 / currentSwingSpeed) * 1000;
      const swingLingerMs = Math.min(300, swingCycleDurationMs * 0.45);

      if (isMiningKeyDown || isMining) {
        lastSwingTimeRef.current = nowMs;
      }
      const isSwinging = isMining || isMiningKeyDown || (nowMs - lastSwingTimeRef.current < swingLingerMs);

      const soundTimeRef = lastWeaponSoundTimeRef || lastSwingSoundTimeRef;
      if (isSwinging && soundManager && weaponSoundUrlRef?.current) {
        if (nowMs - soundTimeRef.current >= swingCycleDurationMs) {
          soundTimeRef.current = nowMs;
          soundManager.playSfx(weaponSoundUrlRef.current);
        }
      }

      if (playerSpriteRef.current) {
        playerSpriteRef.current.setAimAngle(localAimAngle);
        playerSpriteRef.current.setSwingSpeed?.(currentSwingSpeed);
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
          resolveProjectileTexture: projectileTexturesRef?.current?.get,
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

      // With the render hook installed it ends the frame; otherwise (or when profiling is off, a no-op) end it here
      if (!restoreRender) {
        miningProfiler.endFrame();
      }
    };

    app.ticker.add(tickerCallback);
    return () => {
      app.ticker.remove(tickerCallback);
      unsubscribeProfiler();
      restoreRender?.();
      restoreRender = null;
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
