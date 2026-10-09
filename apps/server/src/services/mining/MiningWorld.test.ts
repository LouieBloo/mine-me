import { describe, it, expect, vi, afterEach } from 'vitest';
import { MINING_CONFIG, MiningRigidWorld, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningDamageSystem } from './MiningDamageSystem';
import { MiningDataManager } from './subsystems/MiningDataManager';
import { MiningDropSubsystem } from './subsystems/MiningDropSubsystem';
import { MiningRockSubsystem } from './subsystems/MiningRockSubsystem';
import { MiningBlockSubsystem } from './subsystems/MiningBlockSubsystem';
import type { MiningWorld } from './MiningWorld';

const emptyGrid = () =>
  Array.from({ length: MINING_CONFIG.GRID_HEIGHT }, () =>
    Array.from({ length: MINING_CONFIG.GRID_WIDTH }, () => ({ type: MiningTileType.EMPTY, revealed: true }))
  ) as any;

/** A bare-bones world: only what the subsystem under test touches, everything else is absent. */
const stubWorld = (over: Record<string, unknown> = {}): MiningWorld =>
  ({
    grid: emptyGrid(),
    rigidWorld: new MiningRigidWorld({ width: MINING_CONFIG.GRID_WIDTH, height: MINING_CONFIG.GRID_HEIGHT }),
    data: MiningDataManager.getInstance(),
    players: new Map(),
    simTime: 0,
    pushTileUpdate: vi.fn(),
    ...over,
  }) as unknown as MiningWorld;

describe('subsystems depend only on the world they are given', () => {
  afterEach(() => vi.restoreAllMocks());

  it('drops run against a stand-in world (no engine, no other subsystems)', () => {
    const drops = new MiningDropSubsystem(stubWorld());
    drops.spawnDrops([{ itemId: 'x', quantity: 2 }], { x: 3, y: 4 });
    expect(drops.droppedItems).toEqual([expect.objectContaining({ itemId: 'x', quantity: 2, position: { x: 3, y: 4 } })]);
    expect(drops.activeItemBodies.size).toBe(1);
  });

  it('falling rocks run against a stand-in world and report tile changes through it', () => {
    const world = stubWorld();
    world.grid[10][5] = { type: MiningTileType.ROCK, revealed: true };
    const rocks = new MiningRockSubsystem(world);

    rocks.checkAndTriggerFallingRocks(5, 12); // the tile below the rock was cleared
    expect(rocks.activeRocks).toHaveLength(1);
    expect(world.grid[10][5].type).toBe(MiningTileType.EMPTY);
    expect(world.pushTileUpdate).toHaveBeenCalledWith({ x: 5, y: 10, type: MiningTileType.EMPTY, damageStage: 0 });
  });

  it('torch placement runs against a stand-in world', () => {
    const world = stubWorld();
    const blocks = new MiningBlockSubsystem(world);
    const player: any = { playerBody: { position: { x: 10.5, y: 5.5 } } };

    expect(blocks.validateTorchPlacement(player, { x: 11, y: 5 })).toBe(true);
    expect(blocks.validateTorchPlacement(player, { x: 30, y: 5 })).toBe(false); // out of reach
    expect(blocks.placeTorch(player, { x: 11, y: 5 })).toBe(true);
    expect(world.grid[5][11].type).toBe(MiningTileType.TORCH);
    expect(world.pushTileUpdate).toHaveBeenCalledWith({ x: 11, y: 5, type: MiningTileType.TORCH, damageStage: 0 });
  });

  it('tile damage runs against a stand-in world: cracks announce a stage, breaking is delegated', () => {
    const completeMiningBlock = vi.fn();
    const world = stubWorld({ blocks: { completeMiningBlock } });
    world.grid[8][8] = { type: MiningTileType.DIRT, revealed: true };
    const damage = new MiningDamageSystem(world);
    const max = world.data.getBlockMaxHealth(MiningTileType.DIRT);

    const hit = damage.damageTile(8, 8, { amount: max * 0.6, type: 'mining', source: { kind: 'player' } });
    expect(hit).toMatchObject({ applied: true, destroyed: false });
    expect(world.pushTileUpdate).toHaveBeenCalledTimes(1);
    expect(completeMiningBlock).not.toHaveBeenCalled();

    const kill = damage.damageTile(8, 8, { amount: max, type: 'mining', source: { kind: 'player' } }, [] as any);
    expect(kill).toMatchObject({ applied: true, destroyed: true });
    expect(completeMiningBlock).toHaveBeenCalledWith({ x: 8, y: 8 }, [], { dropItems: true });
  });

  it('subsystems read the world lazily, so they always see current state', () => {
    const world: any = stubWorld();
    const rocks = new MiningRockSubsystem(world);
    const replacement = emptyGrid();
    replacement[3][3] = { type: MiningTileType.ROCK, revealed: true };
    world.grid = replacement; // the room swaps in a different grid
    rocks.checkAndTriggerFallingRocks(3, 5);
    expect(rocks.activeRocks).toHaveLength(1);
  });
});

