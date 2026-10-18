import { describe, it, expect, vi, beforeEach } from 'vitest';
import { miningProfiler } from '../utils/MiningProfiler';
import { MiningTileType, DEFAULT_PARTICLE_EFFECTS, FireField, getTileFootprint, pieceCells, pieceCentreCell, type MiningStateTickPayload } from '@mine-me/shared';
import {
  applyEffects,
  applyEntities,
  applyBurning,
  applyFluidSounds,
  applyItemPickupSounds,
  applyFireUpdates,
  applyFluidUpdates,
  applyGasUpdates,
  applyGasSounds,
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
    weaponSoundVolumeRef: ref(1),
    lastWeaponSoundTimeRef: ref(0),
    tilesContainerRef: ref({}),
    fluidRendererRef: ref(null),
    fireFieldRef: ref(null),
    burningBodiesRef: ref(null),
    fluidSoundsRef: ref(null),
    droppedItemsContainerRef: ref({}),
    droppedSpritesMap: ref(new Map()),
    blockTexturesRef: ref(new Map()),
    tileGraphicsMap: ref(new Map()),
    tileSpritesMap: ref(new Map()),
    blockParticleConfigsRef: ref(new Map()),
    blockSoundsRef: ref(new Map<number, { url: string; volume: number }>()),
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

    const onWeaponAmmo = vi.fn();
    applySessionData(payload({ weaponAmmo: { current: 0, max: 6, isReloading: true } }), makeCtx(world, { onWeaponAmmo }));
    expect(onWeaponAmmo).toHaveBeenCalledWith({ current: 0, max: 6, isReloading: true });
    const unarmed = vi.fn();
    applySessionData(payload({ weaponAmmo: { current: 0, max: 6, isReloading: true } }), makeCtx(world, { hasEquippedWeapon: false, onWeaponAmmo: unarmed }));
    expect(unarmed).not.toHaveBeenCalled();
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
      world.blockSoundsRef.current.set(MiningTileType.DIRT, { url: '/dirt.mp3', volume: 1 });
      const ctx = makeCtx(world);
      applyEffects(payload({ blockHits: [hit()] }), ctx);
      applyEffects(payload({ blockHits: [hit()] }), ctx); // immediately again: too soon
      expect((ctx.soundManager as any).playPositionalSfx).toHaveBeenCalledTimes(1);
      expect(world.particleEngineRef.current.spawnBurst).toHaveBeenCalledTimes(1);
      expect(world.particleEngineRef.current.spawnBurst).toHaveBeenCalledWith(DEFAULT_PARTICLE_EFFECTS.block_dirt_chip, expect.anything());
    });

    it('plays the block sound at the volume set on that block, and the swing sound at the weapon\'s volume', () => {
      const world = makeWorld({
        weaponSoundUrlRef: ref('/swing.mp3'), weaponSoundVolumeRef: ref(0.25),
        miningTargetRef: ref({ x: 2, y: 3 }), isMiningRef: ref(true),
      });
      world.blockSoundsRef.current.set(MiningTileType.DIRT, { url: '/dirt.mp3', volume: 0.6 });
      const ctx = makeCtx(world);
      applyEffects(payload({ blockHits: [hit()] }), ctx);
      expect((ctx.soundManager as any).playSfx).toHaveBeenCalledWith('/swing.mp3', { volumeScale: 0.25 });
      expect((ctx.soundManager as any).playPositionalSfx).toHaveBeenCalledWith(
        '/dirt.mp3', { x: 2.5, y: 3.5 }, expect.objectContaining({ volumeScale: 0.6 })
      );
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
      expect((ctx.soundManager as any).playSfx).toHaveBeenCalledWith('/swing.mp3', { volumeScale: 1 });
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

  it('a torch piece lights the cavern once, from its middle cell, and goes out when the piece is cleared', () => {
    const world = makeWorld();
    const ctx = makeCtx(world);
    const { width, height } = getTileFootprint(MiningTileType.TORCH);
    // The client keeps its own grid; the piece's cells arrive as separate tile updates
    const cells = pieceCells({ x: 2, y: 2 }, { width, height });
    applyTileUpdates(payload({ revealedTiles: cells.map((c) => reveal({ x: c.x, y: c.y, type: MiningTileType.TORCH, piece: c.offset })) }), ctx);
    const lights = world.lightingEngineRef.current.lights;
    const centre = pieceCentreCell({ x: 2, y: 2 }, { width, height });
    expect([...lights.keys()].filter((k: string) => k.startsWith('torch_'))).toEqual([`torch_${centre.x}_${centre.y}`]);
    expect(world.torchEmittersRef.current.size).toBe(1);

    applyTileUpdates(payload({ revealedTiles: cells.map((c) => reveal({ x: c.x, y: c.y, type: MiningTileType.EMPTY })) }), ctx);
    expect([...lights.keys()].filter((k: string) => k.startsWith('torch_'))).toEqual([]);
    expect(world.torchEmittersRef.current.size).toBe(0);
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

describe('handleStateTick profiling', () => {
  const perf = { windowTicks: 60, budgetMs: 33, tickMs: { avg: 5, p95: 6, max: 7 }, loadPercent: 15, loopGapMs: { avg: 33, max: 40 }, steps: [], droppedTicks: 0, counts: {}, payloadBytes: 1 };

  it('times each tick, how far apart they arrive, and keeps the server\'s own summary', () => {
    miningProfiler.setEnabled(true);
    miningProfiler.reset();
    try {
      const ctx = makeCtx(makeWorld());
      handleStateTick(payload(), ctx);
      handleStateTick(payload({ perf }), ctx);
      const stats = miningProfiler.getStats();
      expect(stats.events.find((e) => e.name === 'Server Tick Handling')?.count).toBe(2);
      expect(stats.events.find((e) => e.name === 'Server Tick Interval')?.count).toBeGreaterThanOrEqual(1);
      expect(stats.server).toEqual(perf);
    } finally {
      miningProfiler.setEnabled(false);
    }
  });
});

describe('applyFluidUpdates', () => {
  const makeRenderer = () => ({ apply: vi.fn(), render: vi.fn(), onTileChanged: vi.fn() });
  const tick = (extra: Partial<MiningStateTickPayload>) => ({ tick: 1, ...extra }) as MiningStateTickPayload;

  it('does nothing before the fluid renderer exists', () => {
    expect(() => applyFluidUpdates(tick({ fluidCells: [[1, 1, 1, 64]] }), makeCtx(makeWorld()))).not.toThrow();
  });

  it('applies the tick\'s changed cells eased (the fluid flows to them) and redraws', () => {
    const renderer = makeRenderer();
    applyFluidUpdates(tick({ fluidCells: [[1, 2, 1, 64], [3, 4, 0, 0]] }), makeCtx(makeWorld({ fluidRendererRef: ref(renderer) })));
    expect(renderer.apply).toHaveBeenCalledWith([[1, 2, 1, 64], [3, 4, 0, 0]], true);
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('shows the fluid in newly revealed tiles at once, then eases to the tick\'s changes (so a later change wins)', () => {
    const renderer = makeRenderer();
    applyFluidUpdates(
      tick({
        revealedTiles: [
          { x: 5, y: 5, type: MiningTileType.EMPTY, fluid: [1, 128] },
          { x: 6, y: 5, type: MiningTileType.EMPTY },
        ],
        fluidCells: [[5, 5, 1, 100]],
      }),
      makeCtx(makeWorld({ fluidRendererRef: ref(renderer) }))
    );
    expect(renderer.apply.mock.calls).toEqual([[[[5, 5, 1, 128]]], [[[5, 5, 1, 100]], true]]);
  });

  it('tells the renderer about every tile that changed, so the fluid beside a mined block is redrawn', () => {
    const renderer = makeRenderer();
    applyFluidUpdates(
      tick({ revealedTiles: [{ x: 5, y: 5, type: MiningTileType.EMPTY }, { x: 7, y: 2, type: MiningTileType.EMPTY, fluid: [1, 64] }] }),
      makeCtx(makeWorld({ fluidRendererRef: ref(renderer) }))
    );
    expect(renderer.onTileChanged.mock.calls).toEqual([[5, 5], [7, 2]]);
  });

  it('still redraws (cheaply) on a tick with no fluid news, and does not call apply', () => {
    const renderer = makeRenderer();
    applyFluidUpdates(tick({}), makeCtx(makeWorld({ fluidRendererRef: ref(renderer) })));
    expect(renderer.apply).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('runs as part of a full state tick', () => {
    const renderer = makeRenderer();
    const world = makeWorld({ fluidRendererRef: ref(renderer) });
    handleStateTick(payload({ fluidCells: [[1, 1, 1, 10]] }), makeCtx(world));
    expect(renderer.apply).toHaveBeenCalledWith([[1, 1, 1, 10]], true);
  });
});

describe('applyGasUpdates', () => {
  const makeRenderer = () => ({ apply: vi.fn(), render: vi.fn(), playExplosions: vi.fn() });
  const tick = (extra: Partial<MiningStateTickPayload>) => ({ tick: 1, ...extra }) as MiningStateTickPayload;

  it('does nothing before the gas renderer exists', () => {
    expect(() => applyGasUpdates(tick({ gasCells: [[1, 1, 1, 64]] }), makeCtx(makeWorld()))).not.toThrow();
  });

  it('applies the tick\'s changed cells eased (the cloud thickens and thins) and redraws', () => {
    const renderer = makeRenderer();
    applyGasUpdates(tick({ gasCells: [[1, 2, 1, 64], [3, 4, 0, 0]] }), makeCtx(makeWorld({ gasRendererRef: ref(renderer) })));
    expect(renderer.apply).toHaveBeenCalledWith([[1, 2, 1, 64], [3, 4, 0, 0]], true);
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('shows the gas in newly revealed tiles at once, then eases to the tick\'s changes (so a later change wins)', () => {
    const renderer = makeRenderer();
    applyGasUpdates(
      tick({
        revealedTiles: [
          { x: 5, y: 5, type: MiningTileType.EMPTY, gas: [1, 200] },
          { x: 6, y: 5, type: MiningTileType.EMPTY },
        ],
        gasCells: [[5, 5, 1, 100]],
      }),
      makeCtx(makeWorld({ gasRendererRef: ref(renderer) }))
    );
    expect(renderer.apply.mock.calls).toEqual([[[[5, 5, 1, 200]]], [[[5, 5, 1, 100]], true]]);
  });

  it('still redraws (cheaply) on a tick with no gas news, and does not call apply', () => {
    const renderer = makeRenderer();
    applyGasUpdates(tick({}), makeCtx(makeWorld({ gasRendererRef: ref(renderer) })));
    expect(renderer.apply).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('plays the cells of gas that went off this tick, after the gas is up to date, and only when there are some', () => {
    const renderer = makeRenderer();
    const order: string[] = [];
    renderer.render.mockImplementation(() => order.push('render'));
    renderer.playExplosions.mockImplementation(() => order.push('play'));
    applyGasUpdates(tick({ gasExplosions: [[4, 5, 1], [5, 5, 1]] }), makeCtx(makeWorld({ gasRendererRef: ref(renderer) })));
    expect(renderer.playExplosions).toHaveBeenCalledWith([[4, 5, 1], [5, 5, 1]]);
    expect(order).toEqual(['render', 'play']);
    renderer.playExplosions.mockClear();
    applyGasUpdates(tick({}), makeCtx(makeWorld({ gasRendererRef: ref(renderer) })));
    expect(renderer.playExplosions).not.toHaveBeenCalled();
  });

  it('runs as part of a full state tick', () => {
    const renderer = makeRenderer();
    handleStateTick(payload({ gasCells: [[1, 1, 1, 10]] }), makeCtx(makeWorld({ gasRendererRef: ref(renderer) })));
    expect(renderer.apply).toHaveBeenCalledWith([[1, 1, 1, 10]], true);
  });
});

describe('applyGasSounds', () => {
  const makeSounds = () => ({ onEvents: vi.fn(), onExplosions: vi.fn() });
  const tick = (extra: Partial<MiningStateTickPayload>) => ({ tick: 1, ...extra }) as MiningStateTickPayload;

  it('does nothing before the gas sounds exist', () => {
    expect(() => applyGasSounds(tick({ gasEvents: [{ kind: 'enter', gasId: 1, x: 1, y: 1 }] }), makeCtx(makeWorld()))).not.toThrow();
  });

  it('hands the tick\'s gas events and detonated cells to the sounds, and nothing when there are none', () => {
    const sounds = makeSounds();
    const events = [{ kind: 'vent', gasId: 1, x: 4.5, y: 2.5 }] as const;
    applyGasSounds(tick({ gasEvents: [...events], gasExplosions: [[4, 5, 1]] }), makeCtx(makeWorld({ gasSoundsRef: ref(sounds) })));
    expect(sounds.onEvents).toHaveBeenCalledWith(events);
    expect(sounds.onExplosions).toHaveBeenCalledWith([[4, 5, 1]], expect.any(Number));
    sounds.onEvents.mockClear();
    sounds.onExplosions.mockClear();
    applyGasSounds(tick({}), makeCtx(makeWorld({ gasSoundsRef: ref(sounds) })));
    expect(sounds.onEvents).not.toHaveBeenCalled();
    expect(sounds.onExplosions).not.toHaveBeenCalled();
  });

  it('runs as part of a full state tick', () => {
    const sounds = makeSounds();
    handleStateTick(payload({ gasEvents: [{ kind: 'ignite', gasId: 1, x: 1, y: 1 }] }), makeCtx(makeWorld({ gasSoundsRef: ref(sounds) })));
    expect(sounds.onEvents).toHaveBeenCalledTimes(1);
  });
});

describe('applyFireUpdates', () => {
  const tick = (extra: Partial<MiningStateTickPayload>) => ({ tick: 1, ...extra }) as MiningStateTickPayload;
  const makeField = () => new FireField(10, 10);

  it('does nothing before the fire field exists', () => {
    expect(() => applyFireUpdates(tick({ fireCells: [[1, 1, 1]] }), makeCtx(makeWorld()))).not.toThrow();
  });

  it('applies fires starting and stopping', () => {
    const field = makeField();
    const ctx = makeCtx(makeWorld({ fireFieldRef: ref(field) }));
    applyFireUpdates(tick({ fireCells: [[1, 2, 1], [3, 4, 1]] }), ctx);
    expect(field.isBurning(1, 2)).toBe(true);
    expect(field.burningCount).toBe(2);
    applyFireUpdates(tick({ fireCells: [[1, 2, 0]] }), ctx);
    expect(field.isBurning(1, 2)).toBe(false);
  });

  it('takes fire in newly revealed tiles, and lets a later change in the same tick win', () => {
    const field = makeField();
    applyFireUpdates(
      tick({
        revealedTiles: [
          { x: 5, y: 5, type: MiningTileType.EMPTY, fire: 1 },
          { x: 6, y: 5, type: MiningTileType.EMPTY },
        ],
        fireCells: [[5, 5, 0]],
      }),
      makeCtx(makeWorld({ fireFieldRef: ref(field) }))
    );
    expect(field.isBurning(5, 5)).toBe(false);
    expect(field.isBurning(6, 5)).toBe(false);
    const field2 = makeField();
    applyFireUpdates(tick({ revealedTiles: [{ x: 5, y: 5, type: MiningTileType.EMPTY, fire: 1 }] }), makeCtx(makeWorld({ fireFieldRef: ref(field2) })));
    expect(field2.isBurning(5, 5)).toBe(true);
  });

  it('runs as part of a full state tick', () => {
    const field = makeField();
    handleStateTick(payload({ fireCells: [[2, 2, 1]] }), makeCtx(makeWorld({ fireFieldRef: ref(field) })));
    expect(field.isBurning(2, 2)).toBe(true);
  });
});

describe('applyBurning', () => {
  const tick = (extra: Partial<MiningStateTickPayload>) => ({ tick: 1, position: { x: 3, y: 4 }, ...extra }) as MiningStateTickPayload;
  const mobAt = (id: string, burning?: boolean) => ({ id, position: { x: 10, y: 11 }, burning }) as any;

  it('does nothing before the burning effect exists', () => {
    expect(() => applyBurning(tick({ burning: true }), makeCtx(makeWorld()))).not.toThrow();
  });

  it('puts the effect on the local player when they are burning', () => {
    const burning = { sync: vi.fn() };
    applyBurning(tick({ burning: true }), makeCtx(makeWorld({ burningBodiesRef: ref(burning) })));
    expect(burning.sync).toHaveBeenCalledWith([{ id: 'self', x: 3, y: 4 }]);
  });

  it('puts it on burning mobs and other players too, and only on those burning', () => {
    const burning = { sync: vi.fn() };
    applyBurning(
      tick({
        mobs: [mobAt('m1', true), mobAt('m2')],
        otherPlayers: [{ characterId: 'p1', position: { x: 7, y: 8 }, burning: true } as any, { characterId: 'p2', position: { x: 1, y: 1 } } as any],
      }),
      makeCtx(makeWorld({ burningBodiesRef: ref(burning) }))
    );
    expect(burning.sync).toHaveBeenCalledWith([
      { id: 'mob:m1', x: 10, y: 11 },
      { id: 'player:p1', x: 7, y: 8 },
    ]);
  });

  it('tells it nobody is burning when that is so (so the effect can stop)', () => {
    const burning = { sync: vi.fn() };
    applyBurning(tick({}), makeCtx(makeWorld({ burningBodiesRef: ref(burning) })));
    expect(burning.sync).toHaveBeenCalledWith([]);
  });

  it('runs as part of a full state tick', () => {
    const burning = { sync: vi.fn() };
    handleStateTick(payload({ burning: true }), makeCtx(makeWorld({ burningBodiesRef: ref(burning) })));
    expect(burning.sync).toHaveBeenCalled();
  });
});

describe('applyFluidSounds', () => {
  const tick = (extra: Partial<MiningStateTickPayload>) => ({ tick: 1, ...extra }) as MiningStateTickPayload;
  const makeSounds = () => ({ onSplashes: vi.fn(), onFireChanges: vi.fn() });

  it('does nothing before the fluid sounds exist', () => {
    expect(() => applyFluidSounds(tick({ fluidSplashes: [{ kind: 'enter', fluidId: 1, x: 1, y: 1 }] }), makeCtx(makeWorld()))).not.toThrow();
  });

  it('hands splashes and cells that caught fire to the sounds', () => {
    const sounds = makeSounds();
    const splashes = [{ kind: 'enter' as const, fluidId: 1, x: 1, y: 2 }];
    const fire: [number, number, 0 | 1][] = [[3, 4, 1]];
    applyFluidSounds(tick({ fluidSplashes: splashes, fireCells: fire }), makeCtx(makeWorld({ fluidSoundsRef: ref(sounds) })));
    expect(sounds.onSplashes).toHaveBeenCalledWith(splashes);
    expect(sounds.onFireChanges).toHaveBeenCalledWith(fire, expect.any(Number));
  });

  it('does not call them when there is nothing to play', () => {
    const sounds = makeSounds();
    applyFluidSounds(tick({}), makeCtx(makeWorld({ fluidSoundsRef: ref(sounds) })));
    applyFluidSounds(tick({ fluidSplashes: [], fireCells: [] }), makeCtx(makeWorld({ fluidSoundsRef: ref(sounds) })));
    expect(sounds.onSplashes).not.toHaveBeenCalled();
    expect(sounds.onFireChanges).not.toHaveBeenCalled();
  });

  it('runs as part of a full state tick, after the fire field is updated', () => {
    const sounds = makeSounds();
    const field = new FireField(10, 10);
    sounds.onFireChanges.mockImplementation(() => expect(field.isBurning(2, 2)).toBe(true));
    handleStateTick(payload({ fireCells: [[2, 2, 1]] }), makeCtx(makeWorld({ fluidSoundsRef: ref(sounds), fireFieldRef: ref(field) })));
    expect(sounds.onFireChanges).toHaveBeenCalled();
  });
});

describe('applyItemPickupSounds', () => {
  const tick = (extra: Partial<MiningStateTickPayload>) => ({ tick: 1, ...extra }) as MiningStateTickPayload;

  it('hands pickups to the character sounds, and does nothing without them', () => {
    const onPickups = vi.fn();
    const pickups = [{ x: 1, y: 2 }];
    applyItemPickupSounds(tick({ itemPickups: pickups }), makeCtx(makeWorld({ characterSoundsRef: ref({ onPickups }) })));
    expect(onPickups).toHaveBeenCalledWith(pickups);
    applyItemPickupSounds(tick({}), makeCtx(makeWorld({ characterSoundsRef: ref({ onPickups }) })));
    expect(onPickups).toHaveBeenCalledTimes(1);
    expect(() => applyItemPickupSounds(tick({ itemPickups: pickups }), makeCtx(makeWorld()))).not.toThrow();
  });
});
