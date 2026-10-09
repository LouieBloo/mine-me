import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MINING_CONFIG } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

const STEP = MiningGameEngine.TICK_SECONDS;

describe('fixed-timestep loop', () => {
  let engine: MiningGameEngine;
  let warn: ReturnType<typeof vi.spyOn>;

  const make = (extra: Record<string, unknown> = {}) =>
    new MiningGameEngine({
      characterId: 'loop-char', cityId: 'c', seed: 2,
      socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 0 }, ...extra,
    });

  beforeEach(() => {
    engine = make();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    engine.stop();
    warn.mockRestore();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('defines the step from the configured tick rate', () => {
    expect(STEP).toBeCloseTo(1 / MINING_CONFIG.SERVER_TICK_RATE);
    expect(MINING_CONFIG.MAX_CATCHUP_TICKS).toBeGreaterThan(1);
  });

  describe('advance()', () => {
    it('runs exactly one tick per step of elapsed time', () => {
      expect(engine.advance(STEP)).toBe(1);
      expect(engine.advance(STEP * 3)).toBe(3);
      expect(engine.elapsedTimeSeconds).toBeCloseTo(STEP * 4);
    });

    it('accumulates partial steps instead of losing them', () => {
      expect(engine.advance(STEP * 0.4)).toBe(0);
      expect(engine.advance(STEP * 0.4)).toBe(0);
      expect(engine.advance(STEP * 0.4)).toBe(1); // 1.2 steps in total
      expect(engine.advance(STEP * 0.8)).toBe(1); // 0.2 + 0.8 = 1.0 step
    });

    it('simulated time matches real time over many irregular wake-ups', () => {
      let total = 0;
      let ticks = 0;
      for (let i = 0; i < 500; i++) {
        const dt = 0.005 + (i % 7) * 0.004; // 5 ms .. 29 ms
        total += dt;
        ticks += engine.advance(dt);
      }
      expect(ticks).toBe(Math.floor(total / STEP + 1e-9));
      expect(Math.abs(engine.elapsedTimeSeconds - total)).toBeLessThan(STEP);
    });

    it('catches up after a late wake-up, up to the cap', () => {
      expect(engine.advance(STEP * 3)).toBe(3);
      expect(engine.droppedTicks).toBe(0);
    });

    it('drops the backlog beyond the cap instead of spiralling', () => {
      const ran = engine.advance(STEP * 100);
      expect(ran).toBe(MINING_CONFIG.MAX_CATCHUP_TICKS);
      expect(engine.droppedTicks).toBe(100 - MINING_CONFIG.MAX_CATCHUP_TICKS);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('fell behind'));
      // The backlog is gone: the next normal step runs exactly one tick
      expect(engine.advance(STEP)).toBe(1);
    });

    it('keeps the partial step when dropping a backlog', () => {
      engine.advance(STEP * (20 + 0.5));
      expect(engine.advance(STEP * 0.5)).toBe(1);
    });

    it.each([0, -1, NaN, Infinity, -Infinity])('ignores an invalid elapsed time (%s)', (v) => {
      expect(engine.advance(v)).toBe(0);
      expect(engine.elapsedTimeSeconds).toBe(0);
    });

    it('does nothing once stopped', () => {
      engine.stop();
      expect(engine.advance(1)).toBe(0);
    });

    it('stops catching up if the room ends mid-burst (e.g. the session times out)', () => {
      const short = make({ maxDurationSeconds: STEP * 2 });
      const ran = short.advance(STEP * 5);
      expect(ran).toBeLessThanOrEqual(2);
      expect(short.advance(STEP)).toBe(0);
      short.stop();
    });

    it('the session time limit tracks real time even when wake-ups arrive late and in bursts', () => {
      const onTimeout = vi.fn();
      const timed = make({ maxDurationSeconds: 1, onTimeout });
      // A bit over one second of real time delivered as late 0.1 s bursts (3 ticks each, within the
      // catch-up cap). Previously each late wake-up simply lost its missed ticks, stretching the session.
      // (The limit is checked at the start of a tick, hence slightly more than 1 s.)
      for (let i = 0; i < 11; i++) timed.advance(0.1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(timed.elapsedTimeSeconds).toBeGreaterThanOrEqual(1 - STEP);
      timed.stop();
    });
  });

  describe('start() / stop() with the real timer', () => {
    it('runs about one tick per 1/30 s of clock time and stops cleanly', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
      const tickSpy = vi.spyOn(engine as any, 'tick');
      engine.start();
      vi.advanceTimersByTime(1000);
      expect(Math.abs(tickSpy.mock.calls.length - MINING_CONFIG.SERVER_TICK_RATE)).toBeLessThanOrEqual(1);

      engine.stop();
      const after = tickSpy.mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(tickSpy.mock.calls.length).toBe(after);
    });

    it('start() twice does not double the tick rate', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
      const tickSpy = vi.spyOn(engine as any, 'tick');
      engine.start();
      engine.start();
      vi.advanceTimersByTime(1000);
      expect(Math.abs(tickSpy.mock.calls.length - MINING_CONFIG.SERVER_TICK_RATE)).toBeLessThanOrEqual(1);
    });

    it('after a stall it catches up (capped) rather than running slow', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const tickSpy = vi.spyOn(engine as any, 'tick');
      engine.start();

      now += 100; // the event loop was blocked for 100 ms before this wake-up (3 ticks' worth)
      vi.advanceTimersToNextTimer();
      expect(tickSpy.mock.calls.length).toBe(3);

      now += 5000; // a long stall: capped catch-up, the rest is dropped
      vi.advanceTimersToNextTimer();
      expect(tickSpy.mock.calls.length).toBe(3 + MINING_CONFIG.MAX_CATCHUP_TICKS);
      expect(engine.droppedTicks).toBeGreaterThan(100);
    });
  });
});

