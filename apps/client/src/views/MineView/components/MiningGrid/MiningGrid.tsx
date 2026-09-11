import React, { useEffect, useRef, useMemo } from 'react';
import { usePixiStage } from '../../../../components/game/PixiStageContext/PixiStageContext';
import { type GearLayerDescriptor } from '../../../../components/game/sprites';
import {
  type MiningSessionClientState,
  type PlayerState,
  type MiningStateTickPayload,
  type Vector2D,
  type MiningClientTile,
  type MiningPosition,
  MiningPlayerBody,
  MiningTileType,
  MINING_CONFIG,
  DEFAULT_PARTICLE_EFFECTS,
  getAssetUrl,
  canTileBeDamaged,
  isTileTransparent,
} from '@mine-me/shared';
import { PointLight } from '../../../../components/game/lighting/PointLight';
import type { EmitterHandle } from '../../../../components/game/particles/ParticleEngine';
import { useSocket } from '../../../../contexts/SocketContext';
import { notificationService } from '../../../../services/notificationService';
import { MiningMouseController } from './input/MiningMouseController';
import { TorchPlacementAction, LadderPlacementAction } from './input/MouseAction';
import { useMiningInput } from './hooks/useMiningInput';
import { useMiningScene } from './hooks/useMiningScene';
import { useMiningTicker } from './hooks/useMiningTicker';
import { MiningTileRenderer, TILE_SIZE } from './renderers/MiningTileRenderer';
import { MiningEntityRenderer } from './renderers/MiningEntityRenderer';
import { miningProfiler } from './utils/MiningProfiler';
import './MiningGrid.css';

interface MiningGridProps {
  sessionState: MiningSessionClientState;
  playerState: PlayerState;
  onExit: () => void;
  onAssetsLoaded?: () => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  isPlacingTorch?: boolean;
  onTorchPlaced?: () => void;
  isPlacingLadder?: boolean;
  onLadderPlaced?: () => void;
  showDebug?: boolean;
  onToggleDebug?: () => void;
}

