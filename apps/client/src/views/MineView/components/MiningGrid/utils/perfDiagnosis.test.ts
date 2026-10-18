import { describe, it, expect } from 'vitest';
import type { MiningServerPerf } from '@mine-me/shared';
import type { ProfilerStats } from './MiningProfiler';
import { buildPerfReport, diagnosePerformance } from './perfDiagnosis';

const server = (over: Partial<MiningServerPerf> = {}): MiningServerPerf => ({
  windowTicks: 60, budgetMs: 33.33, tickMs: { avg: 5, p95: 8, max: 12 }, loadPercent: 15, loopGapMs: { avg: 33, max: 40 },
  steps: [{ name: 'mobs', avgMs: 2, maxMs: 5 }], droppedTicks: 0, counts: {}, payloadBytes: 1000, ...over,
});

const stats = (over: Partial<ProfilerStats> = {}): ProfilerStats => ({
  frameCount: 60, durationSeconds: 1, fps: { avg: 60, min: 55, max: 60 }, frameCpu: { avgMs: 4, maxMs: 8 }, frameGap: { avgMs: 2, maxMs: 5 },
  spikeCount: 0, worstSpike: null, sections: [{ name: 'Lighting Engine', avgMs: 1.5, maxMs: 3, totalMs: 90, percent: 40 }],
  longTasksCount: 0, maxLongTaskMs: 0, diagnosis: '', events: [], gauges: {}, server: server(), ...over,
});

describe('diagnosePerformance', () => {
  it('finds nothing wrong when frames, ticks and network are within budget', () => {
    expect(diagnosePerformance(stats()).where).toBe('none');
  });

  it('blames the server when its ticks use most of the budget, naming the costliest step', () => {
    const verdict = diagnosePerformance(stats({ server: server({ loadPercent: 92, tickMs: { avg: 30.6, p95: 38, max: 60 }, steps: [{ name: 'fluids', avgMs: 18, maxMs: 40 }] }) }));
    expect(verdict.where).toBe('server');
    expect(verdict.detail).toContain('fluids');
  });

  it('blames the server when one tick in twenty runs over budget even if the average is low', () => {
    expect(diagnosePerformance(stats({ server: server({ tickMs: { avg: 10, p95: 40, max: 90 } }) })).where).toBe('server');
  });

  it('reports uneven tick arrival as a network problem, or a stalled server loop when that is the cause', () => {
    const gap = { name: 'Server Tick Interval', count: 30, perSecond: 30, avgMs: 40, maxMs: 300 };
    expect(diagnosePerformance(stats({ events: [gap] })).where).toBe('network');
    const stalled = diagnosePerformance(stats({ events: [gap], server: server({ loopGapMs: { avg: 50, max: 280 } }) }));
    expect(stalled.where).toBe('network');
    expect(stalled.detail).toContain('server');
  });

  it('blames the browser when drawing the scene dominates the frame, naming the number of objects', () => {
    const verdict = diagnosePerformance(stats({
      fps: { avg: 30, min: 20, max: 40 }, frameCpu: { avgMs: 27, maxMs: 40 }, gauges: { 'Drawable objects': 52530 },
      sections: [{ name: 'Pixi Stage Render', avgMs: 26, maxMs: 35, totalMs: 1, percent: 96 }],
    }));
    expect(verdict.where).toBe('client-cpu');
    expect(verdict.detail).toContain('52,530');
  });

  it('blames the browser, not the network, when long frames are what delays the ticks', () => {
    const gap = { name: 'Server Tick Interval', count: 30, perSecond: 30, avgMs: 40, maxMs: 225 };
    expect(diagnosePerformance(stats({ frameCpu: { avgMs: 27, maxMs: 40 }, events: [gap] })).where).toBe('client-cpu');
  });

  it('blames client JavaScript when a section other than drawing is heavy', () => {
    const verdict = diagnosePerformance(stats({
      fps: { avg: 30, min: 20, max: 40 }, frameCpu: { avgMs: 24, maxMs: 40 },
      sections: [
        { name: 'Lighting Engine', avgMs: 15, maxMs: 15, totalMs: 1, percent: 60 },
        { name: 'Pixi Stage Render', avgMs: 8, maxMs: 20, totalMs: 1, percent: 30 },
      ],
    }));
    expect(verdict.where).toBe('client-cpu');
    expect(verdict.detail).toContain('Lighting Engine');
  });

  it('blames the GPU when frames are slow but our code is fast', () => {
    const verdict = diagnosePerformance(stats({ fps: { avg: 25, min: 20, max: 30 }, frameCpu: { avgMs: 3, maxMs: 6 }, frameGap: { avgMs: 37, maxMs: 60 }, gauges: { 'Drawable objects': 36000 } }));
    expect(verdict.where).toBe('gpu');
    expect(verdict.detail).toContain('36000');
  });

  it('still works when the server has not reported yet', () => {
    expect(diagnosePerformance(stats({ server: null })).where).toBe('none');
  });
});

describe('buildPerfReport', () => {
  it('bundles the verdict, the stats and the environment', () => {
    const report = buildPerfReport(stats(), { userAgent: 'test', pixelRatio: 2 });
    expect(report).toMatchObject({ environment: { userAgent: 'test', pixelRatio: 2 }, verdict: { where: 'none' } });
    expect(report.stats).toBeDefined();
    expect(typeof report.capturedAt).toBe('string');
  });
});
