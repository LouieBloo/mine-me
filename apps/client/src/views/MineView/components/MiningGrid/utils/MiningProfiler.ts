/**
 * MiningProfiler
 * Tracks frame rate (current, avg, min, max), frame execution times,
 * individual simulation section timings, browser long tasks (>50ms),
 * and memory/GC events. Reports aggregate performance metrics periodically
 * (e.g. every 5 seconds) without console flooding.
 */

export interface ProfilerSectionStat {
  name: string;
  avgMs: number;
  maxMs: number;
  totalMs: number;
  percent: number;
}

export interface SpikeEvent {
  timestamp: number;
  intervalMs: number;
  cpuMs: number;
  gapMs: number;
  heapUsedMb?: number;
  heapDeltaMb?: number;
  longTaskDuration?: number;
  longTaskAttribution?: string;
}

export interface ProfilerStats {
  frameCount: number;
  durationSeconds: number;
  fps: {
    avg: number;
    min: number;
    max: number;
  };
  frameCpu: {
    avgMs: number;
    maxMs: number;
  };
  frameGap: {
    avgMs: number;
    maxMs: number;
  };
  spikeCount: number;
  worstSpike: SpikeEvent | null;
  sections: ProfilerSectionStat[];
  longTasksCount: number;
  maxLongTaskMs: number;
  diagnosis: string;
}

export class MiningProfiler {
  private logIntervalMs: number = 5000;
  private lastLogTime: number = 0;
  private lastFrameTime: number = 0;
  private currentFrameStart: number = 0;
  private lastFrameCpu: number = 0;

  private frameCount: number = 0;
  private frameDeltas: number[] = [];
  private frameCpuTimes: number[] = [];
  private frameGaps: number[] = [];

  private activeSectionName: string | null = null;
  private activeSectionStart: number = 0;

  private sectionTotals: Map<string, number> = new Map();
  private sectionSpikes: Map<string, number> = new Map();
  private currentFrameSections: Map<string, number> = new Map();

  private spikeEvents: SpikeEvent[] = [];
  private longTasks: { duration: number; startTime: number; attribution: string }[] = [];
  private longTaskObserver: any = null;

  private lastHeapBytes: number = 0;
  public enabled: boolean = true;

  constructor(logIntervalMs: number = 5000) {
    this.logIntervalMs = logIntervalMs;
    this.initLongTaskObserver();
  }

