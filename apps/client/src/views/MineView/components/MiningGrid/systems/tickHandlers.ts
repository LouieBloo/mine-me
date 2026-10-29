import { BLOCK_SCALE } from '@mine-me/shared';
import { withVolume } from '../../../../../services/sound/sfxVolume';
import {
  type FireWireCell,
  type FluidWireCell,
  type GasWireCell,
  type MiningStateTickPayload,
  MiningTileType,
  MINING_CONFIG,
  DEFAULT_PARTICLE_EFFECTS,
  canTileBeDamaged,
  getTileFootprint,
  isPieceCentreCell,
  pieceOrigin,
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
  onBackpackChange?: (backpack: NonNullable<MiningStateTickPayload['temporaryBackpack']>, load: { weight?: number; capacity?: number }) => void;
  /** The belt grew or started or stopped waiting. */
  onBeltChange?: (update: NonNullable<MiningStateTickPayload['belt']>) => void;
  /** What the player has handed to the extractor (sent whenever it changes). */
  onStashChange?: (stash: NonNullable<MiningStateTickPayload['stash']>) => void;
  /** An item on the ground did not fit in the backpack (the server throttles this). */
  onBackpackFull?: () => void;
}

const SOUND_REPEAT_MS = 80;
const PARTICLE_REPEAT_MS = 100;
const EXPLOSION_MEMORY_MS = 600;
const EXPLOSION_DESTROY_MARGIN = 1.2 * BLOCK_SCALE;

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
    ? payload.fallingRocks.map((r) => ({ id: r.id, x: r.position.x, y: r.position.y, width: r.width, height: r.height }))
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
  if (payload.temporaryBackpack) {
    ctx.onBackpackChange?.(payload.temporaryBackpack, { weight: payload.backpackWeight, capacity: payload.backpackCapacity });
  }
  if (payload.stash) ctx.onStashChange?.(payload.stash);
  if (payload.backpackFull) {
    ctx.onBackpackFull?.();
    world.characterSoundsRef?.current?.play('backpackFull');
  }

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
          soundManager.playSfx(soundUrl, withVolume(world.weaponSoundVolumeRef.current));
        }
      }

      const blockSound = world.blockSoundsRef.current.get(hit.tileType);
      if (blockSound) {
        const lastBlockSound = ctx.effects.lastBlockSoundTime.get(tileKey) || 0;
        if (now - lastBlockSound >= SOUND_REPEAT_MS) {
          ctx.effects.lastBlockSoundTime.set(tileKey, now);
          const soundPos = { x: hit.x + 0.5, y: hit.y + 0.5 };
          if (typeof soundManager.playPositionalSfx === 'function') {
            soundManager.playPositionalSfx(
              blockSound.url,
              soundPos,
              withVolume(blockSound.volume, { spatial: MINING_SPATIAL_AUDIO_PRESETS.BLOCK_MINING })
            );
          } else {
            soundManager.playSfx(
              blockSound.url,
              withVolume(blockSound.volume, { position: soundPos, spatial: MINING_SPATIAL_AUDIO_PRESETS.BLOCK_MINING })
            );
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
        } else {
          particleEngine.spawnBurst(DEFAULT_PARTICLE_EFFECTS.block_dirt_hit, hitPos);
        }
      }
    }

    prevTile.type = rt.type;
    prevTile.revealed = true;
    prevTile.damageStage = canTileBeDamaged(rt.type) ? (rt.damageStage ?? prevTile.damageStage ?? 0) : 0;
    prevTile.piece = rt.piece;
    if (rt.biome !== undefined) prevTile.biome = rt.biome;
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
    miningProfiler.recordEvent('Tile Reveal Render', performance.now() - start);
  }

  syncTileLights(revealed, ctx);
  world.mouseControllerRef.current?.setGrid(grid);
}

/**
 * Fluid the server revealed or changed: the fluid in newly revealed tiles, then this tick's changed cells.
 * Works on the client's copy of the fluid grid; changes are drawn eased, so the fluid flows between steps.
 */
export function applyFluidUpdates(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const renderer = ctx.world.fluidRendererRef?.current;
  if (!renderer) return;
  // Fluid that just came into view shows at once; fluid that moved eases there (the renderer's per-frame update)
  const revealed: FluidWireCell[] = [];
  for (const tile of payload.revealedTiles ?? []) {
    if (tile.fluid) revealed.push(tile.fluid[2] ? [tile.x, tile.y, tile.fluid[0], tile.fluid[1], tile.fluid[2]] : [tile.x, tile.y, tile.fluid[0], tile.fluid[1]]);
    // A mined or placed tile changes whether the fluid beside it rests or falls (the grid is already updated)
    renderer.onTileChanged(tile.x, tile.y);
  }
  if (revealed.length > 0) renderer.apply(revealed);
  if (payload.fluidCells && payload.fluidCells.length > 0) renderer.apply(payload.fluidCells, true);
  renderer.render();
}

