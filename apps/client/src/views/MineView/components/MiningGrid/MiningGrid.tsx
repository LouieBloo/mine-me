import React, { useEffect, useRef, useState, useMemo } from 'react';
import { usePixiStage } from '../../../../components/game/PixiStageContext/PixiStageContext';
import { type GearLayerDescriptor } from '../../../../components/game/sprites';
import type {
  MiningSessionClientState,
  PlayerState,
  MiningStateTickPayload,
  Vector2D,
} from '@mine-me/shared';
import { MiningTileType, getAssetUrl } from '@mine-me/shared';
import { PointLight } from '../../../../components/game/lighting/PointLight';
import { useSocket } from '../../../../contexts/SocketContext';
import { useMiningInput } from './hooks/useMiningInput';
import { useMiningScene } from './hooks/useMiningScene';
import { useMiningTicker } from './hooks/useMiningTicker';
import { MiningTileRenderer, TILE_SIZE } from './renderers/MiningTileRenderer';
import { MiningEntityRenderer } from './renderers/MiningEntityRenderer';
import './MiningGrid.css';

interface MiningGridProps {
  sessionState: MiningSessionClientState;
  playerState: PlayerState;
  onExit: () => void;
  onAssetsLoaded?: () => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

export const MiningGrid: React.FC<MiningGridProps> = ({
  sessionState: initialSessionState,
  playerState,
  onAssetsLoaded,
  zoom = 1.5,
  onZoomChange,
}) => {
  const { app } = usePixiStage();
  const { onEvent, sendGameEvent } = useSocket();

  const [sessionState, setSessionState] = useState<MiningSessionClientState>(initialSessionState);

  // Direction and Debug state references
  const isFacingLeftRef = useRef<boolean>(false);
  const playerFacingDirRef = useRef<Vector2D>({ x: 1, y: 0 });
  const showDebugRef = useRef<boolean>(false);
  const activeFallingRocksRef = useRef<{ id: string; x: number; y: number }[]>([]);

  // Smooth rendering lerp position references
  const currentRenderPosRef = useRef<Vector2D>({
    x: initialSessionState.position.x,
    y: initialSessionState.position.y,
  });
  const targetServerPosRef = useRef<Vector2D>({
    x: initialSessionState.position.x,
    y: initialSessionState.position.y,
  });

  // Gear layers derivation
  const gearLayers: GearLayerDescriptor[] = useMemo(() => {
    if (!playerState.inventory?.items) return [];
    return playerState.inventory.items
      .filter((inv) => inv.item.type === 'GEAR' && inv.item.gearImageUrl && inv.equipped)
      .map((inv) => ({
        url: getAssetUrl(inv.item.gearImageUrl),
        subType: inv.item.subType as any,
      }));
  }, [playerState.inventory?.items]);

  // Pixi Scene, Camera, Lighting & Asset Loading Hook
  const {
    containersReady,
    tileTextureLoaded,
    cameraRef,
    gridContainerRef,
    tilesContainerRef,
    fallingRocksContainerRef,
    droppedItemsContainerRef,
    playerContainerRef,
    debugGraphicsRef,
    tileGraphicsMap,
    tileSpritesMap,
    blockTexturesRef,
    droppedSpritesMap,
    fallingRockGraphicsMap,
    playerSpriteRef,
    lightingEngineRef,
    flashlightRef,
  } = useMiningScene({
    app,
    initialSessionState,
    gearLayers,
    playerFacingDirRef,
    isFacingLeftRef,
    zoom,
    onAssetsLoaded,
  });

  // Real-time Input Controls Hook
  useMiningInput({
    sendGameEvent,
    playerSpriteRef,
    flashlightRef,
    showDebugRef,
    playerFacingDirRef,
    isFacingLeftRef,
    zoom,
    onZoomChange,
  });

  // Real-time 30 Hz server ticks subscription
  useEffect(() => {
    const cleanup = onEvent('mining_state_tick', (payload: MiningStateTickPayload) => {
      targetServerPosRef.current = payload.position;
      activeFallingRocksRef.current = payload.fallingRocks
        ? payload.fallingRocks.map((r) => ({ id: r.id, x: r.position.x, y: r.position.y }))
        : [];

      setSessionState((prev) => {
        let updatedGrid = prev.grid;
        if (payload.revealedTiles && payload.revealedTiles.length > 0) {
          updatedGrid = prev.grid.map((row) => row.map((tile) => ({ ...tile })));
          for (const rt of payload.revealedTiles) {
            if (updatedGrid[rt.y] && updatedGrid[rt.y][rt.x]) {
              updatedGrid[rt.y][rt.x] = {
                type: rt.type,
                revealed: true,
                damageStage: rt.damageStage ?? updatedGrid[rt.y][rt.x].damageStage,
              };
            }
          }
        }

        return {
          ...prev,
          grid: updatedGrid,
          position: {
            x: Math.round(payload.position.x),
            y: Math.round(payload.position.y),
          },
          temporaryBackpack: payload.temporaryBackpack,
          droppedItems: payload.droppedItems,
          isMining: payload.isMining,
          miningTarget: payload.miningTarget,
          miningTimeMs: payload.miningProgressMs,
        };
      });
    });

    return () => {
      cleanup();
    };
  }, [onEvent]);

  // Render Grid Tiles & Dynamic Tile Lighting
  useEffect(() => {
    const tilesContainer = tilesContainerRef.current;
    if (!tilesContainer || !containersReady) return;

    MiningTileRenderer.renderGrid(
      tilesContainer,
      sessionState.grid,
      blockTexturesRef.current,
      tileGraphicsMap.current,
      tileSpritesMap.current,
      TILE_SIZE
    );

    const lightingEngine = lightingEngineRef.current;
    if (lightingEngine) {
      lightingEngine.updateGrid(sessionState.grid);

      sessionState.grid.forEach((row, y) => {
        row.forEach((tile, x) => {
          const mineralLightId = `mineral_${x}_${y}`;
          const chestLightId = `chest_${x}_${y}`;

          if (tile.revealed && tile.type === MiningTileType.MINERAL) {
            if (!lightingEngine.getLight(mineralLightId)) {
              lightingEngine.addLight(
                new PointLight(
                  mineralLightId,
                  { x: x + 0.5, y: y + 0.5 },
                  0x38bdf8,
                  0.75,
                  1.6,
                  { pulse: { speed: 2.5, minIntensity: 0.35, maxIntensity: 0.85 } }
                )
              );
            }
          } else {
            lightingEngine.removeLight(mineralLightId);
          }

          if (tile.revealed && tile.type === MiningTileType.CHEST) {
            if (!lightingEngine.getLight(chestLightId)) {
              lightingEngine.addLight(
                new PointLight(
                  chestLightId,
                  { x: x + 0.5, y: y + 0.5 },
                  0xfbbf24,
                  0.9,
                  2.0,
                  { pulse: { speed: 3.2, minIntensity: 0.5, maxIntensity: 1.0 } }
                )
              );
            }
          } else {
            lightingEngine.removeLight(chestLightId);
          }
        });
      });
    }
  }, [sessionState.grid, containersReady, tileTextureLoaded]);

  // Render Dropped Items
  useEffect(() => {
    const droppedItemsContainer = droppedItemsContainerRef.current;
    if (!droppedItemsContainer || !containersReady) return;

    MiningEntityRenderer.updateDroppedItems(
      droppedItemsContainer,
      sessionState.droppedItems,
      droppedSpritesMap.current,
      TILE_SIZE
    );
  }, [sessionState.droppedItems, containersReady]);

  // 60+ FPS Frame Ticker Loop Hook
  useMiningTicker({
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
  });

  return <div className="mining-grid-container" />;
};
