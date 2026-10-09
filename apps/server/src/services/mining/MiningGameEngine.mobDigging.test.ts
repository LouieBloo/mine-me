import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { giveBlockDrops } from './testHelpers';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';

describe('mob block digging uses the shared completion path', () => {
  afterEach(() => vi.restoreAllMocks());

  let sockets: Record<string, { connected: boolean; emit: ReturnType<typeof vi.fn> }>;
  let engine: MiningGameEngine;

  const mkSocket = () => ({ connected: true, emit: vi.fn() });
  const lastTick = (id: string) => {
    const ticks = sockets[id].emit.mock.calls.filter((c: any[]) => c[0] === 'mining_state_tick');
    return ticks[ticks.length - 1][1];
  };

  beforeEach(() => {
    sockets = { p1: mkSocket() };
    engine = new MiningGameEngine({
      characterId: 'p1',
      cityId: 'city',
      seed: 12345,
      socket: sockets.p1 as any,
      mapConfig: { mobSpawnCount: 0 },
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  });

  const spawnDigger = (x = 10, y = 14) => engine.spawnMob({ id: 'digger', miningSpeed: 100 }, { x, y });

  it('triggers falling rocks above a block a mob digs out', () => {
    engine.grid[15][10] = { type: MiningTileType.DIRT, revealed: true };
    engine.grid[14][10] = { type: MiningTileType.ROCK, revealed: true };
    const mob = spawnDigger(9.5, 15.5);

    engine.handleMobMining(mob, { x: 10, y: 15 }, 1.0);

    expect(engine.grid[15][10].type).toBe(MiningTileType.EMPTY);
    expect(engine.activeRocks.length).toBeGreaterThan(0);
  });

  it('never drops items when a mob digs, even from blocks with drop tables', () => {
    giveBlockDrops(engine, MiningTileType.CHEST); // this block WOULD drop for anyone but a mob
    engine.grid[15][10] = { type: MiningTileType.CHEST, revealed: true };
    const mob = spawnDigger(9.5, 15.5);

    engine.handleMobMining(mob, { x: 10, y: 15 }, 100);

    expect(engine.grid[15][10].type).toBe(MiningTileType.EMPTY);
    expect(engine.droppedItems).toHaveLength(0);
  });

  it('player mining still drops items (drops are only suppressed for mobs)', () => {
    giveBlockDrops(engine, MiningTileType.CHEST);
    engine.grid[15][10] = { type: MiningTileType.CHEST, revealed: true };
    engine.blockSubsystem.completeMiningBlock({ x: 10, y: 15 });
    expect(engine.droppedItems.length).toBeGreaterThan(0);
  });

  it('stops a player who was mining the block the mob broke', () => {
    engine.grid[15][10] = { type: MiningTileType.DIRT, revealed: true };
    const session = engine.players.get('p1')!;
    session.isMining = true;
    session.miningTarget = { x: 10, y: 15 };
    const mob = spawnDigger(9.5, 15.5);

    engine.handleMobMining(mob, { x: 10, y: 15 }, 1.0);

    expect(session.isMining).toBe(false);
    expect(session.miningTarget).toBeNull();
  });

  it('removes the tile collider and reports the break to clients', () => {
    engine.grid[15][10] = { type: MiningTileType.DIRT, revealed: true };
    const mob = spawnDigger(9.5, 15.5);

    engine.handleMobMining(mob, { x: 10, y: 15 }, 1.0);
    (engine as any).tick(1 / 30);

    const tick = lastTick('p1');
    expect(tick.revealedTiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ x: 10, y: 15, type: MiningTileType.EMPTY })])
    );
  });

  describe('dig feedback (block hits)', () => {
    const queued = () => (engine.blockSubsystem as any).pendingBlockHits as any[];

    it('batches hits at MOB_DIG_HIT_INTERVAL instead of every tick', () => {
      engine.grid[15][10] = { type: MiningTileType.MINERAL, revealed: true };
      const mob = spawnDigger(9.5, 15.5);
      mob.miningSpeed = 1; // slow so it won't finish
      const dt = 0.1;
      engine.handleMobMining(mob, { x: 10, y: 15 }, dt);
      engine.handleMobMining(mob, { x: 10, y: 15 }, dt);
      engine.handleMobMining(mob, { x: 10, y: 15 }, dt);
      expect(queued()).toHaveLength(0);
      engine.handleMobMining(mob, { x: 10, y: 15 }, dt);
      expect(queued()).toHaveLength(1);
      expect(queued()[0]).toMatchObject({ x: 10, y: 15, source: 'mob' });
      expect(queued()[0].damage).toBeGreaterThan(0);
    });

    it('flushes a final hit when the block breaks', () => {
      engine.grid[15][10] = { type: MiningTileType.DIRT, revealed: true };
      const mob = spawnDigger(9.5, 15.5);
      engine.handleMobMining(mob, { x: 10, y: 15 }, 1.0);
      expect(queued().filter((h) => h.source === 'mob')).toHaveLength(1);
    });

    it('resets batching when the mob switches blocks', () => {
      engine.grid[15][10] = { type: MiningTileType.MINERAL, revealed: true };
      engine.grid[15][11] = { type: MiningTileType.MINERAL, revealed: true };
      const mob = spawnDigger(10.5, 15.5);
      mob.miningSpeed = 1;
      engine.handleMobMining(mob, { x: 10, y: 15 }, 0.3);
      engine.handleMobMining(mob, { x: 11, y: 15 }, 0.3); // new target: timer restarts
      expect(queued()).toHaveLength(0);
    });

    it('only sends mob dig hits to players within hearing range; player hits go to everyone', () => {
      sockets.far = mkSocket();
      engine.addPlayer({ characterId: 'far', socket: sockets.far as any, miningSpeed: 25 });
      const near = engine.players.get('p1')!;
      const far = engine.players.get('far')!;
      near.playerBody.position = { x: 10.5, y: 14.5 };
      far.playerBody.position = { x: 10.5, y: 14.5 + MINING_CONFIG.BLOCK_HIT_HEARING_RANGE + 5 };

      engine.blockSubsystem.queueBlockHit({ x: 10, y: 15, tileType: MiningTileType.DIRT, damage: 5, source: 'mob' });
      engine.blockSubsystem.queueBlockHit({ x: 10, y: 15, tileType: MiningTileType.DIRT, damage: 7 }); // player hit
      sockets.p1.emit.mockClear();
      sockets.far.emit.mockClear();
      (engine as any).tick(1 / 30);

      expect(lastTick('p1').blockHits.map((h: any) => h.damage)).toEqual([5, 7]);
      expect(lastTick('far').blockHits.map((h: any) => h.damage)).toEqual([7]);
    });

    it('does not send a hits field at all when nothing is audible', () => {
      sockets.far = mkSocket();
      engine.addPlayer({ characterId: 'far', socket: sockets.far as any, miningSpeed: 25 });
      engine.players.get('p1')!.playerBody.position = { x: 10.5, y: 14.5 };
      engine.players.get('far')!.playerBody.position = { x: 10.5, y: 14.5 + MINING_CONFIG.BLOCK_HIT_HEARING_RANGE + 5 };
      engine.blockSubsystem.queueBlockHit({ x: 10, y: 15, tileType: MiningTileType.DIRT, damage: 5, source: 'mob' });
      (engine as any).tick(1 / 30);
      expect(lastTick('far').blockHits).toBeUndefined();
    });
  });
});
