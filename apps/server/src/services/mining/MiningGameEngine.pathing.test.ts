import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MINING_CONFIG, MiningPathfinder, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('mob pathfinding load', () => {
  let engine: MiningGameEngine;
  const cid = 'path-char';
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };

  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 6,
      socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 0 },
    });
    // A wide open hall so every mob has the player in aggro range
    for (let x = 4; x <= 43; x++) {
      for (let y = 15; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    const me = engine.players.get(cid)!;
    me.playerBody.position = { x: 6.5, y: 21 - me.playerBody.halfHeight };
    me.playerBody.isGrounded = true;
  });

  afterEach(() => vi.restoreAllMocks());

  const spawnCrowd = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      engine.spawnMob({ id: `m${i}`, name: 'M', aiConfig: { aggroRange: 60 } }, { x: 16 + (i % 26), y: 21 })
    );

  it('starts no more path searches per tick than the budget, however many mobs there are', () => {
    spawnCrowd(60);
    const spy = vi.spyOn(MiningPathfinder, 'findPath');
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      spy.mockClear();
      tick();
      worst = Math.max(worst, spy.mock.calls.length);
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(MINING_CONFIG.MOB_PATHS_PER_TICK);
  });

  it('every mob still gets a path eventually (the budget delays searches, it does not starve them)', () => {
    const mobs = spawnCrowd(40);
    const spy = vi.spyOn(MiningPathfinder, 'findPath');
    tick(60); // 2 s: far more than 40 / 4 ticks
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(mobs.length);
  });

  it('periodic re-paths are staggered rather than all landing on the same tick', () => {
    const mobs = spawnCrowd(8);
    const intervals = new Set(mobs.map((m) => (m.ai as any).pathInterval));
    expect(intervals.size).toBeGreaterThan(1);
    for (const v of intervals) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThan(1.5);
    }
  });

  it('a tick with a large crowd stays cheap', () => {
    spawnCrowd(60);
    tick(5); // warm up
    const start = performance.now();
    tick(30);
    const perTick = (performance.now() - start) / 30;
    expect(perTick).toBeLessThan(1000 / MINING_CONFIG.SERVER_TICK_RATE);
  });
});