export const MiningGrid: React.FC<MiningGridProps> = ({
  sessionState: initialSessionState,
  playerState,
  onAssetsLoaded,
  zoom = 1.5,
  onZoomChange,
  isPlacingTorch = false,
  onTorchPlaced,
  isPlacingLadder = false,
  onLadderPlaced,
  showDebug,
  onToggleDebug,
}) => {
  const { app } = usePixiStage();
  const { onEvent, sendGameEvent } = useSocket();

  // Authoritative in-memory grid ref (avoids React state thrashing and 5,000-tile clones)
  const gridRef = useRef<MiningClientTile[][]>(
    initialSessionState.grid.map((row) => row.map((tile) => ({ ...tile })))
  );

  // Client-Side Prediction Physics Body for local player
  const playerBodyRef = useRef<MiningPlayerBody>(
    new MiningPlayerBody(initialSessionState.position)
  );

  // Interaction and mining state refs
  const isMiningRef = useRef<boolean>(initialSessionState.isMining ?? false);
  const miningTargetRef = useRef<MiningPosition | null>(initialSessionState.miningTarget ?? null);

  // Object-Oriented Mouse Controller Ref
  const mouseControllerRef = useRef<MiningMouseController>(new MiningMouseController({ tileSize: TILE_SIZE }));

  // Direction and Debug state references
  const isFacingLeftRef = useRef<boolean>(false);
  const playerFacingDirRef = useRef<Vector2D>({ x: 1, y: 0 });
  const showDebugRef = useRef<boolean>(showDebug ?? false);

  // Synchronize showDebug prop with internal ref
  useEffect(() => {
    if (showDebug !== undefined) {
      showDebugRef.current = showDebug;
    }
  }, [showDebug]);

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
    reticleGraphicsRef,
    debugGraphicsRef,
    tileGraphicsMap,
    tileSpritesMap,
    blockTexturesRef,
    droppedSpritesMap,
    fallingRockGraphicsMap,
    playerSpriteRef,
    remotePlayerRendererRef,
    lightingEngineRef,
    flashlightRef,
    particleEngineRef,
  } = useMiningScene({
    app,
    initialSessionState,
    gearLayers,
    playerFacingDirRef,
    isFacingLeftRef,
    zoom,
    onAssetsLoaded,
  });

  const torchEmittersRef = useRef<Map<string, EmitterHandle>>(new Map());

  // Attach canvas to MouseController and sync camera
  useEffect(() => {
    if (!app?.canvas) return;
    const mouseController = mouseControllerRef.current;
    mouseController.attach(app.canvas);
    mouseController.setCamera(cameraRef.current);
    app.canvas.style.cursor = 'crosshair';
    return () => {
      mouseController.detach();
    };
  }, [app?.canvas, cameraRef]);

  // Initial Sync of grid with MouseController
  useEffect(() => {
    mouseControllerRef.current.setGrid(gridRef.current);
  }, []);

  // Configure Active Mouse Action (Torch or Ladder Placement)
  useEffect(() => {
    const mouseController = mouseControllerRef.current;
    if (isPlacingTorch) {
      mouseController.setActiveAction(
        new TorchPlacementAction(async (target) => {
          try {
            const res = await sendGameEvent({ type: 'mining_place_torch', target });
            if (res.success) {
              onTorchPlaced?.();
              return true;
            } else {
              notificationService.error('Cannot Place Torch', res.error || 'Invalid placement position.');
              return false;
            }
          } catch (err: any) {
            console.error('[MiningGrid] mining_place_torch error:', err);
            notificationService.error('Error', err.message || 'Failed to place torch.');
            return false;
          }
        })
      );
    } else if (isPlacingLadder) {
      mouseController.setActiveAction(
        new LadderPlacementAction(async (target) => {
          try {
            const res = await sendGameEvent({ type: 'mining_place_ladder', target });
            if (res.success) {
              onLadderPlaced?.();
              return true;
            } else {
              notificationService.error('Cannot Place Ladder', res.error || 'Invalid placement position.');
              return false;
            }
          } catch (err: any) {
            console.error('[MiningGrid] mining_place_ladder error:', err);
            notificationService.error('Error', err.message || 'Failed to place ladder.');
            return false;
          }
        })
      );
    } else {
      mouseController.setActiveAction(null);
    }
  }, [isPlacingTorch, isPlacingLadder, sendGameEvent, onTorchPlaced, onLadderPlaced]);

  // Real-time Input Controls Hook
  const { keysPressedRef } = useMiningInput({
    sendGameEvent,
    playerSpriteRef,
    flashlightRef,
    showDebugRef,
    onToggleDebug,
    playerFacingDirRef,
    isFacingLeftRef,
    mouseControllerRef,
    zoom,
    onZoomChange,
  });

  // Initial Full-Grid Render & Initial Dynamic Tile Lights
  useEffect(() => {
    const tilesContainer = tilesContainerRef.current;
    if (!tilesContainer || !containersReady) return;

    MiningTileRenderer.renderGrid(
      tilesContainer,
      gridRef.current,
      blockTexturesRef.current,
      tileGraphicsMap.current,
      tileSpritesMap.current,
      TILE_SIZE
    );

    const lightingEngine = lightingEngineRef.current;
    if (lightingEngine) {
      lightingEngine.updateGrid(gridRef.current, true);

      gridRef.current.forEach((row, y) => {
        row.forEach((tile, x) => {
          const mineralLightId = `mineral_${x}_${y}`;
          const chestLightId = `chest_${x}_${y}`;
          const torchLightId = `torch_${x}_${y}`;

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
          }

          if (tile.revealed && tile.type === MiningTileType.TORCH) {
            if (!lightingEngine.getLight(torchLightId)) {
              lightingEngine.addLight(
                new PointLight(
                  torchLightId,
                  { x: x + 0.5, y: y + 0.75 },
                  0xf59e0b,
                  1.2,
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
            if (particleEngineRef.current && !torchEmittersRef.current.has(torchLightId)) {
              const emitter = particleEngineRef.current.addEmitter(
                DEFAULT_PARTICLE_EFFECTS.torch_flame,
                { x: (x + 0.5) * TILE_SIZE, y: (y + 0.65) * TILE_SIZE }
              );
              torchEmittersRef.current.set(torchLightId, emitter);
            }
          }
        });
      });
    }
  }, [containersReady, tileTextureLoaded]);

  // Real-time 30 Hz server ticks subscription (updates refs & graphics incrementally with ZERO React re-renders)
  useEffect(() => {
    const cleanup = onEvent('mining_state_tick', (payload: MiningStateTickPayload) => {
      const tickStart = performance.now();
      targetServerPosRef.current = payload.position;
      isMiningRef.current = payload.isMining;
      miningTargetRef.current = payload.miningTarget ?? null;
      activeFallingRocksRef.current = payload.fallingRocks
        ? payload.fallingRocks.map((r) => ({ id: r.id, x: r.position.x, y: r.position.y }))
        : [];

      // Update remote players
      if (remotePlayerRendererRef.current && payload.otherPlayers) {
        remotePlayerRendererRef.current.updatePlayers(payload.otherPlayers);
      }

      // Incremental Tile Updates
      if (payload.revealedTiles && payload.revealedTiles.length > 0) {
        const grid = gridRef.current;
        for (const rt of payload.revealedTiles) {
          const prevTile = grid[rt.y]?.[rt.x];
          if (prevTile) {
            // Trigger particle effects for block damage or block excavation
            const wasDamaged = rt.damageStage !== undefined && rt.damageStage > (prevTile.damageStage || 0);
            const wasDestroyed = prevTile.type !== MiningTileType.EMPTY && rt.type === MiningTileType.EMPTY;
            if ((wasDamaged || wasDestroyed) && particleEngineRef.current) {
              const hitPos = { x: (rt.x + 0.5) * TILE_SIZE, y: (rt.y + 0.5) * TILE_SIZE };
              if (prevTile.type === MiningTileType.MINERAL) {
                particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_hit, hitPos);
              } else {
                particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_dirt_hit, hitPos);
              }
            }

            const canDamage = canTileBeDamaged(rt.type);
            prevTile.type = rt.type;
            prevTile.revealed = true;
            prevTile.damageStage = canDamage ? (rt.damageStage ?? prevTile.damageStage ?? 0) : 0;
          }
        }

        const tilesContainer = tilesContainerRef.current;
        if (tilesContainer && containersReady) {
          const tileRenderStart = performance.now();
          MiningTileRenderer.updateRevealedTiles(
            tilesContainer,
            payload.revealedTiles,
            grid,
            blockTexturesRef.current,
            tileGraphicsMap.current,
            tileSpritesMap.current,
            TILE_SIZE
          );
          miningProfiler.recordExternal('Tile Reveal Render', performance.now() - tileRenderStart);
        }

        // Update sunlight & dynamic lights for revealed tiles
        const lightingEngine = lightingEngineRef.current;
        if (lightingEngine) {
          const affectsSunlight = payload.revealedTiles.some(
            (rt) => rt.y <= MINING_CONFIG.SUNLIGHT_MAX_DEPTH + 1 && isTileTransparent(rt.type)
          );
          if (affectsSunlight) {
            lightingEngine.markSunlightDirty(grid);
          }

          for (const rt of payload.revealedTiles) {
            const x = rt.x;
            const y = rt.y;
            const tile = grid[y]?.[x];
            if (!tile) continue;

            const mineralLightId = `mineral_${x}_${y}`;
            const chestLightId = `chest_${x}_${y}`;
            const torchLightId = `torch_${x}_${y}`;

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

            if (tile.revealed && tile.type === MiningTileType.TORCH) {
              if (!lightingEngine.getLight(torchLightId)) {
                lightingEngine.addLight(
                  new PointLight(
                    torchLightId,
                    { x: x + 0.5, y: y + 0.75 },
                    0xf59e0b,
                    1.2,
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
              if (particleEngineRef.current && !torchEmittersRef.current.has(torchLightId)) {
                const emitter = particleEngineRef.current.addEmitter(
                  DEFAULT_PARTICLE_EFFECTS.torch_flame,
                  { x: (x + 0.5) * TILE_SIZE, y: (y + 0.65) * TILE_SIZE }
                );
                torchEmittersRef.current.set(torchLightId, emitter);
              }
            } else {
              lightingEngine.removeLight(torchLightId);
              if (torchEmittersRef.current.has(torchLightId)) {
                torchEmittersRef.current.get(torchLightId)?.destroy();
                torchEmittersRef.current.delete(torchLightId);
              }
            }
          }
        }

        // Sync grid with mouse controller
        mouseControllerRef.current.setGrid(grid);
      }

      // Update dropped items
      const droppedItemsContainer = droppedItemsContainerRef.current;
      if (droppedItemsContainer && containersReady && payload.droppedItems) {
        MiningEntityRenderer.updateDroppedItems(
          droppedItemsContainer,
          payload.droppedItems,
          droppedSpritesMap.current,
          TILE_SIZE
        );
      }

      miningProfiler.recordExternal('Socket Tick Handler', performance.now() - tickStart);
    });

    return () => {
      cleanup();
      torchEmittersRef.current.forEach((emitter) => emitter.destroy());
      torchEmittersRef.current.clear();
    };
  }, [onEvent, containersReady]);

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
  });

  return <div className="mining-grid-container" />;
};
