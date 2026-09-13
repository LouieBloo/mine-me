import { useEffect, useRef } from 'react';
import type { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ModularCharacterSprite } from '../../../../../components/game/sprites';
import type { MiningRemotePlayerRenderer } from '../renderers/MiningRemotePlayerRenderer';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import type { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import type { Camera2D } from '../../../../../components/game/camera/Camera2D';
import type { ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import { MINING_CONFIG, type Vector2D, type MiningSessionClientState, type MiningClientTile, type MiningInputState, type MiningPosition, MiningPlayerBody, MiningTileType } from '@mine-me/shared';
import { MiningEntityRenderer, type ActiveFallingRock } from '../renderers/MiningEntityRenderer';
import { MiningTileRenderer, TILE_SIZE } from '../renderers/MiningTileRenderer';
import { miningProfiler } from '../utils/MiningProfiler';

import type { MiningMouseController } from '../input/MiningMouseController';

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
  activeFallingRocksRef: React.MutableRefObject<ActiveFallingRock[]>;
  fallingRockGraphicsMap: React.MutableRefObject<Map<string, Sprite | Graphics>>;
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
  activeFallingRocksRef,
  fallingRockGraphicsMap,
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
}: UseMiningTickerOptions) {
  const animTimeRef = useRef<number>(0);

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
          // Main stage draw complete — marks true end of frame CPU work
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

      const playerBody = playerBodyRef?.current;
      const grid = gridRef?.current;
      const dt = Math.min(0.05, app.ticker.deltaMS / 1000);
      animTimeRef.current += dt;
      const animTime = animTimeRef.current;
      const currentPos = currentRenderPosRef.current;
      const targetPos = targetServerPosRef.current;
      const isMining = isMiningRef?.current ?? sessionState?.isMining ?? false;
      const miningTarget = miningTargetRef?.current ?? sessionState?.miningTarget ?? null;

      if (playerBody && grid) {
        miningProfiler.startSection('Physics');
        // 1. Client-Side Prediction: step physics immediately on client frame with active inputs
        const inputs = keysPressedRef?.current ?? {
          up: false,
          down: false,
          left: false,
          right: false,
          jump: false,
          miningKey: false,
          sequence: 0,
        };
        playerBody.processInputs(inputs, grid);
        playerBody.update(dt, grid);

        miningProfiler.startSection('Reconciliation');
        // 2. Server Reconciliation: gently nudge predicted position towards authoritative server position
        const errX = targetPos.x - playerBody.position.x;
        const errY = targetPos.y - playerBody.position.y;
        const distErr = Math.hypot(errX, errY);

        if (distErr > 1.2) {
          // Large mismatch (e.g. server collision snap or teleport): snap to server position
          playerBody.position.x = targetPos.x;
          playerBody.position.y = targetPos.y;
        } else {
          let reconcileX = errX;
          let reconcileY = errY;

          // When the player is colliding with a wall horizontally, the client is already flush against the wall surface.
          // Do NOT allow delayed server packets (which are trailing behind) to pull the player away from the wall.
          if (playerBody.collisionX) {
            if (inputs.right && errX < 0) {
              reconcileX = 0;
            } else if (inputs.left && errX > 0) {
              reconcileX = 0;
            }
          } else if ((inputs.left || inputs.right) && distErr < 0.8) {
            // While actively walking in open space, allow local prediction to lead without trailing server drag
            if (inputs.right && errX < 0) {
              reconcileX = 0;
            } else if (inputs.left && errX > 0) {
              reconcileX = 0;
            }
          }

          if (playerBody.isGrounded) {
            // When grounded, clamp small vertical drift to prevent sub-pixel floor fighting
            if (Math.abs(errY) < 0.05) {
              reconcileY = 0;
            }
          } else if (!playerBody.isOnLadder && Math.abs(errY) < 0.8) {
            // AIRBORNE (jumping or falling): suppress vertical reconciliation.
            // Client and server run identical deterministic physics — the only source of
            // errY is the 30Hz server tick trailing behind the high-frequency client prediction.
            // Allowing reconcileY here causes the camera to oscillate/spasm during jumps
            // and dampens apparent gravity during falls.
            // Errors > 0.8 tiles while airborne indicate genuine desync — allow soft correction.
            reconcileY = 0;
          }

          const reconcileFactor = Math.min(1.0, 1 - Math.exp(-12 * dt));
          if (Math.abs(reconcileX) > 0.001) {
            playerBody.position.x += reconcileX * reconcileFactor;
          }
          if (Math.abs(reconcileY) > 0.001) {
            playerBody.position.y += reconcileY * reconcileFactor;
          }
        }

        currentPos.x = playerBody.position.x;
        currentPos.y = playerBody.position.y;

        // Position player sprite in pixel world space
        playerContainer.x = playerBody.position.x * TILE_SIZE;
        playerContainer.y = playerBody.position.y * TILE_SIZE;
      } else {
        // Fallback smooth factor if playerBody not yet initialized
        const smoothFactor = Math.min(1.0, 1 - Math.exp(-32 * dt));
        const dx = targetPos.x - currentPos.x;
        currentPos.x += dx * smoothFactor;
        currentPos.y += (targetPos.y - currentPos.y) * smoothFactor;

        playerContainer.x = currentPos.x * TILE_SIZE;
        playerContainer.y = currentPos.y * TILE_SIZE;
      }

      miningProfiler.startSection('Camera');
      // Update camera viewport tracking & zoom FIRST so coordinate queries are 100% synchronized
      if (cameraRef.current) {
        cameraRef.current.setScreenSize(app.screen.width, app.screen.height);
        cameraRef.current.update({ x: playerContainer.x, y: playerContainer.y }, dt);
      } else {
        const screenWidth = app.screen.width;
        const screenHeight = app.screen.height;
        gridContainer.x = screenWidth / 2 - playerContainer.x;
        gridContainer.y = screenHeight / 2 - playerContainer.y;
      }

      miningProfiler.startSection('Mouse & Aiming');
      // Mouse Aiming, Continuous Hover Retargeting & Character Facing direction
      const mouseController = mouseControllerRef?.current;
      if (mouseController) {
        mouseController.setPlayerPosition(currentPos);
        if (cameraRef?.current) {
          mouseController.setCamera(cameraRef.current);
        }
        // Always re-evaluate what is hovered under the cursor so moving the character immediately retargets
        mouseController.update();
      }

      const mouseWorld = mouseController?.getWorldMousePosition();
      if (mouseWorld) {
        // Aim headlamp and sprite facing towards the mouse cursor
        const aimDx = mouseWorld.x - playerContainer.x;
        const aimDy = mouseWorld.y - playerContainer.y;
        const aimLen = Math.hypot(aimDx, aimDy);
        if (aimLen > 1) {
          playerFacingDirRef.current = { x: aimDx / aimLen, y: aimDy / aimLen };
          const aimFacingLeft = aimDx < 0;
          if (isFacingLeftRef.current !== aimFacingLeft) {
            isFacingLeftRef.current = aimFacingLeft;
            if (playerSpriteRef.current) {
              playerSpriteRef.current.setFlipped(aimFacingLeft);
            }
          }
        }
      } else if (playerBody && Math.abs(playerBody.velocity.x) > 0.01) {
        // Fallback to movement direction if mouse is not on screen
        const isMovingLeft = playerBody.velocity.x < 0;
        if (isFacingLeftRef.current !== isMovingLeft) {
          isFacingLeftRef.current = isMovingLeft;
          if (playerSpriteRef.current) {
            playerSpriteRef.current.setFlipped(isMovingLeft);
          }
        }
      }

      miningProfiler.startSection('Sprites & Anim');
      // Update modular sprite animation with predicted velocities
      if (playerSpriteRef.current) {
        if (isMining) {
          playerSpriteRef.current.setState('mine');
        } else if (playerBody) {
          // Horizontal movement drives the walking animation stride.
          // Vertical movement while falling/jumping does NOT trigger walking leg strides;
          // ladder climbing uses vertical velocity.
          const moveVx = playerBody.velocity.x;
          const moveVy = playerBody.isOnLadder ? playerBody.velocity.y : 0;
          playerSpriteRef.current.setMoveVelocity(moveVx, moveVy);
        }
        playerSpriteRef.current.update(dt);
      }

      miningProfiler.startSection('Remote Players');
      // Update and interpolate remote players in multiplayer session
      if (remotePlayerRendererRef?.current) {
        remotePlayerRendererRef.current.tick(dt);
      }

      miningProfiler.startSection('Falling Rocks');
      // Render active falling rocks in continuous space with rock texture/sprite
      if (fallingRocksContainer) {
        const rockTexture = blockTexturesRef?.current?.get(MiningTileType.ROCK);
        MiningEntityRenderer.updateFallingRocks(
          fallingRocksContainer,
          activeFallingRocksRef.current,
          fallingRockGraphicsMap.current,
          TILE_SIZE,
          rockTexture
        );
      }

      miningProfiler.startSection('Reticle');
      // Render Reticle Hover / Placement highlight
      const reticleGraphics = reticleGraphicsRef?.current;
      if (reticleGraphics && mouseController) {
        reticleGraphics.clear();
        reticleGraphics.position.set(0, 0);
        const reticleState = mouseController.getReticleState();
        if (reticleState.active && reticleState.target && reticleState.style) {
          const rx = reticleState.target.x * TILE_SIZE;
          const ry = reticleState.target.y * TILE_SIZE;
          reticleGraphics.rect(rx, ry, TILE_SIZE, TILE_SIZE);
          reticleGraphics.fill({ color: reticleState.style.color, alpha: reticleState.style.alpha });
          reticleGraphics.stroke({ width: 2, color: reticleState.style.strokeColor, alpha: 0.9 });

          // If actively mining this target block, draw an inner pulsing damage frame
          const isMiningThis =
            isMining &&
            miningTarget &&
            miningTarget.x === reticleState.target.x &&
            miningTarget.y === reticleState.target.y;

          if (isMiningThis) {
            const pulse = 0.5 + Math.sin(animTime * 15) * 0.5;
            reticleGraphics.rect(rx + 3, ry + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            reticleGraphics.stroke({ width: 1.5, color: 0xf59e0b, alpha: 0.4 + pulse * 0.5 });
          }

          if (reticleState.style.showPreview) {
            const previewGlow = 0.7 + Math.sin(animTime * 8) * 0.2;
            if (reticleState.style.previewType === 'LADDER') {
              const ladderTex = blockTexturesRef?.current?.get(MiningTileType.LADDER);
              MiningTileRenderer.drawLadder(reticleGraphics, TILE_SIZE, previewGlow, rx, ry, ladderTex);
            } else {
              const torchTex = blockTexturesRef?.current?.get(MiningTileType.TORCH);
              MiningTileRenderer.drawTorch(reticleGraphics, TILE_SIZE, previewGlow, rx, ry, torchTex);
            }
          }
        }
      }

      miningProfiler.startSection('Debug Graphics');
      // Render debug shapes for player collision box and mining reach (when enabled via B)
      const debugGraphics = debugGraphicsRef.current;
      if (debugGraphics) {
        debugGraphics.clear();

        if (showDebugRef.current) {
          const playerPixelX = currentPos.x * TILE_SIZE;
          const playerPixelY = currentPos.y * TILE_SIZE;
          const colliderPixelW = (MINING_CONFIG.PLAYER_COLLIDER_WIDTH / MINING_CONFIG.TILE_SIZE) * TILE_SIZE;
          const colliderPixelH = (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / MINING_CONFIG.TILE_SIZE) * TILE_SIZE;

          // 1. Current Tile Grid Outline (Blue outline of occupied tile coordinate)
          const tileX = Math.floor(currentPos.x) * TILE_SIZE;
          const tileY = Math.floor(currentPos.y) * TILE_SIZE;
          debugGraphics.rect(tileX, tileY, TILE_SIZE, TILE_SIZE);
          debugGraphics.stroke({ width: 1, color: 0x38bdf8, alpha: 0.5 });

          // 2. Fall & Movement Collider (Green AABB rectangle encompassing character body)
          debugGraphics.rect(
            playerPixelX - colliderPixelW / 2,
            playerPixelY - colliderPixelH / 2,
            colliderPixelW,
            colliderPixelH
          );
          debugGraphics.stroke({ width: 2, color: 0x22c55e, alpha: 0.9 });

          // 3. Ground / Floor Contact Line (Red line at bottom of player collider)
          const feetY = playerPixelY + colliderPixelH / 2;
          debugGraphics.moveTo(playerPixelX - colliderPixelW / 2, feetY);
          debugGraphics.lineTo(playerPixelX + colliderPixelW / 2, feetY);
          debugGraphics.stroke({ width: 2, color: 0xef4444, alpha: 0.9 });

          // 4. Center Origin Point (Cyan dot at player center coordinate)
          debugGraphics.circle(playerPixelX, playerPixelY, 3);
          debugGraphics.fill({ color: 0x06b6d4, alpha: 0.95 });

          // 5. Mining Reach Radius (Yellow circle for block excavation reach)
          const reachPixelRadius = (MINING_CONFIG.PLAYER_MINING_REACH ?? 1.85) * TILE_SIZE;
          debugGraphics.circle(playerPixelX, playerPixelY, reachPixelRadius);
          debugGraphics.stroke({ width: 1.5, color: 0xeab308, alpha: 0.5 });

          // 6. Highlight currently mining target block if active
          if (isMining && miningTarget) {
            const targetX = miningTarget.x * TILE_SIZE;
            const targetY = miningTarget.y * TILE_SIZE;
            debugGraphics.rect(targetX, targetY, TILE_SIZE, TILE_SIZE);
            debugGraphics.stroke({ width: 2.5, color: 0xef4444, alpha: 0.9 });
          }
        }
      }

      miningProfiler.startSection('Lighting Engine');
      // Update dynamic player flashlight position and beam direction (positioned at forehead / headlamp)
      const flashlight = flashlightRef.current;
      if (flashlight) {
        flashlight.setPosition(currentPos.x, currentPos.y - 0.28);
        flashlight.setDirection(playerFacingDirRef.current.x, playerFacingDirRef.current.y);
      }

      // Update dynamic torch preview lighting when hovering in valid torch placement mode
      const lightingEngine = lightingEngineRef.current;
      if (lightingEngine) {
        const reticleState = mouseControllerRef?.current?.getReticleState();
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

      // Update and re-render lighting engine lightmap
      lightingEngineRef.current?.update(dt, currentPos, playerFacingDirRef.current);

      // Update active particles (torches, block damage, magic auras)
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
    };
  }, [app]);
}
