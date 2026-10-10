import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiningTileType, DEFAULT_PARTICLE_EFFECTS, type MiningStateTickPayload } from '@mine-me/shared';
import {
  applyEffects,
  applyEntities,
  applySelfState,
  applySessionData,
  applyTileUpdates,
  createTickEffectState,
  getHitPosition,
  handleStateTick,
  type TickHandlerContext,
} from './tickHandlers';
import { EntityDefinitionCache } from './EntityDefinitionCache';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

vi.mock('../renderers/MiningTileRenderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../renderers/MiningTileRenderer')>();
  return { ...actual, MiningTileRenderer: { updateRevealedTiles: vi.fn() } };
});
vi.mock('../renderers/MiningEntityRenderer', () => ({ MiningEntityRenderer: { updateDroppedItems: vi.fn() } }));

import { MiningTileRenderer } from '../renderers/MiningTileRenderer';
import { MiningEntityRenderer } from '../renderers/MiningEntityRenderer';

const ref = <T>(current: T) => ({ current });

function makeWorld(overrides: Record<string, unknown> = {}): any {
  const grid = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => ({ type: MiningTileType.DIRT, revealed: true, damageStage: 0 }))
  );
  return {
    gridRef: ref(grid),
    playerBodyRef: ref({ position: { x: 5, y: 5 } }),
    predictionRef: ref({ offer: vi.fn() }),
    isMiningRef: ref(false),
    miningTargetRef: ref(null),
    targetServerPosRef: ref({ x: 0, y: 0 }),
    mouseControllerRef: ref({ getWorldMousePosition: () => null, getHoveredTile: () => null, setGrid: vi.fn() }),
    activeFallingRocksRef: ref([]),
    activeDynamitesRef: ref([]),
    activeProjectilesRef: ref([]),
    droppedItemsRef: ref([]),
    weaponAmmoStateRef: ref({ current: 0, max: 0, isReloading: false }),
    weaponSoundUrlRef: ref<string | null>(null),
    lastWeaponSoundTimeRef: ref(0),
    tilesContainerRef: ref({}),
    droppedItemsContainerRef: ref({}),
    droppedSpritesMap: ref(new Map()),
    blockTexturesRef: ref(new Map()),
    tileGraphicsMap: ref(new Map()),
    tileSpritesMap: ref(new Map()),
    blockParticleConfigsRef: ref(new Map()),
    blockSoundsRef: ref(new Map<number, string>()),
    torchEmittersRef: ref(new Map()),
    blockEmittersRef: ref(new Map()),
    remotePlayerRendererRef: ref({ updatePlayers: vi.fn() }),
    mobRendererRef: ref({ updateMobs: vi.fn() }),
    lightingEngineRef: ref({
      lights: new Map<string, unknown>(),
      getLight(id: string) { return this.lights.get(id); },
      addLight(l: { id: string }) { this.lights.set(l.id, l); },
      removeLight(id: string) { this.lights.delete(id); },
      updateGrid: vi.fn(),
    }),
    particleEngineRef: ref({
      spawnBurst: vi.fn(),
      addEmitter: vi.fn(() => ({ destroy: vi.fn() })),
    }),
    projectileVisualManagerRef: ref({ handleGunshotEvents: vi.fn() }),
    dynamiteVisualManagerRef: ref({ handleExplosionEvents: vi.fn() }),
    ...overrides,
  };
}

function makeCtx(world: any, over: Partial<TickHandlerContext> = {}): TickHandlerContext {
  return {
    world,
    soundManager: { setListenerPosition: vi.fn(), playSfx: vi.fn(), playPositionalSfx: vi.fn() } as any,
    playerId: 'me',
    hasEquippedWeapon: true,
    containersReady: true,
    entityDefs: new EntityDefinitionCache(),
    effects: createTickEffectState(),
    ...over,
  };
}

const payload = (over: Partial<MiningStateTickPayload> = {}): MiningStateTickPayload =>
  ({
    tick: 1, position: { x: 3, y: 4 }, velocity: { x: 0, y: 0 }, ackSequence: 0, ackAge: 1,
    bodyState: { isGrounded: true, isOnLadder: false, knockbackRemaining: 0 }, isMining: false,
    ...over,
  }) as MiningStateTickPayload;

