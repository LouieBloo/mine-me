import { useEffect } from 'react';
import type { Application, Container, Graphics } from 'pixi.js';
import type { ModularCharacterSprite } from '../../../../../components/game/sprites';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import type { Camera2D } from '../../../../../components/game/camera/Camera2D';
import { MINING_CONFIG, type Vector2D, type MiningSessionClientState } from '@mine-me/shared';
import { MiningEntityRenderer, type ActiveFallingRock } from '../renderers/MiningEntityRenderer';
import { MiningTileRenderer, TILE_SIZE } from '../renderers/MiningTileRenderer';

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
  activeFallingRocksRef: React.MutableRefObject<ActiveFallingRock[]>;
  fallingRockGraphicsMap: React.MutableRefObject<Map<string, Graphics>>;
  reticleGraphicsRef?: React.RefObject<Graphics | null>;
  mouseControllerRef?: React.MutableRefObject<MiningMouseController | null>;
  debugGraphicsRef: React.RefObject<Graphics | null>;
  showDebugRef: React.MutableRefObject<boolean>;
  flashlightRef: React.RefObject<SpotLight | null>;
  lightingEngineRef: React.RefObject<LightingEngine | null>;
  cameraRef: React.RefObject<Camera2D | null>;
  sessionState: MiningSessionClientState;
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
  activeFallingRocksRef,
  fallingRockGraphicsMap,
  reticleGraphicsRef,
  mouseControllerRef,
  debugGraphicsRef,
  showDebugRef,
  flashlightRef,
  lightingEngineRef,
  cameraRef,
  sessionState,
}: UseMiningTickerOptions) {
  useEffect(() => {
    if (!app) return;

    const tickerCallback = () => {
      const playerContainer = playerContainerRef.current;
      const gridContainer = gridContainerRef.current;
      const fallingRocksContainer = fallingRocksContainerRef.current;
      if (!playerContainer || !gridContainer) return;

      const currentPos = currentRenderPosRef.current;
      const targetPos = targetServerPosRef.current;

      // Linear interpolation (lerp) towards target server position
      const dt = app.ticker.deltaMS / 1000;
      const smoothFactor = Math.min(1.0, 1 - Math.exp(-32 * dt));

      const dx = targetPos.x - currentPos.x;
      currentPos.x += dx * smoothFactor;
      currentPos.y += (targetPos.y - currentPos.y) * smoothFactor;

      // Position player sprite in pixel world space
      playerContainer.x = currentPos.x * TILE_SIZE;
      playerContainer.y = currentPos.y * TILE_SIZE;

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
      } else if (Math.abs(dx) > 0.005) {
        // Fallback to movement direction if mouse is not on screen
        const isMovingLeft = dx < 0;
        if (isFacingLeftRef.current !== isMovingLeft) {
          isFacingLeftRef.current = isMovingLeft;
          if (playerSpriteRef.current) {
            playerSpriteRef.current.setFlipped(isMovingLeft);
          }
        }
      }

      // Update modular sprite animation
      if (playerSpriteRef.current) {
        if (sessionState.isMining) {
          playerSpriteRef.current.setState('mine');
        } else {
          playerSpriteRef.current.setMoveVelocity(dx, targetPos.y - currentPos.y);
        }
        playerSpriteRef.current.update(dt);
      }

      // Render active falling rocks in continuous space
      if (fallingRocksContainer) {
        MiningEntityRenderer.updateFallingRocks(
          fallingRocksContainer,
          activeFallingRocksRef.current,
          fallingRockGraphicsMap.current,
          TILE_SIZE
        );
      }

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
            sessionState.isMining &&
            sessionState.miningTarget &&
            sessionState.miningTarget.x === reticleState.target.x &&
            sessionState.miningTarget.y === reticleState.target.y;

          if (isMiningThis) {
            const pulse = 0.5 + Math.sin(Date.now() * 0.015) * 0.5;
            reticleGraphics.rect(rx + 3, ry + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            reticleGraphics.stroke({ width: 1.5, color: 0xf59e0b, alpha: 0.4 + pulse * 0.5 });
          }

          if (reticleState.style.showPreview) {
            const previewGlow = 0.7 + Math.sin(Date.now() * 0.008) * 0.2;
            if (reticleState.style.previewType === 'LADDER') {
              MiningTileRenderer.drawLadder(reticleGraphics, TILE_SIZE, previewGlow, rx, ry);
            } else {
              MiningTileRenderer.drawTorch(reticleGraphics, TILE_SIZE, previewGlow, rx, ry);
            }
          }
        }
      }

      // Render debug shapes for player collision box and mining reach (when enabled via B)
      const debugGraphics = debugGraphicsRef.current;
      if (debugGraphics) {
        debugGraphics.clear();

        if (showDebugRef.current) {
          const playerPixelX = currentPos.x * TILE_SIZE;
          const playerPixelY = currentPos.y * TILE_SIZE;
          const colliderPixelW = (MINING_CONFIG.PLAYER_COLLIDER_WIDTH / MINING_CONFIG.TILE_SIZE) * TILE_SIZE;
          const colliderPixelH = (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / MINING_CONFIG.TILE_SIZE) * TILE_SIZE;

          // 1. Fall & Movement Collider (Green AABB rectangle encompassing character body)
          debugGraphics.rect(
            playerPixelX - colliderPixelW / 2,
            playerPixelY - colliderPixelH / 2,
            colliderPixelW,
            colliderPixelH
          );
          debugGraphics.stroke({ width: 2, color: 0x22c55e, alpha: 0.9 });

          // 2. Mining Reach Radius (Yellow circle for block excavation reach)
          const reachPixelRadius = (MINING_CONFIG.PLAYER_MINING_REACH ?? 1.85) * TILE_SIZE;
          debugGraphics.circle(playerPixelX, playerPixelY, reachPixelRadius);
          debugGraphics.stroke({ width: 1.5, color: 0xeab308, alpha: 0.5 });

          // 3. Highlight currently mining target block if active
          if (sessionState.isMining && sessionState.miningTarget) {
            const targetX = sessionState.miningTarget.x * TILE_SIZE;
            const targetY = sessionState.miningTarget.y * TILE_SIZE;
            debugGraphics.rect(targetX, targetY, TILE_SIZE, TILE_SIZE);
            debugGraphics.stroke({ width: 2.5, color: 0xef4444, alpha: 0.9 });
          }
        }
      }

      // Update dynamic player flashlight position and beam direction (positioned at forehead / headlamp)
      const flashlight = flashlightRef.current;
      if (flashlight) {
        flashlight.setPosition(currentPos.x, currentPos.y - 0.28);
        flashlight.setDirection(playerFacingDirRef.current.x, playerFacingDirRef.current.y);
      }

      // Update and re-render lighting engine lightmap
      lightingEngineRef.current?.update(dt, currentPos, playerFacingDirRef.current);
    };

    app.ticker.add(tickerCallback);
    return () => {
      app.ticker.remove(tickerCallback);
    };
  }, [app, sessionState.isMining, sessionState.miningTarget]);
}