/**
 * Gas the server revealed or changed: the gas in newly revealed tiles, then this tick's changed cells.
 * Works on the client's copy of the gas grid; changes are drawn eased, so a cloud thickens and thins smoothly.
 */
export function applyGasUpdates(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const renderer = ctx.world.gasRendererRef?.current;
  if (!renderer) return;
  // Gas that just came into view shows at once; gas that moved eases there (the renderer's per-frame update)
  const revealed: GasWireCell[] = [];
  for (const tile of payload.revealedTiles ?? []) {
    if (tile.gas) revealed.push([tile.x, tile.y, tile.gas[0], tile.gas[1]]);
  }
  if (revealed.length > 0) renderer.apply(revealed);
  if (payload.gasCells && payload.gasCells.length > 0) renderer.apply(payload.gasCells, true);
  renderer.render();
  // Explosive gas that went off this tick: the flash and sparks in each cell the front crossed
  if (payload.gasExplosions && payload.gasExplosions.length > 0) renderer.playExplosions(payload.gasExplosions);
}

/**
 * Doodads (scenery) the server revealed or took away (ticket 101, 105). Additions come first, then removals; the field also
 * applies the server's own removal rules to every tile change in the tick, so a doodad is gone the moment its block is, even
 * if the removal delta were to be late. Hidden doodads are never sent, so there is nothing to filter here.
 */
export function applyDoodadUpdates(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const field = ctx.world.doodadFieldRef?.current;
  if (!field) return;
  const renderer = ctx.world.doodadRendererRef?.current;
  // Hurt and killed doodads (ticket 143): flash the hurt ones, and note the killed so their removal reads as a death
  for (const [x, y] of payload.doodadsHit ?? []) renderer?.flashHit(x, y);
  for (const [x, y] of payload.doodadsKilled ?? []) renderer?.markKilled(x, y);
  field.apply(payload.doodadsAdded ?? [], payload.doodadsRemoved ?? []);
  for (const tile of payload.revealedTiles ?? []) field.onTileChanged(tile.x, tile.y, tile.type);
  // Ceiling doodads in the air, and the ones that landed this tick (the list is every tick, so an empty one clears them)
  renderer?.setFalling(payload.fallingDoodads ?? []);
  for (const wire of payload.doodadsShattered ?? []) renderer?.shatter(wire);
}

/** The sandbox changed the surface (another environment, or a forced weather): the sky, clouds and weather follow at once (ticket 138). */
export function applySurfaceUpdate(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  if (!payload.surface) return;
  ctx.world.surfaceSystemRef?.current?.apply(payload.surface);
}

/** Fires that started or stopped: in newly revealed tiles, then this tick's changes. Updates the client's copy of the fire grid. */
export function applyFireUpdates(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const field = ctx.world.fireFieldRef?.current;
  if (!field) return;
  const cells: FireWireCell[] = [];
  for (const tile of payload.revealedTiles ?? []) {
    if (tile.fire) cells.push([tile.x, tile.y, 1]);
  }
  if (payload.fireCells) cells.push(...payload.fireCells);
  if (cells.length > 0) field.apply(cells);
}

/** The sounds of gas: bodies entering and leaving a cloud, ignition, the boom of an explosion, gas starting to vent. */
export function applyGasSounds(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const sounds = ctx.world.gasSoundsRef?.current;
  if (!sounds) return;
  if (payload.gasEvents && payload.gasEvents.length > 0) sounds.onEvents(payload.gasEvents);
  if (payload.gasExplosions && payload.gasExplosions.length > 0) sounds.onExplosions(payload.gasExplosions, performance.now());
}

/** Splashes of bodies crossing a fluid's surface, and the sound of cells catching fire. */
export function applyFluidSounds(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const sounds = ctx.world.fluidSoundsRef?.current;
  if (!sounds) return;
  if (payload.fluidSplashes && payload.fluidSplashes.length > 0) sounds.onSplashes(payload.fluidSplashes);
  if (payload.fireCells && payload.fireCells.length > 0) sounds.onFireChanges(payload.fireCells, performance.now());
}

/** The belt grew, or started or stopped waiting. */
export function applyBeltUpdate(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  if (!payload.belt) return;
  const belt = ctx.world.beltRendererRef?.current;
  belt?.setRows(payload.belt.rows, payload.belt.blockedBy);
  if (payload.belt.stages) belt?.setStages(payload.belt.stages);
  if (payload.belt.broke && payload.belt.broke.length > 0) {
    const items = ctx.world.beltItemRendererRef?.current;
    if (items) ctx.world.extractorSoundsRef?.current?.onBeltBroke(payload.belt.broke.map((index) => items.cellPosition(index + 0.5)));
  }
  ctx.onBeltChange?.(payload.belt);
}