beforeEach(() => vi.clearAllMocks());

describe('applySelfState', () => {
  it('records the server position, hands the tick to the prediction, and tracks mining', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    const p = payload({ isMining: true, miningTarget: { x: 2, y: 2 } });
    applySelfState(p, ctx);
    expect(world.targetServerPosRef.current).toEqual({ x: 3, y: 4 });
    expect(world.predictionRef.current.offer).toHaveBeenCalledWith(p);
    expect(world.isMiningRef.current).toBe(true);
    expect(world.miningTargetRef.current).toEqual({ x: 2, y: 2 });
    expect((ctx.soundManager as any).setListenerPosition).toHaveBeenCalledWith({ x: 5, y: 5 });
  });

  it('clears the mining target when the tick has none', () => {
    const world = makeWorld({ miningTargetRef: ref({ x: 1, y: 1 }) });
    applySelfState(payload(), makeCtx(world));
    expect(world.miningTargetRef.current).toBeNull();
  });
});

describe('applyEntities', () => {
  it('maps falling rocks, and empties them when the tick has none', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    applyEntities(payload({ fallingRocks: [{ id: 'r', position: { x: 1, y: 2 } } as any] }), ctx);
    expect(world.activeFallingRocksRef.current).toEqual([{ id: 'r', x: 1, y: 2 }]);
    applyEntities(payload(), ctx);
    expect(world.activeFallingRocksRef.current).toEqual([]);
  });

  it('drops the server copy of my own projectiles but keeps ones I fired locally', () => {
    const world = makeWorld({
      activeProjectilesRef: ref([{ id: 'client_proj_1', characterId: 'me' }, { id: 'old', characterId: 'other' }]),
    });
    const ctx = makeCtx(world);
    ctx.entityDefs.hydrateProjectiles = vi.fn(() => [
      { id: 'p-me', characterId: 'me' },
      { id: 'p-other', characterId: 'other' },
    ]) as any;
    applyEntities(payload({ activeProjectiles: [{ id: 'x' } as any] }), ctx);
    expect(world.activeProjectilesRef.current.map((p: any) => p.id)).toEqual(['p-other', 'client_proj_1']);
  });

  it('passes mobs and other players on to their renderers', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    ctx.entityDefs.hydrateMobs = vi.fn(() => [{ id: 'm' }]) as any;
    ctx.entityDefs.hydratePlayers = vi.fn(() => [{ id: 'o' }]) as any;
    applyEntities(payload({ mobs: [{} as any] }), ctx);
    expect(world.mobRendererRef.current.updateMobs).toHaveBeenCalledWith([{ id: 'm' }]);
    expect(world.remotePlayerRendererRef.current.updatePlayers).toHaveBeenCalledWith([{ id: 'o' }]);
  });
});

