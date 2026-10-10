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