/** Items going onto and coming off the belt (and the sounds that go with them). */
export function applyBeltItems(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const changes = payload.beltItems;
  if (!changes) return;
  const renderer = ctx.world.beltItemRendererRef?.current;
  const sounds = ctx.world.extractorSoundsRef?.current;
  if (renderer && changes.added) {
    renderer.add(changes.added);
    sounds?.onItemsAdded(changes.added, (item) => renderer.cellPosition(item.pos));
  }
  if (renderer && changes.removed) renderer.remove(changes.removed);
  sounds?.syncLoop((renderer?.count ?? 0) > 0);
}

/** The extractor has landed (the server says when; the drawn landing finishes by itself). */
export function applyExtractorUpdate(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  if (payload.extractor?.landed) ctx.world.extractorRendererRef?.current?.markLanded();
}

/** Pickup sounds of players near the local player (including their own). */
export function applyItemPickupSounds(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  if (!payload.itemPickups || payload.itemPickups.length === 0) return;
  ctx.world.characterSoundsRef?.current?.onPickups(payload.itemPickups);
}

/** Who is on fire: the local player, mobs and other players. The burning effect follows each of them. */
export function applyBurning(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const burning = ctx.world.burningBodiesRef?.current;
  if (!burning) return;
  const bodies: Array<{ id: string; x: number; y: number }> = [];
  if (payload.burning) bodies.push({ id: 'self', x: payload.position.x, y: payload.position.y });
  for (const mob of payload.mobs ?? []) {
    if (mob.burning) bodies.push({ id: `mob:${mob.id}`, x: mob.position.x, y: mob.position.y });
  }
  for (const other of payload.otherPlayers ?? []) {
    if (other.burning) bodies.push({ id: `player:${other.characterId}`, x: other.position.x, y: other.position.y });
  }
  burning.sync(bodies);
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

    const torchLightId = `torch_${x}_${y}`;
    const blockEmitterId = `block_effect_${x}_${y}`;

    // A torch is a piece of several cells; its flame belongs to the middle one, so it lights the cavern once
    if (tile.revealed && tile.type === MiningTileType.TORCH && isPieceCentreCell(tile.piece, getTileFootprint(MiningTileType.TORCH))) {
      const origin = pieceOrigin(x, y, tile.piece);
      const span = getTileFootprint(MiningTileType.TORCH).width;
      if (!lightingEngine.getLight(torchLightId)) {
        lightingEngine.addLight(
          new PointLight(torchLightId, { x: origin.x + 0.446 * span, y: origin.y + 0.35 * span }, 0xf59e0b, 1.25, MINING_CONFIG.TORCH_RADIUS, {
            flicker: { speed: MINING_CONFIG.TORCH_FLICKER_SPEED, amount: MINING_CONFIG.TORCH_FLICKER_AMOUNT },
          })
        );
      }
      if (particleEngine && !world.torchEmittersRef.current.has(torchLightId)) {
        const emitter = particleEngine.addEmitter(DEFAULT_PARTICLE_EFFECTS.torch_flame, {
          x: (origin.x + 0.446 * span) * TILE_SIZE,
          y: (origin.y + 0.28 * span) * TILE_SIZE,
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
let lastTickAt = 0;

export function handleStateTick(payload: MiningStateTickPayload, ctx: TickHandlerContext): void {
  const start = performance.now();
  // How evenly the server's ticks arrive (about 33ms apart at 30 Hz); a long gap here is a network or server stall
  if (lastTickAt > 0) miningProfiler.recordEvent('Server Tick Interval', start - lastTickAt);
  lastTickAt = start;
  applySelfState(payload, ctx);
  applyEntities(payload, ctx);
  applySessionData(payload, ctx);
  applyEffects(payload, ctx); // explosions are remembered here for applyTileUpdates
  applyTileUpdates(payload, ctx);
  applyFluidUpdates(payload, ctx);
  applyGasUpdates(payload, ctx);
  applyDoodadUpdates(payload, ctx);
  applySurfaceUpdate(payload, ctx);
  applyFireUpdates(payload, ctx);
  applyFluidSounds(payload, ctx); // after the fluid and fire fields are up to date
  applyExtractorUpdate(payload, ctx);
  applyBeltUpdate(payload, ctx);
  applyBeltItems(payload, ctx);
  applyItemPickupSounds(payload, ctx);
  applyGasSounds(payload, ctx);
  applyBurning(payload, ctx);
  miningProfiler.recordEvent('Server Tick Handling', performance.now() - start);
  miningProfiler.setServerPerf(payload.perf);
}
