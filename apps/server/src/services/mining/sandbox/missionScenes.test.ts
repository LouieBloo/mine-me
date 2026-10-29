import { describe, it, expect, vi } from 'vitest';
import { MiningGameEngine } from '../MiningGameEngine';
import { MISSION_SCENES, MISSION_SCENE_OPTIONS, adHocMission, findMissionScene } from './missionScenes';
import { hitMob } from '../testHelpers';

const cid = 'sbx-mission';

function sandbox() {
  const socket = { connected: true, emit: vi.fn() };
  const engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 1, gameMode: 'sandbox', socket: socket as any, mapConfig: { mobSpawnCount: 0 } });
  return { engine, socket };
}
const tick = (engine: MiningGameEngine, n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };

describe('mission test scenes (ticket 116)', () => {
  it('lists every scene for the panel, and finds one by id', () => {
    expect(MISSION_SCENE_OPTIONS.map((s) => s.id)).toEqual(MISSION_SCENES.map((s) => s.id));
    expect(findMissionScene('clear-gas')?.name).toBeTruthy();
    expect(findMissionScene('nope')).toBeUndefined();
  });

  it('builds a one-off mission with no reward and an open level range', () => {
    expect(adHocMission('x', 'X', [{ type: 'KILL_MOB', amount: 1 }])).toMatchObject({ rewardCoins: 0, rewardXp: 0, minLevel: 1, objectives: [{ type: 'KILL_MOB', amount: 1 }] });
  });

  it('clear-gas: starts with a cloud of gas and completes once half of it is gone', () => {
    const { engine } = sandbox();
    expect(engine.sandbox!.loadMissionScene(cid, 'clear-gas')).toEqual({ ok: true });
    const tracker = engine.missionTracker!;
    expect(tracker.completed).toBe(false);
    const grid = engine.gasSubsystem.grid;
    const gasId = engine.gasSubsystem.registry.idOf(engine.dataManager.getGas(engine.mission!.objectives[0].targetId!)!.typeKey)!;
    const cells: [number, number][] = [];
    for (let y = 0; y < engine.grid.length; y++) for (let x = 0; x < engine.grid[0].length; x++) if (grid.getGasId(x, y) === gasId) cells.push([x, y]);
    expect(cells.length).toBeGreaterThan(0);
    // (the sandbox already holds some of this gas elsewhere, and all of it counts, so take it all)
    for (const [x, y] of cells) grid.drainGas(x, y, grid.getConcentration(x, y));
    tracker.poll();
    expect(tracker.completed).toBe(true);
  });

  it('kill-mobs: puts two mobs in the hall and completes when both are killed', () => {
    const { engine } = sandbox();
    expect(engine.sandbox!.loadMissionScene(cid, 'kill-mobs')).toEqual({ ok: true });
    const mobs = [...engine.activeMobs.values()].filter((m) => m.mobId !== engine.mapConfig?.surfaceDummyMobId && m.health > 0);
    expect(mobs.length).toBeGreaterThanOrEqual(2);
    for (const m of mobs.slice(0, 2)) hitMob(engine, m.id, 99999, { source: { kind: 'player', id: cid } });
    expect(engine.missionTracker!.completed).toBe(true);
  });

  it('reach-depth: starts at the surface and completes when the player is 30 blocks down', () => {
    const { engine } = sandbox();
    expect(engine.sandbox!.loadMissionScene(cid, 'reach-depth')).toEqual({ ok: true });
    expect(engine.missionTracker!.completed).toBe(false);
    engine.getPlayer(cid)!.playerBody.position = { x: 40, y: engine.surfaceRow + 31 };
    tick(engine);
    expect(engine.missionTracker!.completed).toBe(true);
  });

  it('collect-items: asks for an item some block drops and completes when five are picked up', () => {
    const { engine } = sandbox();
    expect(engine.sandbox!.loadMissionScene(cid, 'collect-items')).toEqual({ ok: true });
    const goal = engine.mission!.objectives[0];
    expect(goal.type).toBe('MINE_ITEM');
    const body = engine.getPlayer(cid)!.playerBody.position;
    engine.droppedItems = [{ id: 'd1', position: { x: body.x, y: body.y }, itemId: goal.targetId!, itemName: 'Item', iconUrl: null, quantity: 5 }];
    tick(engine);
    expect(engine.missionTracker!.completed).toBe(true);
  });

  it('refuses an unknown scene, and a player who is not in the room', () => {
    const { engine } = sandbox();
    expect(engine.sandbox!.loadMissionScene(cid, 'nope')).toEqual({ ok: false, error: 'Unknown scene.' });
    expect(engine.sandbox!.loadMissionScene('ghost', 'reach-depth')).toEqual({ ok: false, error: 'You are not in the room.' });
  });

  it('starts a loaded mission by id, or a checked one-off list of objectives, and refuses bad input', () => {
    const { engine } = sandbox();
    expect(engine.sandbox!.startMission('nope', undefined)).toEqual({ ok: false, error: 'Unknown mission.' });
    expect(engine.sandbox!.startMission(undefined, [])).toMatchObject({ ok: false });
    expect(engine.sandbox!.startMission(undefined, [{ type: 'KILL_MOB', amount: 0 }])).toMatchObject({ ok: false });
    expect(engine.sandbox!.startMission(undefined, [{ type: 'REACH_DEPTH', amount: 25 }])).toEqual({ ok: true });
    expect(engine.missionTracker!.clientState().objectives[0].label).toBe('Reach depth 25');
    expect(engine.sandbox!.missionControl('bogus')).toMatchObject({ ok: false });
    engine.sandbox!.missionControl('clear');
    expect(engine.sandbox!.missionControl('complete')).toEqual({ ok: false, error: 'There is no mission running.' });
  });

  it('shows the missions step in the server profiler', () => {
    const { engine } = sandbox();
    engine.sandbox!.loadMissionScene(cid, 'reach-depth');
    tick(engine, 5);
    const perf = engine.profiler.snapshot(0, {});
    expect(perf.steps.map((s) => s.name)).toContain('missions');
  });
});