  /**
   * Listen to browser long tasks (> 50ms) if supported by the browser.
   */
  private initLongTaskObserver(): void {
    if (
      typeof window !== 'undefined' &&
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      try {
        this.longTaskObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            const attribution = (entry as any).attribution?.[0]?.name || entry.name || 'script';
            this.longTasks.push({
              duration: entry.duration,
              startTime: entry.startTime,
              attribution,
            });
          }
        });
        this.longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch {
        // LongTask observer unavailable or restricted
      }
    }
  }

  /**
   * Query JS heap memory in Chromium browsers.
   */
  private getHeapMb(): number | undefined {
    if (typeof performance !== 'undefined' && (performance as any).memory?.usedJSHeapSize) {
      return (performance as any).memory.usedJSHeapSize / (1024 * 1024);
    }
    return undefined;
  }

  /**
   * Called at the start of a frame tick.
   */
  public beginFrame(now: number = performance.now()): void {
    if (!this.enabled) return;

    if (this.lastLogTime === 0) {
      this.lastLogTime = now;
      const initialHeap = this.getHeapMb();
      if (initialHeap !== undefined) {
        this.lastHeapBytes = initialHeap;
      }
    }

    if (this.lastFrameTime > 0) {
      const delta = now - this.lastFrameTime;
      // Filter out huge background-tab pause gaps (> 1000ms)
      if (delta > 0 && delta < 1000) {
        this.frameDeltas.push(delta);
        const gap = Math.max(0, delta - this.lastFrameCpu);
        this.frameGaps.push(gap);

        // Detect frame drop / stutter (interval > 50ms is < 20 FPS)
        if (delta > 50) {
          const currentHeap = this.getHeapMb();
          let heapDeltaMb: number | undefined;
          if (currentHeap !== undefined && this.lastHeapBytes > 0) {
            heapDeltaMb = currentHeap - this.lastHeapBytes;
          }
          if (currentHeap !== undefined) {
            this.lastHeapBytes = currentHeap;
          }

          // Check if any browser longtask coincided with this frame
          const matchingTask = this.longTasks.find(
            (t) => Math.abs(t.startTime - (now - delta)) < delta + 10
          );

          this.spikeEvents.push({
            timestamp: now,
            intervalMs: delta,
            cpuMs: this.lastFrameCpu,
            gapMs: gap,
            heapUsedMb: currentHeap,
            heapDeltaMb,
            longTaskDuration: matchingTask?.duration,
            longTaskAttribution: matchingTask?.attribution,
          });
        }
      }
    }

    this.lastFrameTime = now;
    this.currentFrameStart = now;
    this.currentFrameSections.clear();
    this.activeSectionName = null;
  }

  /**
   * Start measuring a named simulation section.
   */
  public startSection(name: string, now: number = performance.now()): void {
    if (!this.enabled) return;
    if (this.activeSectionName) {
      this.endSection(now);
    }
    this.activeSectionName = name;
    this.activeSectionStart = now;
  }

  /**
   * End measuring the current simulation section.
   */
  public endSection(now: number = performance.now()): void {
    if (!this.enabled || !this.activeSectionName) return;
    const duration = Math.max(0, now - this.activeSectionStart);
    const prev = this.currentFrameSections.get(this.activeSectionName) || 0;
    this.currentFrameSections.set(this.activeSectionName, prev + duration);
    this.activeSectionName = null;
  }

  /**
   * Record external metric (e.g. tile reveal or socket event processing).
   */
  public recordExternal(name: string, durationMs: number): void {
    if (!this.enabled) return;
    const prevTotal = this.sectionTotals.get(name) || 0;
    this.sectionTotals.set(name, prevTotal + durationMs);

    const prevMax = this.sectionSpikes.get(name) || 0;
    if (durationMs > prevMax) {
      this.sectionSpikes.set(name, durationMs);
    }
  }

  /**
   * Called at the end of a frame tick. Checks if periodic log should fire.
   */
  public endFrame(now: number = performance.now()): void {
    if (!this.enabled) return;

    if (this.activeSectionName) {
      this.endSection(now);
    }

    const frameCpu = Math.max(0, now - this.currentFrameStart);
    this.lastFrameCpu = frameCpu;
    this.frameCpuTimes.push(frameCpu);
    this.frameCount++;

    // Accumulate section times from this frame
    for (const [name, duration] of this.currentFrameSections.entries()) {
      const prevTotal = this.sectionTotals.get(name) || 0;
      this.sectionTotals.set(name, prevTotal + duration);

      const prevMax = this.sectionSpikes.get(name) || 0;
      if (duration > prevMax) {
        this.sectionSpikes.set(name, duration);
      }
    }

    // Check if reporting interval has elapsed
    if (now - this.lastLogTime >= this.logIntervalMs) {
      this.report(now);
      this.reset(now);
    }
  }

  /**
   * Calculate summary statistics and root-cause diagnosis.
   */
  public getStats(now: number = performance.now()): ProfilerStats {
    const durationSeconds = Math.max(0.001, (now - this.lastLogTime) / 1000);
    const count = this.frameCount;

    // Calculate FPS metrics
    let avgFps = 0;
    let minFps = 0;
    let maxFps = 0;

    if (this.frameDeltas.length > 0) {
      const fpsList = this.frameDeltas.map((d) => 1000 / d);
      const totalDelta = this.frameDeltas.reduce((a, b) => a + b, 0);
      avgFps = (this.frameDeltas.length / totalDelta) * 1000;
      minFps = Math.min(...fpsList);
      maxFps = Math.max(...fpsList);
    } else if (count > 0) {
      avgFps = count / durationSeconds;
      minFps = avgFps;
      maxFps = avgFps;
    }

    // Calculate frame CPU time metrics
    let avgCpuMs = 0;
    let maxCpuMs = 0;
    if (this.frameCpuTimes.length > 0) {
      const totalCpu = this.frameCpuTimes.reduce((a, b) => a + b, 0);
      avgCpuMs = totalCpu / this.frameCpuTimes.length;
      maxCpuMs = Math.max(...this.frameCpuTimes);
    }

    // Calculate frame gap time metrics (time outside ticker)
    let avgGapMs = 0;
    let maxGapMs = 0;
    if (this.frameGaps.length > 0) {
      const totalGap = this.frameGaps.reduce((a, b) => a + b, 0);
      avgGapMs = totalGap / this.frameGaps.length;
      maxGapMs = Math.max(...this.frameGaps);
    }

    // Find worst spike event
    let worstSpike: SpikeEvent | null = null;
    for (const spike of this.spikeEvents) {
      if (!worstSpike || spike.intervalMs > worstSpike.intervalMs) {
        worstSpike = spike;
      }
    }

    // Long tasks summary
    const maxLongTask = this.longTasks.length > 0
      ? Math.max(...this.longTasks.map((t) => t.duration))
      : 0;

    // Determine diagnosis
    let diagnosis = 'Smooth performance. No significant bottlenecks detected.';
    if (worstSpike && worstSpike.intervalMs > 50) {
      if (worstSpike.cpuMs > 25) {
        // Ticker CPU code is actually heavy
        const topSection = Array.from(this.sectionSpikes.entries()).sort((a, b) => b[1] - a[1])[0];
        diagnosis = `JavaScript CPU bottleneck inside ticker (${topSection ? topSection[0] : 'unknown'} took ${topSection ? topSection[1].toFixed(1) : ''}ms).`;
      } else if (worstSpike.longTaskDuration && worstSpike.longTaskDuration > 40) {
        diagnosis = `Browser Main Thread blocked by non-ticker JavaScript Long Task (${worstSpike.longTaskDuration.toFixed(1)}ms in ${worstSpike.longTaskAttribution || 'script'}).`;
      } else if (worstSpike.heapDeltaMb !== undefined && worstSpike.heapDeltaMb < -5) {
        diagnosis = `V8 Major Garbage Collection pause detected (Heap dropped ${Math.abs(worstSpike.heapDeltaMb).toFixed(1)}MB right during the ${worstSpike.intervalMs.toFixed(0)}ms freeze).`;
      } else {
        diagnosis = `GPU Pipeline / WebGL Render Stall. Total Frame CPU (simulation + Pixi render) executed in only ${worstSpike.cpuMs.toFixed(2)}ms, but the browser/GPU waited ${worstSpike.gapMs.toFixed(1)}ms to flush graphics or swap buffers.`;
      }
    }

    // Calculate total section time to compute percentages
    const totalSectionTime = Array.from(this.sectionTotals.values()).reduce((a, b) => a + b, 0);

    const sections: ProfilerSectionStat[] = Array.from(this.sectionTotals.entries())
      .map(([name, totalMs]) => ({
        name,
        totalMs,
        avgMs: count > 0 ? totalMs / count : 0,
        maxMs: this.sectionSpikes.get(name) || 0,
        percent: totalSectionTime > 0 ? (totalMs / totalSectionTime) * 100 : 0,
      }))
      .sort((a, b) => b.avgMs - a.avgMs);

    return {
      frameCount: count,
      durationSeconds,
      fps: {
        avg: Math.round(avgFps * 10) / 10,
        min: Math.round(minFps * 10) / 10,
        max: Math.round(maxFps * 10) / 10,
      },
      frameCpu: {
        avgMs: Math.round(avgCpuMs * 100) / 100,
        maxMs: Math.round(maxCpuMs * 100) / 100,
      },
      frameGap: {
        avgMs: Math.round(avgGapMs * 100) / 100,
        maxMs: Math.round(maxGapMs * 100) / 100,
      },
      spikeCount: this.spikeEvents.length,
      worstSpike,
      sections,
      longTasksCount: this.longTasks.length,
      maxLongTaskMs: Math.round(maxLongTask * 10) / 10,
      diagnosis,
    };
  }

  /**
   * Outputs formatted periodic diagnostics to console.
   */
  public report(now: number = performance.now()): void {
    const stats = this.getStats(now);
    if (stats.frameCount === 0) return;

    const fpsColor = stats.fps.min < 30 ? '#ef4444' : stats.fps.min < 50 ? '#f59e0b' : '#22c55e';
    const header = `%c[Mining Profiler (${Math.round(stats.durationSeconds)}s)]%c FPS: ${stats.fps.avg.toFixed(1)} (min: ${stats.fps.min.toFixed(1)}, max: ${stats.fps.max.toFixed(1)}) | Frame CPU: ${stats.frameCpu.avgMs.toFixed(2)}ms (peak: ${stats.frameCpu.maxMs.toFixed(2)}ms) | Frame Gap (Browser/GPU): avg ${stats.frameGap.avgMs.toFixed(1)}ms (peak: ${stats.frameGap.maxMs.toFixed(1)}ms)`;

    const sectionLines = stats.sections.length > 0
      ? stats.sections
          .map(
            (s, idx) =>
              `  ${idx + 1}. ${s.name.padEnd(22)} avg: ${s.avgMs.toFixed(2)}ms | peak: ${s.maxMs.toFixed(2)}ms (${s.percent.toFixed(1)}%)`
          )
          .join('\n')
      : '  (No sections instrumented)';

    let spikeLine = '';
    if (stats.spikeCount > 0 && stats.worstSpike) {
      spikeLine = `\n  🚨 Spikes Detected: ${stats.spikeCount} frame drops (< 20 FPS). Worst: ${stats.worstSpike.intervalMs.toFixed(1)}ms interval (Ticker CPU: ${stats.worstSpike.cpuMs.toFixed(2)}ms, Browser/GPU Gap: ${stats.worstSpike.gapMs.toFixed(1)}ms)`;
    }

    const diagnosisLine = `\n  🔍 Root Cause Analysis: ${stats.diagnosis}`;

    console.log(
      `${header}\n  Simulation & Render Breakdown:\n${sectionLines}${spikeLine}${diagnosisLine}`,
      'font-weight: bold; color: #38bdf8;',
      `font-weight: bold; color: ${fpsColor};`
    );
  }

  /**
   * Reset stats for the next measurement interval.
   */
  public reset(now: number = performance.now()): void {
    this.lastLogTime = now;
    this.frameCount = 0;
    this.frameDeltas = [];
    this.frameCpuTimes = [];
    this.frameGaps = [];
    this.sectionTotals.clear();
    this.sectionSpikes.clear();
    this.currentFrameSections.clear();
    this.spikeEvents = [];
    this.longTasks = [];
  }

  public destroy(): void {
    if (this.longTaskObserver) {
      this.longTaskObserver.disconnect();
      this.longTaskObserver = null;
    }
  }
}

// Global shared instance for mining view
export const miningProfiler = new MiningProfiler(5000);
