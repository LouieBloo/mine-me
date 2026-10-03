import { useEffect, useRef } from 'react';
import type { Container, Texture, Graphics, Sprite } from 'pixi.js';
import {
  type MiningStateTickPayload,
  type Vector2D,
  type MiningClientTile,
  type MiningPosition,
  type MiningActiveDynamite,
  type MiningActiveProjectile,
  type MiningDroppedItem,
  type MiningBackpackItem,
  type PlayerState,
  MiningPlayerBody,
  MiningTileType,
  MINING_CONFIG,
  DEFAULT_PARTICLE_EFFECTS,
  canTileBeDamaged,
  MINING_SPATIAL_AUDIO_PRESETS,
} from '@mine-me/shared';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import type { EmitterHandle, ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { SoundManager } from '../../../../../services/sound';
import type { MiningMouseController } from '../input/MiningMouseController';
import { MiningTileRenderer, TILE_SIZE } from '../renderers/MiningTileRenderer';
import { MiningEntityRenderer } from '../renderers/MiningEntityRenderer';
import type { DynamiteVisualManager } from '../renderers/DynamiteVisualManager';
import type { DroppedItemVisualManager } from '../renderers/DroppedItemVisualManager';
import type { ProjectileVisualManager } from '../renderers/ProjectileVisualManager';
import type { MiningRemotePlayerRenderer } from '../renderers/MiningRemotePlayerRenderer';
import type { MiningMobRenderer } from '../renderers/MiningMobRenderer';
import { miningProfiler } from '../utils/MiningProfiler';

export interface UseMiningStateSyncOptions {
  onEvent: (event: any, handler: (payload: any) => void) => () => void;
  playerState: PlayerState;
  equippedWeapon: any;
  soundManager: SoundManager;

  gridRef: React.MutableRefObject<MiningClientTile[][]>;
  playerBodyRef: React.MutableRefObject<MiningPlayerBody>;
  targetServerPosRef: React.MutableRefObject<Vector2D>;
  isMiningRef: React.MutableRefObject<boolean>;
  miningTargetRef: React.MutableRefObject<MiningPosition | null>;
  activeFallingRocksRef: React.MutableRefObject<{ id: string; x: number; y: number }[]>;
  activeDynamitesRef: React.MutableRefObject<MiningActiveDynamite[]>;
  activeProjectilesRef: React.MutableRefObject<MiningActiveProjectile[]>;
  droppedItemsRef: React.MutableRefObject<MiningDroppedItem[]>;
  weaponAmmoStateRef: React.MutableRefObject<{ current: number; max: number; isReloading: boolean }>;
  weaponSoundUrlRef: React.MutableRefObject<string | null>;

  mouseControllerRef: React.MutableRefObject<MiningMouseController>;
  tilesContainerRef: React.RefObject<Container | null>;
  droppedItemsContainerRef: React.RefObject<Container | null>;
  containersReady: boolean;

  blockTexturesRef: React.MutableRefObject<Map<number, Texture>>;
  tileGraphicsMap: React.MutableRefObject<Map<string, Graphics>>;
  tileSpritesMap: React.MutableRefObject<Map<string, Sprite>>;
  droppedSpritesMap: React.RefObject<Map<string, Sprite | Graphics>>;

  remotePlayerRendererRef: React.RefObject<MiningRemotePlayerRenderer | null>;
  mobRendererRef: React.RefObject<MiningMobRenderer | null>;
  lightingEngineRef: React.RefObject<LightingEngine | null>;
  particleEngineRef: React.RefObject<ParticleEngine | null>;
  blockParticleConfigsRef: React.MutableRefObject<Map<number, any>>;
  blockSoundsRef: React.MutableRefObject<Map<number, string>>;

  torchEmittersRef: React.MutableRefObject<Map<string, EmitterHandle>>;
  blockEmittersRef: React.MutableRefObject<Map<string, EmitterHandle>>;

  dynamiteVisualManagerRef: React.RefObject<DynamiteVisualManager>;
  projectileVisualManagerRef: React.RefObject<ProjectileVisualManager>;
  droppedItemVisualManagerRef: React.RefObject<DroppedItemVisualManager>;

  onVisionChange?: (newVision: number) => void;
  onBackpackChange?: (newBackpack: MiningBackpackItem[]) => void;
  onWeaponAmmoChange?: (ammo: {
    current: number;
    max: number;
    isReloading: boolean;
    weaponName?: string;
    weaponIconUrl?: string | null;
  } | null) => void;
}

/**
 * Synchronizes real-time 30 Hz server ticks with local graphics and state refs
 * with ZERO React re-renders.
 */
export function useMiningStateSync({
  onEvent,
  playerState,
  equippedWeapon,
  soundManager,
  gridRef,
  playerBodyRef,
  targetServerPosRef,
  isMiningRef,
  miningTargetRef,
  activeFallingRocksRef,
  activeDynamitesRef,
  activeProjectilesRef,
  droppedItemsRef,
  weaponAmmoStateRef,
  weaponSoundUrlRef,
  mouseControllerRef,
  tilesContainerRef,
  droppedItemsContainerRef,
  containersReady,
  blockTexturesRef,
  tileGraphicsMap,
  tileSpritesMap,
  droppedSpritesMap,
  remotePlayerRendererRef,
  mobRendererRef,
  lightingEngineRef,
  particleEngineRef,
  blockParticleConfigsRef,
  blockSoundsRef,
  torchEmittersRef,
  blockEmittersRef,
  dynamiteVisualManagerRef,
  projectileVisualManagerRef,
  droppedItemVisualManagerRef,
  onVisionChange,
  onBackpackChange,
  onWeaponAmmoChange,
}: UseMiningStateSyncOptions) {
  const onVisionChangeRef = useRef(onVisionChange);
  onVisionChangeRef.current = onVisionChange;

  const onBackpackChangeRef = useRef(onBackpackChange);
  onBackpackChangeRef.current = onBackpackChange;

  const lastDamageParticleTimeRef = useRef<Map<string, number>>(new Map());
  const lastWeaponSoundTimeRef = useRef<number>(0);
  const lastBlockSoundTimeRef = useRef<Map<string, number>>(new Map());
  const recentExplosionsRef = useRef<{ x: number; y: number; radius: number; time: number }[]>([]);

  useEffect(() => {
    const cleanup = onEvent('mining_state_tick', (payload: MiningStateTickPayload) => {
      const tickStart = performance.now();
      targetServerPosRef.current = payload.position;
      isMiningRef.current = payload.isMining;
      miningTargetRef.current = payload.miningTarget ?? null;
      soundManager.setListenerPosition?.(playerBodyRef.current?.position ?? payload.position);
      activeFallingRocksRef.current = payload.fallingRocks
        ? payload.fallingRocks.map((r) => ({ id: r.id, x: r.position.x, y: r.position.y }))
        : [];
      activeDynamitesRef.current = payload.activeDynamites || [];
      const serverProjectiles = (payload.activeProjectiles || []).filter(
        (p) => p.characterId !== playerState?.id
      );
      const clientProjectiles = activeProjectilesRef.current.filter((p) =>
        p.id.startsWith('client_proj_')
      );
      activeProjectilesRef.current = [...serverProjectiles, ...clientProjectiles];

      // Sync weapon ammo state from server authoritative tick
      if (payload.weaponAmmo && equippedWeapon) {
        weaponAmmoStateRef.current = {
          current: payload.weaponAmmo.current,
          max: payload.weaponAmmo.max,
          isReloading: payload.weaponAmmo.isReloading,
        };
        onWeaponAmmoChange?.({
          current: payload.weaponAmmo.current,
          max: payload.weaponAmmo.max,
          isReloading: payload.weaponAmmo.isReloading,
          weaponName: equippedWeapon.name,
          weaponIconUrl: equippedWeapon.iconUrl,
        });
      }

      // Process gunshots if received in server tick
      if (payload.gunshots && payload.gunshots.length > 0) {
        projectileVisualManagerRef.current.handleGunshotEvents(
          payload.gunshots,
          playerState?.id,
          particleEngineRef.current,
          lightingEngineRef.current,
          soundManager,
          TILE_SIZE
        );
      }

      // Process explosions if received in server tick
      if (payload.explosions && payload.explosions.length > 0) {
        dynamiteVisualManagerRef.current.handleExplosionEvents(
          payload.explosions,
          particleEngineRef.current,
          lightingEngineRef.current,
          TILE_SIZE,
          soundManager
        );
        const expNow = performance.now();
        for (const exp of payload.explosions) {
          recentExplosionsRef.current.push({
            x: exp.position.x,
            y: exp.position.y,
            radius: exp.radius,
            time: expNow,
          });
        }
      }

      // Update remote players
      if (remotePlayerRendererRef.current && payload.otherPlayers) {
        remotePlayerRendererRef.current.updatePlayers(payload.otherPlayers);
      }

      // Update active mobs
      if (mobRendererRef?.current && payload.mobs) {
        mobRendererRef.current.updateMobs(payload.mobs);
      }

      // Update vision range if provided
      if (payload.visionRange !== undefined) {
        onVisionChangeRef.current?.(payload.visionRange);
      }

      // Update temporary backpack if provided
      if (payload.temporaryBackpack) {
        onBackpackChangeRef.current?.(payload.temporaryBackpack);
      }

      // Incremental Tile Updates
      if (payload.revealedTiles && payload.revealedTiles.length > 0) {
        const grid = gridRef.current;
        const now = performance.now();
        recentExplosionsRef.current = recentExplosionsRef.current.filter((e) => now - e.time < 600);

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
            // A tile can only take damage or be destroyed if it was ALREADY revealed
            const wasDamaged = prevTile.revealed && rt.damageStage !== undefined && rt.damageStage > (prevTile.damageStage || 0);
            const wasDestroyed = prevTile.revealed && prevTile.type !== MiningTileType.EMPTY && rt.type === MiningTileType.EMPTY;
            const tileKey = `${rt.x},${rt.y}`;

            // Check if destroyed by an active dynamite explosion
            const isExplosionDestroyed = recentExplosionsRef.current.some(
              (exp) => Math.hypot(rt.x + 0.5 - exp.x, rt.y + 0.5 - exp.y) <= exp.radius + 1.2
            );

            // Weapon sound ONLY plays when the player is actively mining this specific target tile
            const isPlayerMiningThisTile =
              (payload.isMining || isMiningRef?.current) &&
              miningTargetRef.current &&
              miningTargetRef.current.x === rt.x &&
              miningTargetRef.current.y === rt.y;

            if ((wasDamaged || wasDestroyed) && isPlayerMiningThisTile) {
              const soundUrl = weaponSoundUrlRef.current;
              if (soundUrl) {
                const lastSoundTime = lastWeaponSoundTimeRef.current;
                if (now - lastSoundTime >= 100) {
                  lastWeaponSoundTimeRef.current = now;
                  soundManager.playSfx(soundUrl);
                }
              }
            }

            // Block damage/break sound only plays if NOT destroyed by an explosion
            if ((wasDamaged || wasDestroyed) && !isExplosionDestroyed) {
              const blockSoundUrl = blockSoundsRef.current.get(prevTile.type);
              if (blockSoundUrl) {
                const lastBlockSound = lastBlockSoundTimeRef.current.get(tileKey) || 0;
                if (now - lastBlockSound >= 100) {
                  lastBlockSoundTimeRef.current.set(tileKey, now);
                  const soundPos = { x: rt.x + 0.5, y: rt.y + 0.5 };
                  if (typeof soundManager.playPositionalSfx === 'function') {
                    soundManager.playPositionalSfx(blockSoundUrl, soundPos, {
                      spatial: MINING_SPATIAL_AUDIO_PRESETS.BLOCK_MINING,
                    });
                  } else {
                    soundManager.playSfx(blockSoundUrl, {
                      position: soundPos,
                      spatial: MINING_SPATIAL_AUDIO_PRESETS.BLOCK_MINING,
                    });
                  }
                }
              }
            }

            if (particleEngineRef.current) {
              const hitPos = getHitPosition(rt.x, rt.y);
              if (wasDestroyed) {
                // Block broke completely: trigger full break crumble
                lastDamageParticleTimeRef.current.delete(tileKey);
                lastBlockSoundTimeRef.current.delete(tileKey);
                const blockEmitterId = `block_effect_${rt.x}_${rt.y}`;
                if (blockEmittersRef.current.has(blockEmitterId)) {
                  blockEmittersRef.current.get(blockEmitterId)?.destroy();
                  blockEmittersRef.current.delete(blockEmitterId);
                }

                if (!isExplosionDestroyed) {
                  const prevParticleConfig = blockParticleConfigsRef.current.get(prevTile.type);
                  if (prevParticleConfig) {
                    particleEngineRef.current.spawnBurst(prevParticleConfig, hitPos);
                    particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_hit, hitPos);
                  } else if (prevTile.type === MiningTileType.MINERAL) {
                    particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_hit, hitPos);
                  } else {
                    particleEngineRef.current.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_dirt_hit, hitPos);
                  }
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
      dynamiteVisualManagerRef.current.destroy(
        particleEngineRef.current,
        lightingEngineRef.current,
        soundManager
      );
      droppedItemVisualManagerRef.current.destroy(
        particleEngineRef.current,
        lightingEngineRef.current
      );
    };
  }, [onEvent, containersReady]);
}
