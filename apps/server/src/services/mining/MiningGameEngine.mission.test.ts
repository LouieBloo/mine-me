import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningTileType, type MissionDefinition, type ObjectiveDefinition } from '@mine-me/shared';
import { MiningDataManager } from './subsystems/MiningDataManager';
import { hitMob } from './testHelpers';

const cid = 'mission-char';

const mission = (objectives: ObjectiveDefinition[], over: Partial<MissionDefinition> = {}): MissionDefinition => ({
  id: 'mx', key: 'mx', name: 'Test mission', minLevel: 1, maxLevel: 99, tier: 1, weight: 1, objectives, rewardCoins: 5, rewardXp: 5, rewardItems: [], ...over,
});

function start(m: MissionDefinition | undefined, mapConfig: object = { mobSpawnCount: 0 }) {
  const socket = { connected: true, emit: vi.fn() };
  const engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 11, socket: socket as any, mapConfig, mission: m });
  for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  return { engine, socket };
}

const tick = (engine: MiningGameEngine, n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };

/** A flat open platform for the player and a mob to stand on, away from anything else. */
function platform(engine: MiningGameEngine) {
  for (let x = 18; x <= 30; x++) {
    for (let y = 14; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
    engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
  }
  engine.players.get(cid)!.playerBody.position = { x: 20.5, y: 20.5 };
}

describe('a run with no mission', () => {
  it('has no tracker and sends no mission state', () => {
    const { engine, socket } = start(undefined);
    expect(engine.missionTracker).toBeNull();
    tick(engine, 3);
    const ticks = socket.emit.mock.calls.filter((c: any[]) => c[0] === 'mining_state_tick');
    expect(ticks.every((c: any[]) => c[1].missionProgress === undefined)).toBe(true);
  });
});

describe('items collected count, not blocks broken', () => {
  it('counts what goes into the backpack, once', () => {
    const { engine } = start(mission([{ type: 'MINE_ITEM', targetId: 'ore-x', amount: 3 }]));
    platform(engine);
    engine.droppedItems = [{ id: 'd1', position: { x: 20.5, y: 20.5 }, itemId: 'ore-x', itemName: 'Ore', iconUrl: null, quantity: 2 }];
    tick(engine);
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(2);
    tick(engine, 3); // it is gone from the ground: nothing is counted again
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(2);
  });

  it('does not count an item that did not fit, or a different item', () => {
    const { engine } = start(mission([{ type: 'MINE_ITEM', targetId: 'ore-x', amount: 3 }]));
    platform(engine);
    engine.droppedItems = [{ id: 'd2', position: { x: 20.5, y: 20.5 }, itemId: 'other', itemName: 'Other', iconUrl: null, quantity: 5 }];
    tick(engine);
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(0);
  });
});

describe('kills count for the run, credited to the player the damage traces to', () => {
  const spawn = (engine: MiningGameEngine) => {
    platform(engine);
    return engine.spawnMob({ id: 'victim', name: 'Victim', health: 30, dropTable: { solMin: 0, solMax: 0, items: [] } }, { x: 26.5, y: 21 });
  };

  it('counts a melee kill, a bullet and a blast by their owner', () => {
    const { engine } = start(mission([{ type: 'KILL_MOB', amount: 3 }]));
    const a = spawn(engine);
    hitMob(engine, a.id, 999, { source: { kind: 'player', id: cid } });
    const b = spawn(engine);
    hitMob(engine, b.id, 999, { type: 'ranged', source: { kind: 'projectile', id: 'p1', ownerId: cid } });
    const c = spawn(engine);
    hitMob(engine, c.id, 999, { type: 'explosive', source: { kind: 'explosion', id: 'd1', ownerId: cid } });
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(3);
  });

  it('counts every death in the run, credited to the player who hurt it last (if any)', () => {
    const { engine } = start(mission([{ type: 'KILL_MOB', amount: 5 }]));
    const burned = spawn(engine);
    hitMob(engine, burned.id, 1, { source: { kind: 'player', id: cid } });
    hitMob(engine, burned.id, 999, { type: 'environmental', source: { kind: 'environment', name: 'Fire' } });
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(1);

    // The environment alone finishes one: it still counts for the run (co-op), but for nobody's contribution
    const alone = spawn(engine);
    hitMob(engine, alone.id, 999, { type: 'environmental', source: { kind: 'environment', name: 'Fire' } });
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(2);
    expect(engine.missionTracker!.result([cid], 'completed').contributions.find((c) => c.characterId === cid)?.amounts).toEqual([1]);
  });

  it('forgets who to credit after a while, but the kill still counts for the run', () => {
    const { engine } = start(mission([{ type: 'KILL_MOB', amount: 5 }]));
    const slow = spawn(engine);
    hitMob(engine, slow.id, 1, { source: { kind: 'player', id: cid } });
    tick(engine, 30 * 20); // twenty seconds
    hitMob(engine, slow.id, 999, { type: 'environmental', source: { kind: 'environment', name: 'Fire' } });
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(1);
    expect(engine.missionTracker!.result([cid], 'completed').contributions.find((c) => c.characterId === cid)?.amounts).toEqual([0]);
  });

  it('does not count a mob that dies twice, or the surface target dummy', () => {
    const { engine } = start(mission([{ type: 'KILL_MOB', amount: 5 }]), { mobSpawnCount: 0, surfaceDummyMobId: 'dummy-id' });
    const m = spawn(engine);
    hitMob(engine, m.id, 999, { source: { kind: 'player', id: cid } });
    hitMob(engine, m.id, 999, { source: { kind: 'player', id: cid } });
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(1);
    const dummy = engine.spawnMob({ id: 'dummy-id', name: 'Dummy', health: 10 }, { x: 28.5, y: 21 });
    hitMob(engine, dummy.id, 999, { source: { kind: 'player', id: cid } });
    expect(engine.missionTracker!.clientState().objectives[0].progress).toBe(1);
  });
});

describe('the caves hold enough mobs for a kill goal (ticket 110)', () => {
  const build = (m: MissionDefinition) =>
    new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 11, socket: { connected: true, emit: vi.fn() } as any, mapConfig: { mobSpawnCount: 0 }, mission: m });
  const live = (engine: MiningGameEngine, mobId?: string) => [...engine.activeMobs.values()].filter((x) => x.health > 0 && (mobId === undefined || x.mobId === mobId));

  it('spawns more of the named mob than the goal needs', () => {
    const def = MiningDataManager.getInstance().getMobs()[0];
    const engine = build(mission([{ type: 'KILL_MOB', targetId: def.id, amount: 4 }]));
    expect(live(engine, def.id).length).toBeGreaterThanOrEqual(6);
  });

  it('spawns mobs for an any-mob goal, and none for a run without a mission', () => {
    const engine = build(mission([{ type: 'KILL_MOB', amount: 3 }]));
    expect(live(engine).length).toBeGreaterThanOrEqual(5);
    const plain = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 11, socket: { connected: true, emit: vi.fn() } as any, mapConfig: { mobSpawnCount: 0 } });
    expect(live(plain).length).toBe(0);
  });

  it('does not add mobs when the caves already hold enough', () => {
    const def = MiningDataManager.getInstance().getMobs()[0];
    const engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 11, socket: { connected: true, emit: vi.fn() } as any, mapConfig: { mobSpawnCount: 20, allowedMobIds: [def.id] }, mission: mission([{ type: 'KILL_MOB', targetId: def.id, amount: 3 }]) });
    expect(live(engine, def.id).length).toBe(20);
  });
});