describe('the engine hands every subsystem the same world', () => {
  const engine = new MiningGameEngine({ characterId: 'w', cityId: 'c', seed: 1, socket: { connected: true, emit: vi.fn() } as any, mapConfig: { mobSpawnCount: 0 } });

  it('is one shared object', () => {
    const worlds = [
      engine.playerManager, engine.blockSubsystem, engine.dropSubsystem, engine.rockSubsystem,
      engine.explosiveSubsystem, engine.projectileSubsystem, engine.mobSubsystem, engine.damageSystem,
    ].map((s: any) => s.world);
    expect(worlds.every((w) => w === worlds[0])).toBe(true);
  });

  it('exposes the room\'s current collaborators and state', () => {
    const world = (engine.dropSubsystem as any).world as MiningWorld;
    expect(world.grid).toBe(engine.grid);
    expect(world.rigidWorld).toBe(engine.rigidWorld);
    expect(world.data).toBe(engine.dataManager);
    expect(world.players).toBe(engine.players);
    expect(world.drops).toBe(engine.dropSubsystem);
    expect(world.blocks).toBe(engine.blockSubsystem);
    expect(world.rocks).toBe(engine.rockSubsystem);
    expect(world.mobs).toBe(engine.mobSubsystem);
    expect(world.damage).toBe(engine.damageSystem);
    expect(world.explosives).toBe(engine.explosiveSubsystem);
    expect(world.projectiles).toBe(engine.projectileSubsystem);
    expect(world.playerManager).toBe(engine.playerManager);
  });

  it('simTime follows the engine\'s simulated clock', () => {
    const e = new MiningGameEngine({ characterId: 'w2', cityId: 'c', seed: 1, socket: { connected: true, emit: vi.fn() } as any, mapConfig: { mobSpawnCount: 0 } });
    const world = (e.dropSubsystem as any).world as MiningWorld;
    expect(world.simTime).toBe(0);
    e.advance(MiningGameEngine.TICK_SECONDS * 3);
    expect(world.simTime).toBeCloseTo(MiningGameEngine.TICK_SECONDS * 3);
  });

  it('pushTileUpdate reaches clients in the next tick', () => {
    const sent: any[] = [];
    const e = new MiningGameEngine({ characterId: 'w3', cityId: 'c', seed: 1, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: (n: string, p: any) => n === 'mining_state_tick' && sent.push(p) } as any });
    (e.dropSubsystem as any).world.pushTileUpdate({ x: 1, y: 2, type: MiningTileType.TORCH, damageStage: 0 });
    (e as any).tick(1 / 30);
    expect(sent[sent.length - 1].revealedTiles).toEqual(expect.arrayContaining([{ x: 1, y: 2, type: MiningTileType.TORCH, damageStage: 0 }]));
  });
});

