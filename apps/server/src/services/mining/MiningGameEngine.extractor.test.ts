import { describe, it, expect } from 'vitest';
import { MINING_CONFIG, placeExtractor } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';

const socket = () => {
  const emitted: { event: string; payload: any }[] = [];
  return { emitted, socket: { connected: true, emit: (event: string, payload: any) => emitted.push({ event, payload }) } as any };
};
const make = (over: object = {}, s = socket()) => ({
  engine: new MiningGameEngine({ characterId: 'p1', cityId: 'c', seed: 11, mapConfig: { mobSpawnCount: 0, ...over }, socket: s.socket }),
  s,
});
const tickFor = (engine: MiningGameEngine, seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) (engine as any).tick(1 / 30); };
const stateTicks = (s: ReturnType<typeof socket>) => s.emitted.filter((e) => e.event === 'mining_state_tick').map((e) => e.payload);

describe('the extractor in a run (ticket 120)', () => {
  it('stands on the ground, to the side of the exit, clear of the entrance', () => {
    const { engine } = make();
    const ex = engine.extractorSubsystem!;
    expect(ex).not.toBeNull();
    const { x, y, width, height } = ex.placement;
    expect(y + height).toBe(engine.surfaceRow); // feet on the ground
    expect(x).toBeGreaterThan(MINING_CONFIG.ENTRANCE_X); // not over the exit
    expect(x + width).toBeLessThanOrEqual(engine.grid[0].length);
    // the ground under it is solid, level dirt
    for (let cx = x; cx < x + width; cx++) expect(engine.grid[engine.surfaceRow][cx].type).not.toBe(0);
    // and the sky it fills is empty
    for (let cy = y; cy < y + height; cy++) for (let cx = x; cx < x + width; cx++) expect(engine.grid[cy][cx].type).toBe(0);
  });

  it('is the same place for the same seed and size', () => {
    expect(make().engine.extractorSubsystem!.placement).toEqual(make().engine.extractorSubsystem!.placement);
  });

  it('keeps its distance from the exit even when the data offset would cover it', () => {
    const p = placeExtractor({ width: 12, height: 9, entranceOffset: 1 }, 24, 135);
    expect(p.x).toBeGreaterThanOrEqual(MINING_CONFIG.ENTRANCE_X + 3);
    const left = placeExtractor({ width: 12, height: 9, entranceOffset: -1 }, 24, 135);
    expect(left.x + left.width).toBeLessThanOrEqual(MINING_CONFIG.ENTRANCE_X - 3);
  });

  it('stays inside a small map', () => {
    const p = placeExtractor({ width: 12, height: 9, entranceOffset: 60 }, 24, 30);
    expect(p.x + p.width).toBeLessThanOrEqual(30);
    expect(p.x).toBeGreaterThanOrEqual(0);
  });

  it('lands after the landing time, counted from when the first player joined', () => {
    const { engine } = make();
    const ex = engine.extractorSubsystem!;
    const seconds = ex.definition.landingSeconds;
    expect(ex.isLanded()).toBe(false);
    tickFor(engine, seconds - 0.5);
    expect(ex.isLanded()).toBe(false);
    expect(ex.landingRemaining()).toBeGreaterThan(0);
    tickFor(engine, 1);
    expect(ex.isLanded()).toBe(true);
    expect(ex.landingRemaining()).toBe(0);
  });

  it('does not start landing before anyone has joined', () => {
    const { engine } = make();
    engine.removePlayer('p1');
    const fresh = engine.extractorSubsystem!;
    // (a room with no player ever joined has not begun)
    const room = new MiningGameEngine({ roomId: 'r', gameMode: 'multiplayer', cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 } });
    tickFor(room, 10);
    expect(room.extractorSubsystem!.isLanded()).toBe(false);
    expect(room.extractorSubsystem!.landingRemaining()).toBe(room.extractorSubsystem!.definition.landingSeconds);
    expect(fresh).toBeDefined();
  });

  it('tells a late joiner it has already landed, so the intro is not replayed', () => {
    const { engine } = make();
    tickFor(engine, engine.extractorSubsystem!.definition.landingSeconds + 1);
    const late = socket();
    engine.addPlayer({ characterId: 'p2', socket: late.socket });
    const state = engine.extractorSubsystem!.clientState();
    expect(state.landingRemaining).toBe(0);
    expect(state.landingSeconds).toBeGreaterThan(0);
  });

  it('sends the description once with the join state, and "landed" once in a tick', () => {
    const s = socket();
    const { engine } = make({}, s);
    const manager = MiningSessionManager.getInstance();
    const join = manager.buildClientState(engine, "p1");
    expect(join.extractor?.landingRemaining).toBeGreaterThan(0);
    expect(join.extractor?.x).toBe(engine.extractorSubsystem!.placement.x);
    tickFor(engine, engine.extractorSubsystem!.definition.landingSeconds + 1);
    const withUpdate = stateTicks(s).filter((t) => t.extractor);
    expect(withUpdate).toHaveLength(1);
    expect(withUpdate[0].extractor).toEqual({ landed: true });
  });

  it('has no extractor in the sandbox', () => {
    const e = new MiningGameEngine({ characterId: 'sb', cityId: 'c', seed: 1, gameMode: 'sandbox', socket: socket().socket });
    expect(e.extractorSubsystem).toBeNull();
  });
});