describe('applySessionData', () => {
  it('takes ammo from the server only when a weapon is equipped', () => {
    const world = makeWorld();
    applySessionData(payload({ weaponAmmo: { current: 3, max: 6, isReloading: true } }), makeCtx(world, { hasEquippedWeapon: false }));
    expect(world.weaponAmmoStateRef.current).toEqual({ current: 0, max: 0, isReloading: false });
    applySessionData(payload({ weaponAmmo: { current: 3, max: 6, isReloading: true } }), makeCtx(world));
    expect(world.weaponAmmoStateRef.current).toEqual({ current: 3, max: 6, isReloading: true });
  });

  it('reports vision and backpack changes, but only when present', () => {
    const onVisionChange = vi.fn();
    const onBackpackChange = vi.fn();
    const ctx = makeCtx(makeWorld(), { onVisionChange, onBackpackChange });
    applySessionData(payload(), ctx);
    expect(onVisionChange).not.toHaveBeenCalled();
    expect(onBackpackChange).not.toHaveBeenCalled();
    applySessionData(payload({ visionRange: 8, temporaryBackpack: [{ itemId: 'a', quantity: 1 } as any] }), ctx);
    expect(onVisionChange).toHaveBeenCalledWith(8);
    expect(onBackpackChange).toHaveBeenCalledWith([{ itemId: 'a', quantity: 1 }]);
    applySessionData(payload({ visionRange: 0 }), ctx); // zero is a real value
    expect(onVisionChange).toHaveBeenCalledWith(0);
  });

  const gem = { id: 'd1', itemId: 'gem', itemName: 'Gem', iconUrl: null, quantity: 1, position: { x: 1, y: 1 }, inGameSpriteUrl: '/gem.png' } as any;

  it('stores and draws dropped items only when the tick carries them, described by the cached definition', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    ctx.entityDefs.applySpawned({ droppedItems: [gem] });
    applySessionData(payload(), ctx);
    expect(MiningEntityRenderer.updateDroppedItems).not.toHaveBeenCalled();
    applySessionData(payload({ droppedItems: [{ id: 'd1', position: { x: 2, y: 3 } }] }), ctx);
    expect(world.droppedItemsRef.current).toEqual([{ ...gem, position: { x: 2, y: 3 } }]);
    expect(MiningEntityRenderer.updateDroppedItems).toHaveBeenCalledTimes(1);
    applySessionData(payload({ droppedItems: [] }), ctx); // an empty list clears them
    expect(world.droppedItemsRef.current).toEqual([]);
    expect(MiningEntityRenderer.updateDroppedItems).toHaveBeenCalledTimes(2);
  });

  it('does not draw dropped items before the containers exist', () => {
    const world = makeWorld();
    const ctx = makeCtx(world, { containersReady: false });
    ctx.entityDefs.applySpawned({ droppedItems: [gem] });
    applySessionData(payload({ droppedItems: [{ id: 'd1', position: { x: 1, y: 1 } }] }), ctx);
    expect(world.droppedItemsRef.current).toHaveLength(1);
    expect(MiningEntityRenderer.updateDroppedItems).not.toHaveBeenCalled();
  });
});

describe('applyEffects', () => {
  it('hands gunshots and explosions to their visual managers, and remembers explosions', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    const gunshots = [{ id: 'g' } as any];
    const explosions = [{ id: 'e', position: { x: 4, y: 4 }, radius: 3 } as any];
    applyEffects(payload({ gunshots, explosions }), ctx);
    expect(world.projectileVisualManagerRef.current.handleGunshotEvents).toHaveBeenCalledWith(
      gunshots, 'me', world.particleEngineRef.current, world.lightingEngineRef.current, ctx.soundManager, TILE_SIZE
    );
    expect(world.dynamiteVisualManagerRef.current.handleExplosionEvents).toHaveBeenCalledTimes(1);
    expect(ctx.effects.recentExplosions).toEqual([expect.objectContaining({ x: 4, y: 4, radius: 3 })]);
  });

  describe('block hits', () => {
    const hit = (over = {}) => ({ x: 2, y: 3, tileType: MiningTileType.DIRT, ...over }) as any;

    it('plays the block sound and spawns chips, rate limited per tile', () => {
      const world = makeWorld();
      world.blockSoundsRef.current.set(MiningTileType.DIRT, '/dirt.mp3');
      const ctx = makeCtx(world);
      applyEffects(payload({ blockHits: [hit()] }), ctx);
      applyEffects(payload({ blockHits: [hit()] }), ctx); // immediately again: too soon
      expect((ctx.soundManager as any).playPositionalSfx).toHaveBeenCalledTimes(1);
      expect(world.particleEngineRef.current.spawnBurst).toHaveBeenCalledTimes(1);
      expect(world.particleEngineRef.current.spawnBurst).toHaveBeenCalledWith(DEFAULT_PARTICLE_EFFECTS.block_dirt_chip, expect.anything());
    });

    it('uses mineral chips for minerals and the block\'s own particle config when it has one', () => {
      const world = makeWorld();
      const ctx = makeCtx(world);
      applyEffects(payload({ blockHits: [hit({ tileType: MiningTileType.MINERAL })] }), ctx);
      expect(world.particleEngineRef.current.spawnBurst).toHaveBeenCalledWith(DEFAULT_PARTICLE_EFFECTS.block_mineral_chip, expect.anything());

      const config = { custom: true };
      world.blockParticleConfigsRef.current.set(MiningTileType.ROCK, config);
      applyEffects(payload({ blockHits: [hit({ x: 5, tileType: MiningTileType.ROCK })] }), ctx);
      expect(world.particleEngineRef.current.spawnBurst).toHaveBeenCalledWith(config, expect.anything());
    });

    it('plays my weapon\'s swing sound only for the tile I am mining', () => {
      const world = makeWorld({ weaponSoundUrlRef: ref('/swing.mp3'), miningTargetRef: ref({ x: 2, y: 3 }), isMiningRef: ref(true) });
      const ctx = makeCtx(world);
      applyEffects(payload({ isMining: true, blockHits: [hit({ x: 9, y: 9 })] }), ctx);
      expect((ctx.soundManager as any).playSfx).not.toHaveBeenCalled();
      applyEffects(payload({ isMining: true, blockHits: [hit()] }), ctx);
      expect((ctx.soundManager as any).playSfx).toHaveBeenCalledWith('/swing.mp3');
    });
  });
});

