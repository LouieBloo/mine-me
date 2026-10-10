import {
  type MiningStateTickPayload,
  MiningTileType,
  MINING_CONFIG,
  DEFAULT_PARTICLE_EFFECTS,
  canTileBeDamaged,
  MINING_SPATIAL_AUDIO_PRESETS,
} from '@mine-me/shared';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import type { SoundManager } from '../../../../../services/sound';
import { MiningTileRenderer, TILE_SIZE } from '../renderers/MiningTileRenderer';
import { MiningEntityRenderer } from '../renderers/MiningEntityRenderer';
import { miningProfiler } from '../utils/MiningProfiler';
import { applyTickEntityLists } from './applyTickEntityLists';
import type { EntityDefinitionCache } from './EntityDefinitionCache';
import type { MiningClientWorld } from './MiningClientWorld';

/**
 * One handler per section of the 30 Hz server tick. Each takes the payload and a context and
 * updates the world; none touches React, so each can be tested alone with a small fake world.
 */

/** Short-lived bookkeeping the handlers share between ticks (rate limits, recent blasts). */
export interface TickEffectState {
  lastDamageParticleTime: Map<string, number>;
  lastBlockSoundTime: Map<string, number>;
  recentExplosions: { x: number; y: number; radius: number; time: number }[];
}

export function createTickEffectState(): TickEffectState {
  return { lastDamageParticleTime: new Map(), lastBlockSoundTime: new Map(), recentExplosions: [] };
}

export interface TickHandlerContext {
  world: MiningClientWorld;
  soundManager: SoundManager;
  /** The local player's character id (their own projectiles are drawn from prediction, not the server). */
  playerId?: string;
  /** Whether the player has a weapon equipped (ammo only matters then). */
  hasEquippedWeapon: boolean;
  /** The Pixi containers exist, so graphics can be updated. */
  containersReady: boolean;
  entityDefs: EntityDefinitionCache;
  effects: TickEffectState;
  /** Called with the server's ammo state every tick it is sent (the reload sound watches this). */
  onWeaponAmmo?: (ammo: { current: number; max: number; isReloading: boolean }) => void;
  onVisionChange?: (vision: number) => void;
  onBackpackChange?: (backpack: NonNullable<MiningStateTickPayload['temporaryBackpack']>) => void;
}

const SOUND_REPEAT_MS = 80;
const PARTICLE_REPEAT_MS = 100;
const EXPLOSION_MEMORY_MS = 600;
const EXPLOSION_DESTROY_MARGIN = 1.2;

