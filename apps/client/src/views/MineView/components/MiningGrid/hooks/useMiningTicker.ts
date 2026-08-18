import { useEffect } from 'react';
import type { Application, Container, Graphics } from 'pixi.js';
import type { ModularCharacterSprite } from '../../../../../components/game/sprites';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import type { Camera2D } from '../../../../../components/game/camera/Camera2D';
import { MINING_CONFIG, type Vector2D, type MiningSessionClientState } from '@mine-me/shared';
import { MiningEntityRenderer, type ActiveFallingRock } from '../renderers/MiningEntityRenderer';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

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
      if (Math.abs(dx) > 0.005) {
        const isMovingLeft = dx < 0;
        if (isFacingLeftRef.current !== isMovingLeft) {
          isFacingLeftRef.current = isMovingLeft;
          if (playerSpriteRef.current) {
            playerSpriteRef.current.setFlipped(isMovingLeft);
          }
        }
      }

      currentPos.x += dx * smoothFactor;
      currentPos.y += (targetPos.y - currentPos.y) * smoothFactor;

      // Update modular sprite animation
      if (playerSpriteRef.current) {
        if (sessionState.isMining) {
          playerSpriteRef.current.setState('mine');
        } else {
          playerSpriteRef.current.setMoveVelocity(dx, targetPos.y - currentPos.y);
        }
        playerSpriteRef.current.update(dt);
      }

      // Position player sprite in pixel world space
      playerContainer.x = currentPos.x * TILE_SIZE;
      playerContainer.y = currentPos.y * TILE_SIZE;

      // Render active falling rocks in continuous space
      if (fallingRocksContainer) {
        MiningEntityRenderer.updateFallingRocks(
          fallingRocksContainer,
          activeFallingRocksRef.current,
          fallingRockGraphicsMap.current,
          TILE_SIZE
        );
      }

      // Render debug shapes for player collision box and mining reach (when enabled via T)
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
          const reachPixelRadius = (MINING_CONFIG.PLAYER_MINING_REACH ?? 1.15) * TILE_SIZE;
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

      // Update camera viewport tracking & zoom
      if (cameraRef.current) {
        cameraRef.current.setScreenSize(app.screen.width, app.screen.height);
        cameraRef.current.update({ x: playerContainer.x, y: playerContainer.y }, dt);
      } else {
        const screenWidth = app.screen.width;
        const screenHeight = app.screen.height;
        gridContainer.x = screenWidth / 2 - playerContainer.x;
        gridContainer.y = screenHeight / 2 - playerContainer.y;
      }
    };

    app.ticker.add(tickerCallback);
    return () => {
      app.ticker.remove(tickerCallback);
    };
  }, [app, sessionState.isMining, sessionState.miningTarget]);
}