describe('applyTileUpdates', () => {
  const reveal = (over = {}) => ({ x: 1, y: 1, type: MiningTileType.EMPTY, ...over }) as any;

  it('does nothing without revealed tiles', () => {
    const world = makeWorld();
    applyTileUpdates(payload(), makeCtx(world));
    expect(MiningTileRenderer.updateRevealedTiles).not.toHaveBeenCalled();
    expect(world.mouseControllerRef.current.setGrid).not.toHaveBeenCalled();
  });

  it('updates the grid, redraws the tiles and hands the grid to the mouse', () => {
    const world = makeWorld();
    applyTileUpdates(payload({ revealedTiles: [reveal({ type: MiningTileType.ROCK, damageStage: 2 })] }), makeCtx(world));
    const tile = world.gridRef.current[1][1];
    expect(tile.type).toBe(MiningTileType.ROCK);
    expect(tile.revealed).toBe(true);
    expect(MiningTileRenderer.updateRevealedTiles).toHaveBeenCalledTimes(1);
    expect(world.mouseControllerRef.current.setGrid).toHaveBeenCalledWith(world.gridRef.current);
    expect(world.lightingEngineRef.current.updateGrid).toHaveBeenCalled();
  });

  it('keeps the damage stage only for tiles that can be damaged', () => {
    const world = makeWorld();
    applyTileUpdates(payload({ revealedTiles: [reveal({ type: MiningTileType.DIRT, damageStage: 3 }), reveal({ x: 2, type: MiningTileType.ROCK, damageStage: 3 })] }), makeCtx(world));
    expect(world.gridRef.current[1][1].damageStage).toBe(3);
    expect(world.gridRef.current[1][2].damageStage).toBe(0);
  });

  it('crumbles a block that broke, but a blast gets one explosion instead of a crumble per block', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    applyTileUpdates(payload({ revealedTiles: [reveal()] }), ctx);
    expect(world.particleEngineRef.current.spawnBurst).toHaveBeenCalledWith(DEFAULT_PARTICLE_EFFECTS.block_dirt_hit, expect.anything());

    world.particleEngineRef.current.spawnBurst.mockClear();
    ctx.effects.recentExplosions.push({ x: 6.5, y: 6.5, radius: 2, time: performance.now() });
    applyTileUpdates(payload({ revealedTiles: [reveal({ x: 6, y: 6 })] }), ctx);
    expect(world.particleEngineRef.current.spawnBurst).not.toHaveBeenCalled();
  });

  it('forgets explosions after a short while', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    ctx.effects.recentExplosions.push({ x: 1, y: 1, radius: 2, time: performance.now() - 5000 });
    applyTileUpdates(payload({ revealedTiles: [reveal()] }), ctx);
    expect(ctx.effects.recentExplosions).toEqual([]);
  });

  it('lights and animates torches and chests, and removes them when the tile changes', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    applyTileUpdates(payload({ revealedTiles: [reveal({ x: 2, y: 2, type: MiningTileType.TORCH }), reveal({ x: 3, y: 3, type: MiningTileType.CHEST })] }), ctx);
    const lights = world.lightingEngineRef.current.lights;
    expect(lights.has('torch_2_2')).toBe(true);
    expect(lights.has('chest_3_3')).toBe(true);
    expect(world.torchEmittersRef.current.has('torch_2_2')).toBe(true);

    const emitter = world.torchEmittersRef.current.get('torch_2_2');
    applyTileUpdates(payload({ revealedTiles: [reveal({ x: 2, y: 2, type: MiningTileType.EMPTY })] }), ctx);
    expect(lights.has('torch_2_2')).toBe(false);
    expect(world.torchEmittersRef.current.has('torch_2_2')).toBe(false);
    expect(emitter.destroy).toHaveBeenCalled();
  });

  it('starts an ambient emitter for blocks with a particle config, and stops it when they go', () => {
    const world = makeWorld();
    world.blockParticleConfigsRef.current.set(MiningTileType.MINERAL, { sparkle: true });
    const ctx = makeCtx(world);
    applyTileUpdates(payload({ revealedTiles: [reveal({ x: 4, y: 4, type: MiningTileType.MINERAL })] }), ctx);
    expect(world.blockEmittersRef.current.has('block_effect_4_4')).toBe(true);
    const emitter = world.blockEmittersRef.current.get('block_effect_4_4');
    applyTileUpdates(payload({ revealedTiles: [reveal({ x: 4, y: 4, type: MiningTileType.EMPTY })] }), ctx);
    expect(world.blockEmittersRef.current.has('block_effect_4_4')).toBe(false);
    expect(emitter.destroy).toHaveBeenCalled();
  });

  it('skips drawing before the containers exist but still updates the grid', () => {
    const world = makeWorld();
    applyTileUpdates(payload({ revealedTiles: [reveal({ type: MiningTileType.ROCK })] }), makeCtx(world, { containersReady: false }));
    expect(world.gridRef.current[1][1].type).toBe(MiningTileType.ROCK);
    expect(MiningTileRenderer.updateRevealedTiles).not.toHaveBeenCalled();
  });
});