/** Where on a tile to put hit effects: under the cursor when the player is aiming at it, else the centre. */
export function getHitPosition(world: MiningClientWorld, tileX: number, tileY: number): { x: number; y: number } {
  const mouseController = world.mouseControllerRef.current;
  if (mouseController) {
    const worldMouse = mouseController.getWorldMousePosition();
    const hoveredTile = mouseController.getHoveredTile();
    const miningTarget = world.miningTargetRef.current;
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
}

/** The local player: where the server says they are, whether they are mining, and the prediction ack. */
export function applySelfState(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const { world, soundManager } = ctx;
  world.targetServerPosRef.current = payload.position;
  world.predictionRef.current?.offer(payload);
  world.isMiningRef.current = payload.isMining;
  world.miningTargetRef.current = payload.miningTarget ?? null;
  soundManager.setListenerPosition?.(world.playerBodyRef.current?.position ?? payload.position);
}

/** Falling rocks, dynamites, projectiles, mobs and other players. */
export function applyEntities(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const { world, entityDefs: defs } = ctx;
  world.activeFallingRocksRef.current = payload.fallingRocks
    ? payload.fallingRocks.map((r) => ({ id: r.id, x: r.position.x, y: r.position.y }))
    : [];

  defs.applySpawned(payload.spawned);
  world.activeDynamitesRef.current = defs.hydrateDynamites(payload.activeDynamites ?? []) ?? [];

  const serverProjectiles = (defs.hydrateProjectiles(payload.activeProjectiles ?? []) ?? []).filter(
    (p) => p.characterId !== ctx.playerId
  );
  const clientProjectiles = world.activeProjectilesRef.current.filter((p) => p.id.startsWith('client_proj_'));
  world.activeProjectilesRef.current = [...serverProjectiles, ...clientProjectiles];

  // Empty arrays clear mobs/players; missing fields leave them alone
  applyTickEntityLists(
    { mobs: defs.hydrateMobs(payload.mobs), otherPlayers: defs.hydratePlayers(payload.otherPlayers) },
    { remotePlayerRenderer: world.remotePlayerRendererRef.current, mobRenderer: world.mobRendererRef.current }
  );
}

/** Ammo, vision range, backpack contents and dropped items. */
export function applySessionData(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const { world } = ctx;

  if (payload.weaponAmmo && ctx.hasEquippedWeapon) {
    world.weaponAmmoStateRef.current = {
      current: payload.weaponAmmo.current,
      max: payload.weaponAmmo.max,
      isReloading: payload.weaponAmmo.isReloading,
    };
    ctx.onWeaponAmmo?.(world.weaponAmmoStateRef.current);
  }
  if (payload.visionRange !== undefined) ctx.onVisionChange?.(payload.visionRange);
  if (payload.temporaryBackpack) ctx.onBackpackChange?.(payload.temporaryBackpack);

  // The tick says only where items are (and only when that changed); their descriptions were cached
  // from `spawned` (applyEntities runs first) or the join snapshot.
  const droppedItems = ctx.entityDefs.hydrateDroppedItems(payload.droppedItems);
  if (droppedItems) {
    world.droppedItemsRef.current = droppedItems;
    const container = world.droppedItemsContainerRef.current;
    if (container && ctx.containersReady && world.droppedSpritesMap.current) {
      MiningEntityRenderer.updateDroppedItems(container, droppedItems, world.droppedSpritesMap.current, TILE_SIZE);
    }
  }
}

/** Gunshots, explosions and block hits: the sounds and particles that go with them. */
export function applyEffects(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const { world, soundManager } = ctx;
  const particleEngine = world.particleEngineRef.current;
  const lightingEngine = world.lightingEngineRef.current;

  if (payload.gunshots && payload.gunshots.length > 0) {
    world.projectileVisualManagerRef.current?.handleGunshotEvents(
      payload.gunshots,
      ctx.playerId,
      particleEngine,
      lightingEngine,
      soundManager,
      TILE_SIZE
    );
  }

  if (payload.explosions && payload.explosions.length > 0) {
    world.dynamiteVisualManagerRef.current?.handleExplosionEvents(
      payload.explosions,
      particleEngine,
      lightingEngine,
      TILE_SIZE,
      soundManager
    );
    const now = performance.now();
    for (const exp of payload.explosions) {
      ctx.effects.recentExplosions.push({ x: exp.position.x, y: exp.position.y, radius: exp.radius, time: now });
    }
  }

  if (payload.blockHits && payload.blockHits.length > 0) {
    const now = performance.now();
    for (const hit of payload.blockHits) {
      const tileKey = `${hit.x},${hit.y}`;
      const target = world.miningTargetRef.current;
      const isPlayerMiningThisTile =
        (payload.isMining || world.isMiningRef.current) && target && target.x === hit.x && target.y === hit.y;

      if (isPlayerMiningThisTile) {
        const soundUrl = world.weaponSoundUrlRef.current;
        if (soundUrl && now - world.lastWeaponSoundTimeRef.current >= SOUND_REPEAT_MS) {
          world.lastWeaponSoundTimeRef.current = now;
          soundManager.playSfx(soundUrl);
        }
      }

      const blockSoundUrl = world.blockSoundsRef.current.get(hit.tileType);
      if (blockSoundUrl) {
        const lastBlockSound = ctx.effects.lastBlockSoundTime.get(tileKey) || 0;
        if (now - lastBlockSound >= SOUND_REPEAT_MS) {
          ctx.effects.lastBlockSoundTime.set(tileKey, now);
          const soundPos = { x: hit.x + 0.5, y: hit.y + 0.5 };
          if (typeof soundManager.playPositionalSfx === 'function') {
            soundManager.playPositionalSfx(blockSoundUrl, soundPos, { spatial: MINING_SPATIAL_AUDIO_PRESETS.BLOCK_MINING });
          } else {
            soundManager.playSfx(blockSoundUrl, { position: soundPos, spatial: MINING_SPATIAL_AUDIO_PRESETS.BLOCK_MINING });
          }
        }
      }

      if (particleEngine) {
        const lastTime = ctx.effects.lastDamageParticleTime.get(tileKey) || 0;
        if (now - lastTime >= PARTICLE_REPEAT_MS) {
          ctx.effects.lastDamageParticleTime.set(tileKey, now);
          const hitPos = getHitPosition(world, hit.x, hit.y);
          const config = world.blockParticleConfigsRef.current.get(hit.tileType);
          if (config) {
            particleEngine.spawnBurst(config, hitPos);
            particleEngine.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_chip, hitPos);
          } else if (hit.tileType === MiningTileType.MINERAL) {
            particleEngine.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_chip, hitPos);
          } else {
            particleEngine.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_dirt_chip, hitPos);
          }
        }
      }
    }
  }
}