describe('fire rate runs on simulation time', () => {
  const cid = 'rate-char';
  let engine: MiningGameEngine;

  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 2,
      socket: { connected: true, emit: vi.fn() } as any,
      equippedWeaponId: 'cmn_revolver_6shooter', // fire rate 6 shots/s in the seed data
      mapConfig: { mobSpawnCount: 0 },
    });
  });
  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  it('allows the first shot immediately, even at simulation time 0', () => {
    expect(engine.elapsedTimeSeconds).toBe(0);
    expect(engine.shootProjectile(cid, { x: 30, y: 0 }).success).toBe(true);
  });

  it('blocks a second shot in the same instant and allows it once enough simulated time passed', () => {
    expect(engine.shootProjectile(cid, { x: 30, y: 0 }).success).toBe(true);
    const tooFast = engine.shootProjectile(cid, { x: 30, y: 0 });
    expect(tooFast).toMatchObject({ success: false, error: expect.stringMatching(/too fast/i) });

    engine.advance(1 / 6 + STEP); // just past the 1/6 s cooldown
    expect(engine.shootProjectile(cid, { x: 30, y: 0 }).success).toBe(true);
  });

  it('is not affected by the wall clock', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    engine.shootProjectile(cid, { x: 30, y: 0 });
    vi.setSystemTime(Date.now() + 60_000); // a minute of wall-clock time with no simulation
    expect(engine.shootProjectile(cid, { x: 30, y: 0 }).success).toBe(false);
  });

  it('enforces the same cooldown however the ticks are delivered (lag or not)', () => {
    engine.shootProjectile(cid, { x: 30, y: 0 });
    engine.advance(0.1); // 3 ticks = 0.1 s < 0.1667 s
    expect(engine.shootProjectile(cid, { x: 30, y: 0 }).success).toBe(false);
    engine.advance(0.1); // total 0.2 s
    expect(engine.shootProjectile(cid, { x: 30, y: 0 }).success).toBe(true);
  });
});
