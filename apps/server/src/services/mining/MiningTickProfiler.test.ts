import { describe, it, expect, vi } from 'vitest';
import { MINING_CONFIG, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningTickProfiler } from './MiningTickProfiler';
import { MiningGameEngine } from './MiningGameEngine';

describe('MiningTickProfiler', () => {
  const tick = (p: MiningTickProfiler, start: number, steps: Record<string, number>, total: number) => {
    p.beginTick(start);
    for (const [name, ms] of Object.entries(steps)) p.recordStep(name, ms);
    p.endTick(start + total);
  };

  it('reports the average, p95 and worst tick, the load against the budget, and steps by cost', () => {
    const p = new MiningTickProfiler(33.3, vi.fn());
    for (let i = 0; i < 19; i++) tick(p, i * 100, { fluids: 2, mobs: 6 }, 10);
    tick(p, 5000, { fluids: 2, mobs: 30 }, 40);
    const s = p.snapshot(3, { mobs: 4 });
    expect(s.windowTicks).toBe(20);
    expect(s.tickMs.max).toBe(40);
    expect(s.tickMs.avg).toBe(11.5);
    expect(s.loadPercent).toBe(Math.round((11.5 / 33.3) * 100));
    expect(s.steps.map((x) => x.name)).toEqual(['mobs', 'fluids']);
    expect(s.steps[0]).toEqual({ name: 'mobs', avgMs: 7.2, maxMs: 30 });
    expect(s.droppedTicks).toBe(3);
    expect(s.counts).toEqual({ mobs: 4 });
  });

  it('keeps only the latest window of ticks', () => {
    const p = new MiningTickProfiler(33.3, vi.fn());
    for (let i = 0; i < 200; i++) tick(p, i * 50, { mobs: i < 100 ? 20 : 1 }, 5);
    const s = p.snapshot(0, {});
    expect(s.windowTicks).toBe(60);
    expect(s.steps[0].maxMs).toBe(1); // the old expensive ticks have aged out
  });

  it('measures the gap between loop wake-ups', () => {
    const p = new MiningTickProfiler(33.3, vi.fn());
    p.noteLoop(10);
    p.noteLoop(43);
    p.noteLoop(130);
    expect(p.snapshot(0, {}).loopGapMs).toEqual({ avg: 60, max: 87 });
  });

  it('times a step and still lets its error through', () => {
    const p = new MiningTickProfiler(33.3, vi.fn());
    p.beginTick(0);
    expect(p.time('ok', () => 5)).toBe(5);
    expect(() => p.time('bad', () => { throw new Error('x'); })).toThrow('x');
    p.endTick(1);
    expect(p.snapshot(0, {}).steps.map((x) => x.name).sort()).toEqual(['bad', 'ok']);
  });

  it('warns about a tick over budget with its costliest steps, but not more than every 10 seconds', () => {
    const warn = vi.fn();
    const p = new MiningTickProfiler(33.3, warn);
    tick(p, 20_000, { fluids: 5, mobs: 40, drops: 10, rocks: 1 }, 60);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('mobs 40.0ms, drops 10.0ms, fluids 5.0ms');
    tick(p, 25_000, { mobs: 40 }, 60);
    expect(warn).toHaveBeenCalledTimes(1);
    tick(p, 40_000, { mobs: 40 }, 60);
    expect(warn).toHaveBeenCalledTimes(2);
    tick(p, 60_000, { mobs: 1 }, 10);
    expect(warn).toHaveBeenCalledTimes(2); // within budget: silent
  });
});

describe('the engine reports its cost to players', () => {
  const makeEngine = () => {
    const socket = { connected: true, emit: vi.fn() };
    const engine = new MiningGameEngine({ characterId: 'c', cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    return { engine, socket };
  };
  const payloads = (socket: { emit: ReturnType<typeof vi.fn> }) =>
    socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1] as MiningStateTickPayload);

  it('sends perf about once a second, with every simulation step named and entity counts', () => {
    const { engine, socket } = makeEngine();
    for (let i = 0; i < MINING_CONFIG.SERVER_TICK_RATE * 2; i++) (engine as any).tick(1 / 30);
    const withPerf = payloads(socket).filter((p) => p.perf);
    expect(withPerf).toHaveLength(2);
    const perf = withPerf[1].perf!;
    expect(perf.steps.map((s) => s.name)).toEqual(expect.arrayContaining(['players', 'rigidWorld', 'fluids', 'fire', 'mobs', 'broadcast', 'broadcast (socket emit)']));
    expect(perf.counts).toMatchObject({ players: 1, gridCells: engine.grid.length * engine.grid[0].length });
    expect(perf.tickMs.avg).toBeGreaterThan(0);
    expect(perf.payloadBytes).toBeGreaterThan(0);
    expect(payloads(socket).filter((p) => !p.perf).length).toBeGreaterThan(0); // not on every tick
  });

  it('times a step even when it throws, and the room carries on', () => {
    const { engine } = makeEngine();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(engine.fluidSubsystem, 'update').mockImplementation(() => { throw new Error('boom'); });
    (engine as any).tick(1 / 30);
    expect(engine.profiler.snapshot(0, {}).steps.map((s) => s.name)).toContain('fluids');
  });
});