/** Tiles the server revealed or changed: the grid, break effects, the sprites, lights and emitters. */
export function applyTileUpdates(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const revealed = payload.revealedTiles;
  if (!revealed || revealed.length === 0) return;
  const { world } = ctx;
  const grid = world.gridRef.current;
  const particleEngine = world.particleEngineRef.current;
  const now = performance.now();
  ctx.effects.recentExplosions = ctx.effects.recentExplosions.filter((e) => now - e.time < EXPLOSION_MEMORY_MS);

  for (const rt of revealed) {
    const prevTile = grid[rt.y]?.[rt.x];
    if (!prevTile) continue;
    const wasDestroyed = prevTile.revealed && prevTile.type !== MiningTileType.EMPTY && rt.type === MiningTileType.EMPTY;
    const tileKey = `${rt.x},${rt.y}`;

    // A blast breaks many blocks at once; those do not each get their own crumble
    const isExplosionDestroyed = ctx.effects.recentExplosions.some(
      (exp) => Math.hypot(rt.x + 0.5 - exp.x, rt.y + 0.5 - exp.y) <= exp.radius + EXPLOSION_DESTROY_MARGIN
    );

    if (particleEngine && wasDestroyed) {
      const hitPos = getHitPosition(world, rt.x, rt.y);
      ctx.effects.lastDamageParticleTime.delete(tileKey);
      ctx.effects.lastBlockSoundTime.delete(tileKey);
      const blockEmitterId = `block_effect_${rt.x}_${rt.y}`;
      world.blockEmittersRef.current.get(blockEmitterId)?.destroy();
      world.blockEmittersRef.current.delete(blockEmitterId);

      if (!isExplosionDestroyed) {
        const config = world.blockParticleConfigsRef.current.get(prevTile.type);
        if (config) {
          particleEngine.spawnBurst(config, hitPos);
          particleEngine.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_hit, hitPos);
        } else if (prevTile.type === MiningTileType.MINERAL) {
          particleEngine.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_mineral_hit, hitPos);
        } else {
          particleEngine.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_dirt_hit, hitPos);
        }
      }
    }

    prevTile.type = rt.type;
    prevTile.revealed = true;
    prevTile.damageStage = canTileBeDamaged(rt.type) ? (rt.damageStage ?? prevTile.damageStage ?? 0) : 0;
  }

  const tilesContainer = world.tilesContainerRef.current;
  if (tilesContainer && ctx.containersReady) {
    const start = performance.now();
    MiningTileRenderer.updateRevealedTiles(
      tilesContainer,
      revealed,
      grid,
      world.blockTexturesRef.current,
      world.tileGraphicsMap.current,
      world.tileSpritesMap.current,
      TILE_SIZE
    );
    miningProfiler.recordExternal('Tile Reveal Render', performance.now() - start);
  }

  syncTileLights(revealed, ctx);
  world.mouseControllerRef.current?.setGrid(grid);
}