describe('throwDynamite takes a request object', () => {
  const make = () => {
    const e = new MiningGameEngine({ characterId: 'a', cityId: 'c', seed: 1, socket: { connected: true, emit: vi.fn() } as any, mapConfig: { mobSpawnCount: 0 } });
    return e;
  };

  it('needs only a target; everything else comes from the item data or defaults', () => {
    const e = make();
    expect(e.throwDynamite('a', { target: { x: 25, y: 5 } })).toBe(true);
    const d = e.activeDynamites[0];
    expect(d.ownerId).toBe('a');
    expect(d.fuseRemainingSeconds).toBeGreaterThan(0);
    expect(d.itemId).toBeUndefined();
  });

  it('uses the given item, radius, sounds and physics overrides', () => {
    const e = make();
    e.throwDynamite('a', {
      target: { x: 25, y: 5 }, itemId: 'dynamite', explosionRadius: 6,
      physicsConfig: { fuseSeconds: 1.5 } as any, soundEffects: null,
    });
    const d = e.activeDynamites[0];
    expect(d).toMatchObject({ itemId: 'dynamite', explosionRadius: 6, soundEffects: null });
    expect(d.fuseRemainingSeconds).toBeCloseTo(1.5);
  });

  it('a stronger throw goes faster than a weak one', () => {
    const speed = (forceRatio: number) => {
      const e = make();
      e.throwDynamite('a', { target: { x: 40, y: 0 }, forceRatio });
      const v = e.activeDynamites[0].velocity;
      return Math.hypot(v.x, v.y);
    };
    expect(speed(1)).toBeGreaterThan(speed(0.2));
  });

  it('fails for a player who is not in the room', () => {
    expect(make().throwDynamite('ghost', { target: { x: 1, y: 1 } })).toBe(false);
  });
});

describe('dynamite explosions', () => {
  it('invalidate the fog-of-war cache of every player, not just the first (fixes a one-shot iterator bug)', () => {
    const e = new MiningGameEngine({ roomId: 'r', gameMode: 'multiplayer', cityId: 'c', seed: 1, mapConfig: { mobSpawnCount: 0 } });
    for (const id of ['p1', 'p2', 'p3']) e.addPlayer({ characterId: id, socket: { connected: true, emit: vi.fn() } as any });
    for (const p of e.players.values()) p.lastRevealGridPos = { x: 1, y: 1 };

    e.throwDynamite('p1', { target: { x: 22, y: 3 }, forceRatio: 0.1, explosionRadius: 2 });
    const d = e.activeDynamites[0];
    e.explodeDynamite(d);

    for (const p of e.players.values()) expect(p.lastRevealGridPos).toBeNull();
  });
});

describe('block drops are deterministic with a fixed random source', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rolls the configured table through the shared roller', () => {
    const original = MiningDataManager.getInstance();
    MiningDataManager.initialize({
      items: [], mobs: [],
      blocks: [{ id: 'b', typeKey: 'CHEST', health: 100, dropTable: { items: [{ itemId: 'gem', chance: 50, minQuantity: 2, maxQuantity: 4 }] } }],
    });
    try {
      const drops = new MiningDropSubsystem(stubWorld({ data: MiningDataManager.getInstance() }));
      vi.spyOn(Math, 'random').mockReturnValue(0.4); // 40 < 50: drops; quantity floor(0.4 * 3) + 2 = 3
      drops.spawnBlockDrops(2, 2, MiningTileType.CHEST);
      expect(drops.droppedItems.map((d) => [d.itemId, d.quantity])).toEqual([['gem', 3]]);

      drops.droppedItems.length = 0;
      (Math.random as any).mockReturnValue(0.6); // 60 >= 50: no drop
      drops.spawnBlockDrops(2, 2, MiningTileType.CHEST);
      expect(drops.droppedItems).toHaveLength(0);
    } finally {
      MiningDataManager.initialize({ items: original.getItems(), mobs: (original as any).mobs, blocks: [...(original as any).blocksByTypeKey.values()] });
    }
  });
});