describe('depth and the wire', () => {
  it('completes a depth goal when a player gets deep enough, and sends a delta once', () => {
    const { engine, socket } = start(mission([{ type: 'REACH_DEPTH', amount: 12 }]));
    engine.players.get(cid)!.playerBody.position = { x: 20.5, y: engine.surfaceRow + 14 };
    tick(engine);
    expect(engine.missionTracker!.completed).toBe(true);
    const deltas = socket.emit.mock.calls.filter((c: any[]) => c[0] === 'mining_state_tick' && c[1].missionProgress).map((c: any[]) => c[1].missionProgress);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ completed: true, objectives: [{ index: 0, done: true }] });
  });

  it('puts the mission, with its progress so far, in the state a late joiner gets', async () => {
    const { engine } = start(mission([{ type: 'KILL_MOB', amount: 2 }]));
    engine.missionTracker!.onMobKilled(cid, 'x');
    const { miningSessionManager } = await import('./MiningSessionManager');
    const state = miningSessionManager.buildClientState(engine, cid);
    expect(state.mission).toMatchObject({ name: 'Test mission', completed: false, reward: { coins: 5, xp: 5 } });
    expect(state.mission?.objectives[0]).toMatchObject({ progress: 1, target: 2, done: false });
  });
});

describe('fluid and gas goals use the totals at the start', () => {
  // A gas the recipe never generates, so any pocket of it is the mission's guarantee
  const gas = MiningDataManager.getInstance().getGases().find((g) => !g.generation);

  it('makes the map hold a pocket of the gas it asks to clear, and completes once enough is gone', () => {
    expect(gas).toBeDefined();
    const { engine } = start(mission([{ type: 'CLEAR_GAS', targetId: gas!.id, amount: 50 }]));
    const grid = engine.gasSubsystem.grid;
    const id = engine.gasSubsystem.registry.idOf(gas!.typeKey)!;
    expect(grid.totalVolume(id)).toBeGreaterThan(0);
    engine.missionTracker!.poll();
    expect(engine.missionTracker!.completed).toBe(false);

    // Take all the gas out, the way venting or a blast would
    for (let y = 0; y < engine.grid.length; y++) {
      for (let x = 0; x < engine.grid[0].length; x++) if (grid.getGasId(x, y) === id) grid.drainGas(x, y, grid.getConcentration(x, y));
    }
    engine.missionTracker!.poll();
    expect(engine.missionTracker!.completed).toBe(true);
  });
});

describe('the sandbox can set, complete and drop a mission', () => {
  it('starts with none, takes one, completes it and drops it', () => {
    const socket = { connected: true, emit: vi.fn() };
    const engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 1, gameMode: 'sandbox', socket: socket as any, mapConfig: { mobSpawnCount: 0 } });
    expect(engine.missionTracker).toBeNull();
    engine.setMission(mission([{ type: 'REACH_DEPTH', amount: 40 }]));
    expect(engine.missionTracker?.completed).toBe(false);
    engine.sandbox!.missionControl('complete');
    expect(engine.missionTracker?.completed).toBe(true);
    engine.sandbox!.missionControl('reset');
    expect(engine.missionTracker?.completed).toBe(false);
    engine.sandbox!.missionControl('clear');
    expect(engine.missionTracker).toBeNull();
    expect(socket.emit).toHaveBeenCalledWith('mining_mission_state', { mission: null });
  });

  it('keeps its mission through a sandbox reset', () => {
    const engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 1, gameMode: 'sandbox', socket: { connected: true, emit: vi.fn() } as any, mapConfig: { mobSpawnCount: 0 } });
    engine.setMission(mission([{ type: 'REACH_DEPTH', amount: 40 }]));
    engine.sandbox!.missionControl('complete');
    engine.sandbox!.reset();
    expect(engine.missionTracker?.completed).toBe(false);
    expect(engine.mission?.name).toBe('Test mission');
  });
});