/** Chest glow, torch light + flame, and ambient block particles for the tiles that changed. */
export function syncTileLights(revealed: NonNullable<MiningStateTickPayload['revealedTiles']>, ctx: TickHandlerContext): void {
  const { world } = ctx;
  const lightingEngine = world.lightingEngineRef.current;
  if (!lightingEngine) return;
  const grid = world.gridRef.current;
  const particleEngine = world.particleEngineRef.current;
  lightingEngine.updateGrid(grid);

  for (const { x, y } of revealed) {
    const tile = grid[y]?.[x];
    if (!tile) continue;

    const chestLightId = `chest_${x}_${y}`;
    const torchLightId = `torch_${x}_${y}`;
    const blockEmitterId = `block_effect_${x}_${y}`;

    if (tile.revealed && tile.type === MiningTileType.CHEST) {
      if (!lightingEngine.getLight(chestLightId)) {
        lightingEngine.addLight(
          new PointLight(chestLightId, { x: x + 0.5, y: y + 0.5 }, 0xfbbf24, 0.9, 2.0, {
            pulse: { speed: 3.2, minIntensity: 0.5, maxIntensity: 1.0 },
          })
        );
      }
    } else {
      lightingEngine.removeLight(chestLightId);
    }

    if (tile.revealed && tile.type === MiningTileType.TORCH) {
      if (!lightingEngine.getLight(torchLightId)) {
        lightingEngine.addLight(
          new PointLight(torchLightId, { x: x + 0.446, y: y + 0.35 }, 0xf59e0b, 1.25, MINING_CONFIG.TORCH_RADIUS, {
            flicker: { speed: MINING_CONFIG.TORCH_FLICKER_SPEED, amount: MINING_CONFIG.TORCH_FLICKER_AMOUNT },
          })
        );
      }
      if (particleEngine && !world.torchEmittersRef.current.has(torchLightId)) {
        const emitter = particleEngine.addEmitter(DEFAULT_PARTICLE_EFFECTS.torch_flame, {
          x: (x + 0.446) * TILE_SIZE,
          y: (y + 0.28) * TILE_SIZE,
        });
        world.torchEmittersRef.current.set(torchLightId, emitter);
      }
    } else {
      lightingEngine.removeLight(torchLightId);
      world.torchEmittersRef.current.get(torchLightId)?.destroy();
      world.torchEmittersRef.current.delete(torchLightId);
    }

    // Continuous block particle effect from dynamic config (no light)
    const particleConfig = tile.revealed ? world.blockParticleConfigsRef.current.get(tile.type) : undefined;
    if (particleConfig && particleEngine) {
      if (!world.blockEmittersRef.current.has(blockEmitterId)) {
        const emitter = particleEngine.addEmitter(particleConfig, { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE });
        world.blockEmittersRef.current.set(blockEmitterId, emitter);
      }
    } else {
      world.blockEmittersRef.current.get(blockEmitterId)?.destroy();
      world.blockEmittersRef.current.delete(blockEmitterId);
    }
  }
}

/** Runs every section handler, in the order the sections depend on each other. */
export function handleStateTick(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const start = performance.now();
  applySelfState(payload, ctx);
  applyEntities(payload, ctx);
  applySessionData(payload, ctx);
  applyEffects(payload, ctx); // explosions are remembered here for applyTileUpdates
  applyTileUpdates(payload, ctx);
  miningProfiler.recordExternal('Socket Tick Handler', performance.now() - start);
}
