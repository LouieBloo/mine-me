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
  type MiningActiveDynamite,
  type MiningDroppedItem,
  type GameItem,
} from '@mine-me/shared';
import { PointLight } from '../../../../components/game/lighting/PointLight';
import type { EmitterHandle } from '../../../../components/game/particles/ParticleEngine';
import { useSocket } from '../../../../contexts/SocketContext';
import { notificationService } from '../../../../services/notificationService';
import { MiningMouseController } from './input/MiningMouseController';
import { TorchPlacementAction, LadderPlacementAction, ThrowableItemAction } from './input/MouseAction';
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
  isThrowingDynamite?: boolean;
  isThrowingItem?: boolean;
  activeThrowableItem?: GameItem | null;
  onDynamiteThrown?: () => void;
  showDebug?: boolean;
  onToggleDebug?: () => void;
  onVisionChange?: (newVision: number) => void;
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
  isThrowingDynamite = false,
  isThrowingItem = false,
  activeThrowableItem = null,
  onDynamiteThrown,
  showDebug,
  onToggleDebug,
  onVisionChange,
}) => {
  const { app } = usePixiStage();
  const { onEvent, sendGameEvent } = useSocket();

  const onVisionChangeRef = useRef(onVisionChange);
  onVisionChangeRef.current = onVisionChange;

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
  const activeDynamitesRef = useRef<MiningActiveDynamite[]>([]);
  const droppedItemsRef = useRef<MiningDroppedItem[]>([]);
  const lastDamageParticleTimeRef = useRef<Map<string, number>>(new Map());

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
    dynamitesContainerRef,
    playerContainerRef,
    reticleGraphicsRef,
    debugGraphicsRef,
    tileGraphicsMap,
    tileSpritesMap,
    blockTexturesRef,
    droppedSpritesMap,
    fallingRockGraphicsMap,
    dynamiteGraphicsMap,
    dynamiteTextureRef,
    playerSpriteRef,
    remotePlayerRendererRef,
    lightingEngineRef,
    flashlightRef,
    particleEngineRef,
    blockParticleConfigsRef,
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
  const blockEmittersRef = useRef<Map<string, EmitterHandle>>(new Map());

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
      const torchItem = playerState?.inventory?.items?.find(
        (inv: any) =>
          inv.item?.subType?.toUpperCase() === 'TORCH' ||
          inv.item?.name?.toLowerCase().includes('torch')
      )?.item;

      mouseController.setActiveAction(
        new TorchPlacementAction(async (target) => {
          try {
            const res = await sendGameEvent({ type: 'mining_place_torch', target });
            if (res.success) {
              const tile = gridRef.current[target.y]?.[target.x];
              if (tile) {
                tile.type = MiningTileType.TORCH;
                tile.revealed = true;
                tile.damageStage = 0;
              }
              const tilesContainer = tilesContainerRef.current;
              if (tilesContainer && containersReady) {
                MiningTileRenderer.updateRevealedTiles(
                  tilesContainer,
                  [{ x: target.x, y: target.y, type: MiningTileType.TORCH }],
                  gridRef.current,
                  blockTexturesRef.current,
                  tileGraphicsMap.current,
                  tileSpritesMap.current,
                  TILE_SIZE
                );
              }
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
        }, torchItem?.triggerMode)
      );
    } else if (isPlacingLadder) {
      const ladderItem = playerState?.inventory?.items?.find(
        (inv: any) =>
          inv.item?.subType?.toUpperCase() === 'LADDER' ||
          inv.item?.name?.toLowerCase().includes('ladder')
      )?.item;

      mouseController.setActiveAction(
        new LadderPlacementAction(async (target) => {
          try {
            const res = await sendGameEvent({ type: 'mining_place_ladder', target });
            if (res.success) {
              const tile = gridRef.current[target.y]?.[target.x];
              if (tile) {
                tile.type = MiningTileType.LADDER;
                tile.revealed = true;
                tile.damageStage = 0;
              }
              const tilesContainer = tilesContainerRef.current;
              if (tilesContainer && containersReady) {
                MiningTileRenderer.updateRevealedTiles(
                  tilesContainer,
                  [{ x: target.x, y: target.y, type: MiningTileType.LADDER }],
                  gridRef.current,
                  blockTexturesRef.current,
                  tileGraphicsMap.current,
                  tileSpritesMap.current,
                  TILE_SIZE
                );
              }
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
        }, ladderItem?.triggerMode)
      );
    } else if (isThrowingItem || isThrowingDynamite) {
      const targetItem =
        activeThrowableItem ||
        playerState?.inventory?.items?.find(
          (inv: any) =>
            inv.item?.throwable === true ||
            inv.item?.subType?.toUpperCase() === 'DYNAMITE' ||
            inv.item?.name?.toLowerCase().includes('dynamite')
        )?.item;

      mouseController.setActiveAction(
        new ThrowableItemAction({
          name: targetItem ? `throw_${targetItem.name.toLowerCase().replace(/\s+/g, '_')}` : 'throw_dynamite',
          itemId: targetItem?.id,
          physicsConfig: (targetItem as any)?.physicsConfig,
          triggerMode: targetItem?.triggerMode,
          onThrow: async (target, forceRatio) => {
            try {
              const res = await sendGameEvent({
                type: 'mining_throw_dynamite',
                target,
                forceRatio,
                itemId: targetItem?.id,
              } as any);
              if (res.success) {
                onDynamiteThrown?.();
                return true;
              } else {
                notificationService.error('Cannot Throw Item', res.error || 'Failed to throw item.');
                return false;
              }
            } catch (err: any) {
              console.error('[MiningGrid] mining_throw_dynamite error:', err);
              notificationService.error('Error', err.message || 'Failed to throw item.');
              return false;
            }
          },
        })
      );
    } else {
      mouseController.setActiveAction(null);
      lightingEngineRef.current?.removeLight('torch_preview');
    }

    return () => {
      lightingEngineRef.current?.removeLight('torch_preview');
    };
  }, [
    isPlacingTorch,
    isPlacingLadder,
    isThrowingDynamite,
    isThrowingItem,
    activeThrowableItem,
    sendGameEvent,
    onTorchPlaced,
    onLadderPlaced,
    onDynamiteThrown,
    containersReady,
    playerState?.inventory?.items,
  ]);

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
    onVisionChange,
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
          const chestLightId = `chest_${x}_${y}`;
          const torchLightId = `torch_${x}_${y}`;

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
                  { x: x + 0.446, y: y + 0.35 },
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
            if (particleEngineRef.current && !torchEmittersRef.current.has(torchLightId)) {
              const emitter = particleEngineRef.current.addEmitter(
                DEFAULT_PARTICLE_EFFECTS.torch_flame,
                { x: (x + 0.446) * TILE_SIZE, y: (y + 0.28) * TILE_SIZE }
              );
              torchEmittersRef.current.set(torchLightId, emitter);
            }
          }

          // Ambient block particle effects from dynamic config (NO LIGHT)
          const particleConfig = tile.revealed ? blockParticleConfigsRef.current.get(tile.type) : undefined;
          if (particleConfig && particleEngineRef.current) {
            const blockEmitterId = `block_effect_${x}_${y}`;
            if (!blockEmittersRef.current.has(blockEmitterId)) {
              const emitter = particleEngineRef.current.addEmitter(
                particleConfig,
                { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE }
              );
              blockEmittersRef.current.set(blockEmitterId, emitter);
            }
          }
        });
      });
    }

    return () => {
      torchEmittersRef.current.forEach((emitter) => emitter.destroy());
      torchEmittersRef.current.clear();
      blockEmittersRef.current.forEach((emitter) => emitter.destroy());
      blockEmittersRef.current.clear();
    };
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
      activeDynamitesRef.current = payload.activeDynamites || [];

      // Update remote players
      if (remotePlayerRendererRef.current && payload.otherPlayers) {
        remotePlayerRendererRef.current.updatePlayers(payload.otherPlayers);
      }

      // Update vision range if provided
      if (payload.visionRange !== undefined) {
        onVisionChangeRef.current?.(payload.visionRange);
      }

      // Incremental Tile Updates
      if (payload.revealedTiles && payload.revealedTiles.length > 0) {
        const grid = gridRef.current;
        const now = performance.now();

        // Helper to locate hit position, prioritizing the user's cursor if targeted
        const getHitPosition = (tileX: number, tileY: number) => {
          const mouseController = mouseControllerRef.current;
          if (mouseController) {
            const worldMouse = mouseController.getWorldMousePosition();
            const hoveredTile = mouseController.getHoveredTile();
            const miningTarget = miningTargetRef.current;
            const isTargetingThis =
              (hoveredTile && hoveredTile.x === tileX && hoveredTile.y === tileY) ||
              (miningTarget && miningTarget.x === tileX && miningTarget.y === tileY);

            if (worldMouse && isTargetingThis) {
              // Clamp tightly inside tile boundaries so particles originate exactly where cursor strikes
              const minX = tileX * TILE_SIZE + 2;
              const maxX = (tileX + 1) * TILE_SIZE - 2;
              const minY = tileY * TILE_SIZE + 2;
              const maxY = (tileY + 1) * TILE_SIZE - 2;
              return {
                x: Math.max(minX, Math.min(maxX, worldMouse.x)),
                y: Math.max(minY, Math.min(maxY, worldMouse.y)),
              };
            }
          }
          return { x: (tileX + 0.5) * TILE_SIZE, y: (tileY + 0.5) * TILE_SIZE };
        };

        for (const rt of payload.revealedTiles) {
          const prevTile = grid[rt.y]?.[rt.x];
          if (prevTile) {
            const wasDamaged = rt.damageStage !== undefined && rt.damageStage > (prevTile.damageStage || 0);
            const wasDestroyed = prevTile.type !== MiningTileType.EMPTY && rt.type === MiningTileType.EMPTY;
            const tileKey = `${rt.x},${rt.y}`;

            if (particleEngineRef.current) {
              const hitPos = getHitPosition(rt.x, rt.y);
              if (wasDestroyed) {
                // Block broke completely: trigger full break crumble
                lastDamageParticleTimeRef.current.delete(tileKey);
                const blockEmitterId = `block_effect_${rt.x}_${rt.y}`;
                if (blockEmittersRef.current.has(blockEmitterId)) {
                  blockEmittersRef.current.get(blockEmitterId)?.destroy();
                  blockEmittersRef.current.delete(blockEmitterId);
                }

                const prevParticleConfig = blockParticleConfigsRef.current.get(prevTile.type);
                if (prevParticleConfig) {
                  particleEngineRef.current.spawnBurst(prevParticleConfig, hitPos);
                  particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_hit, hitPos);
                } else if (prevTile.type === MiningTileType.MINERAL) {
                  particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_hit, hitPos);
                } else {
                  particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_dirt_hit, hitPos);
                }
              } else if (wasDamaged) {
                // Block took damage: throttle intermediate chipping to avoid explosive multi-bursts (~4 Hz)
                const lastTime = lastDamageParticleTimeRef.current.get(tileKey) || 0;
                if (now - lastTime >= 240) {
                  lastDamageParticleTimeRef.current.set(tileKey, now);
                  const prevParticleConfig = blockParticleConfigsRef.current.get(prevTile.type);
                  if (prevParticleConfig) {
                    particleEngineRef.current.spawnBurst(prevParticleConfig, hitPos);
                    particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_chip, hitPos);
                  } else if (prevTile.type === MiningTileType.MINERAL) {
                    particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_chip, hitPos);
                  } else {
                    particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_dirt_chip, hitPos);
                  }
                }
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

        // Sync lights with modified tiles
        const lightingEngine = lightingEngineRef.current;
        if (lightingEngine) {
          lightingEngine.updateGrid(grid);

          for (const rt of payload.revealedTiles) {
            const { x, y } = rt;
            const tile = grid[y]?.[x];
            if (!tile) continue;

            const chestLightId = `chest_${x}_${y}`;
            const torchLightId = `torch_${x}_${y}`;
            const blockEmitterId = `block_effect_${x}_${y}`;

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
                    { x: x + 0.446, y: y + 0.35 },
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
              if (particleEngineRef.current && !torchEmittersRef.current.has(torchLightId)) {
                const emitter = particleEngineRef.current.addEmitter(
                  DEFAULT_PARTICLE_EFFECTS.torch_flame,
                  { x: (x + 0.446) * TILE_SIZE, y: (y + 0.28) * TILE_SIZE }
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

            // Continuous block particle effect from dynamic config (NO LIGHT)
            const particleConfig = tile.revealed ? blockParticleConfigsRef.current.get(tile.type) : undefined;
            if (particleConfig && particleEngineRef.current) {
              if (!blockEmittersRef.current.has(blockEmitterId)) {
                const emitter = particleEngineRef.current.addEmitter(
                  particleConfig,
                  { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE }
                );
                blockEmittersRef.current.set(blockEmitterId, emitter);
              }
            } else {
              if (blockEmittersRef.current.has(blockEmitterId)) {
                blockEmittersRef.current.get(blockEmitterId)?.destroy();
                blockEmittersRef.current.delete(blockEmitterId);
              }
            }
          }
        }

        // Sync grid with mouse controller
        mouseControllerRef.current.setGrid(grid);
      }

      // Update dropped items
      const droppedItemsContainer = droppedItemsContainerRef.current;
      if (payload.droppedItems) {
        droppedItemsRef.current = payload.droppedItems;
      }
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
      blockEmittersRef.current.forEach((emitter) => emitter.destroy());
      blockEmittersRef.current.clear();
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
    dynamitesContainerRef,
    activeDynamitesRef,
    dynamiteGraphicsMap,
    dynamiteTextureRef,
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
  });

  return <div className="mining-grid-container" />;
};
