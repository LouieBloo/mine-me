import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MiningProfiler, isProfilerFlagOn } from './MiningProfiler';

describe('MiningProfiler', () => {
  let profiler: MiningProfiler;

  beforeEach(() => {
    profiler = new MiningProfiler(5000);
  });

  it('calculates average, min, and max FPS accurately', () => {
    // Simulate 3 frames with 16.6ms intervals (60 FPS)
    profiler.beginFrame(1000);
    profiler.endFrame(1002);

    profiler.beginFrame(1016.6);
    profiler.endFrame(1018.6);

    profiler.beginFrame(1033.2);
    profiler.endFrame(1035.2);

    const stats = profiler.getStats(1035.2);
    expect(stats.frameCount).toBe(3);
    expect(stats.fps.avg).toBeGreaterThanOrEqual(59);
    expect(stats.fps.avg).toBeLessThanOrEqual(61);
  });

  it('captures section execution timings and attributes spikes', () => {
    // Frame 1: fast
    profiler.beginFrame(100);
    profiler.startSection('physics', 101);
    profiler.endSection(102); // 1ms
    profiler.startSection('lighting', 102);
    profiler.endSection(104); // 2ms
    profiler.endFrame(105);

    // Frame 2: frame interval gap spike (e.g. GPU wait 100ms)
    profiler.beginFrame(205); // 100ms interval
    profiler.startSection('physics', 206);
    profiler.endSection(207); // 1ms
    profiler.startSection('lighting', 207);
    profiler.endSection(208); // 1ms
    profiler.endFrame(209); // total CPU: 4ms

    const stats = profiler.getStats(209);
    expect(stats.frameCount).toBe(2);
    expect(stats.spikeCount).toBe(1);
    expect(stats.worstSpike).toBeDefined();
    expect(stats.worstSpike?.intervalMs).toBe(105);
    expect(stats.worstSpike?.gapMs).toBeGreaterThanOrEqual(95);
    expect(stats.diagnosis).toContain('GPU Pipeline / WebGL Render Stall');
  });

  it('reports to console when logIntervalMs expires and resets accumulators', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    profiler.beginFrame(1000);
    profiler.endFrame(1005);

    // After 5000ms:
    profiler.beginFrame(6001);
    profiler.endFrame(6005);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});

describe('MiningProfiler switch', () => {
  it('measures nothing while disabled, and starts measuring when enabled', () => {
    const profiler = new MiningProfiler(5000, false);
    profiler.beginFrame(1000);
    profiler.endFrame(1002);
    expect(profiler.getStats(1002).frameCount).toBe(0);

    profiler.setEnabled(true);
    profiler.beginFrame(2000);
    profiler.endFrame(2002);
    profiler.beginFrame(2016);
    profiler.endFrame(2018);
    expect(profiler.getStats(2018).frameCount).toBeGreaterThan(0);
  });

  it('tells subscribers when it is switched, once per real change, and stops after unsubscribe', () => {
    const profiler = new MiningProfiler(5000, false);
    const listener = vi.fn();
    const off = profiler.subscribe(listener);
    profiler.setEnabled(true);
    profiler.setEnabled(true); // no change
    profiler.enabled = false; // the property switches it too
    expect(listener.mock.calls).toEqual([[true], [false]]);
    off();
    profiler.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('isProfilerFlagOn', () => {
  afterEach(() => {
    window.localStorage.removeItem('miningProfiler');
    window.history.replaceState({}, '', '/');
  });

  it('is off by default', () => {
    expect(isProfilerFlagOn()).toBe(false);
  });

  it('is on with the localStorage flag', () => {
    window.localStorage.setItem('miningProfiler', '1');
    expect(isProfilerFlagOn()).toBe(true);
  });

  it('is on with the URL parameter', () => {
    window.history.replaceState({}, '', '/?miningProfiler=1');
    expect(isProfilerFlagOn()).toBe(true);
  });

  it('is off when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(isProfilerFlagOn()).toBe(false);
    spy.mockRestore();
  });
});

describe('MiningProfiler events, gauges and reports', () => {
  it('averages an event per occurrence, not per frame, and clears it each report', () => {
    const profiler = new MiningProfiler(1000, true);
    profiler.logToConsole = false;
    profiler.beginFrame(0);
    profiler.endFrame(2);
    profiler.recordEvent('Tick', 4);
    profiler.recordEvent('Tick', 8);
    const stats = profiler.getStats(1000);
    expect(stats.events).toEqual([{ name: 'Tick', count: 2, perSecond: 2, avgMs: 6, maxMs: 8 }]);
    profiler.reset(1000);
    expect(profiler.getStats(2000).events).toEqual([]);
  });

  it('orders events by the time they take in total', () => {
    const profiler = new MiningProfiler(1000, true);
    profiler.recordEvent('Rare but slow', 50);
    for (let i = 0; i < 30; i++) profiler.recordEvent('Frequent', 3);
    expect(profiler.getStats(1000).events.map((e) => e.name)).toEqual(['Frequent', 'Rare but slow']);
  });

  it('times work as an event, passes the result through, and costs nothing when off', () => {
    const profiler = new MiningProfiler(1000, true);
    expect(profiler.timeEvent('Work', () => 42)).toBe(42);
    expect(profiler.getStats(1000).events[0]).toMatchObject({ name: 'Work', count: 1 });
    const off = new MiningProfiler(1000, false);
    expect(off.timeEvent('Work', () => 7)).toBe(7);
    expect(off.getStats(1000).events).toEqual([]);
  });

  it('keeps gauges and the server summary across reports', () => {
    const profiler = new MiningProfiler(1000, true);
    profiler.setGauge('Lights', 12);
    profiler.setServerPerf({ windowTicks: 1, budgetMs: 33, tickMs: { avg: 1, p95: 1, max: 1 }, loadPercent: 3, loopGapMs: { avg: 33, max: 33 }, steps: [], droppedTicks: 0, counts: {}, payloadBytes: 10 });
    profiler.reset(500);
    const stats = profiler.getStats(1000);
    expect(stats.gauges).toEqual({ Lights: 12 });
    expect(stats.server?.loadPercent).toBe(3);
  });

  it('ignores gauges, events and server data while off', () => {
    const profiler = new MiningProfiler(1000, false);
    profiler.setGauge('Lights', 12);
    profiler.recordEvent('x', 1);
    profiler.setServerPerf({} as any);
    const stats = profiler.getStats(1000);
    expect(stats.gauges).toEqual({});
    expect(stats.events).toEqual([]);
    expect(stats.server).toBeNull();
  });

  it('hands each finished report to listeners, and prints it only when asked to', () => {
    const profiler = new MiningProfiler(1000, true);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const listener = vi.fn();
    const unsubscribe = profiler.onReport(listener);
    profiler.logToConsole = false;
    profiler.beginFrame(0);
    profiler.endFrame(1);
    profiler.beginFrame(16);
    profiler.endFrame(1100);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].frameCount).toBe(2);
    expect(log).not.toHaveBeenCalled();

    profiler.logToConsole = true;
    profiler.beginFrame(1116);
    profiler.endFrame(2200);
    expect(log).toHaveBeenCalledTimes(1);
    unsubscribe();
    profiler.beginFrame(2216);
    profiler.endFrame(3400);
    expect(listener).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('can be told to report more often, but not absurdly often', () => {
    const profiler = new MiningProfiler(5000, true);
    profiler.setReportInterval(1);
    const listener = vi.fn();
    profiler.onReport(listener);
    profiler.beginFrame(1000);
    profiler.endFrame(1100);
    expect(listener).not.toHaveBeenCalled(); // floor of 250ms
    profiler.beginFrame(1150);
    profiler.endFrame(1200);
    expect(listener).not.toHaveBeenCalled();
    profiler.beginFrame(1250);
    profiler.endFrame(1300);
    expect(listener).toHaveBeenCalled();
  });
});