describe('getHitPosition', () => {
  it('is the tile centre unless the cursor is on that tile', () => {
    const world = makeWorld();
    expect(getHitPosition(world, 2, 3)).toEqual({ x: 2.5 * TILE_SIZE, y: 3.5 * TILE_SIZE });
  });

  it('follows the cursor, clamped inside the tile, when the player is aiming at it', () => {
    const world = makeWorld();
    world.mouseControllerRef.current.getHoveredTile = () => ({ x: 2, y: 3 });
    world.mouseControllerRef.current.getWorldMousePosition = () => ({ x: 2 * TILE_SIZE + 10, y: 99999 });
    expect(getHitPosition(world, 2, 3)).toEqual({ x: 2 * TILE_SIZE + 10, y: 4 * TILE_SIZE - 2 });
  });
});

describe('handleStateTick', () => {
  it('runs the sections in order so explosions are known before tiles are handled', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    const order: string[] = [];
    world.dynamiteVisualManagerRef.current.handleExplosionEvents = vi.fn(() => order.push('explosion'));
    (MiningTileRenderer.updateRevealedTiles as any).mockImplementation(() => order.push('tiles'));
    handleStateTick(
      payload({
        explosions: [{ id: 'e', position: { x: 1.5, y: 1.5 }, radius: 3 } as any],
        revealedTiles: [{ x: 1, y: 1, type: MiningTileType.EMPTY } as any],
      }),
      ctx
    );
    expect(order).toEqual(['explosion', 'tiles']);
    // the blast also kept the broken block from getting its own crumble
    expect(world.particleEngineRef.current.spawnBurst).not.toHaveBeenCalled();
  });
});
