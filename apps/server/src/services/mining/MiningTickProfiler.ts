import type { MiningServerPerf } from '@mine-me/shared';

const now = () => performance.now();

/** Ticks one report covers: two seconds at 30 Hz, enough to smooth noise yet show a spike soon after it happens. */
const WINDOW_TICKS = 60;

/**
 * Times a room's simulation. Every step of a tick is measured by name, plus the tick as a whole and the gap
 * between loop wake-ups, over a rolling window. It is always on (a handful of clock reads per tick) because
 * a lag report is only useful if the numbers were being kept when the lag happened.
 */
export class MiningTickProfiler {
  private readonly tickTimes: number[] = [];
  private readonly loopGaps: number[] = [];
  /** Per-step cost of each tick in the window, oldest first. */
  private readonly stepHistory: Map<string, number>[] = [];
  private current = new Map<string, number>();
  private tickStart = 0;
  private lastLoopAt = 0;
  private lastPayloadBytes = 0;
  private lastWarnAt = 0;

  constructor(
    private readonly budgetMs: number,
    private readonly warn: (message: string) => void = (m) => console.warn(m)
  ) {}

  /** Call each time the room's loop wakes up. */
  public noteLoop(at: number = now()): void {
    if (this.lastLoopAt > 0) this.push(this.loopGaps, at - this.lastLoopAt);
    this.lastLoopAt = at;
  }

  public beginTick(at: number = now()): void {
    this.tickStart = at;
    this.current = new Map();
  }

  /** Runs `step` and records how long it took under `name`. Any error passes through. */
  public time<T>(name: string, step: () => T): T {
    const start = now();
    try {
      return step();
    } finally {
      this.recordStep(name, now() - start);
    }
  }

  public recordStep(name: string, ms: number): void {
    this.current.set(name, (this.current.get(name) ?? 0) + ms);
  }

  /** Call when the tick is done. A tick over budget is logged (at most every 10 s) with its costliest steps. */
  public endTick(at: number = now()): void {
    const ms = at - this.tickStart;
    this.push(this.tickTimes, ms);
    this.stepHistory.push(this.current);
    if (this.stepHistory.length > WINDOW_TICKS) this.stepHistory.shift();
    if (ms > this.budgetMs && at - this.lastWarnAt > 10_000) {
      this.lastWarnAt = at;
      const worst = [...this.current.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([name, v]) => `${name} ${v.toFixed(1)}ms`).join(', ');
      this.warn(`[Mining] Slow tick: ${ms.toFixed(1)}ms of a ${this.budgetMs.toFixed(1)}ms budget (${worst})`);
    }
  }

  /** The size of a state tick, sampled by the engine now and then (measuring every one would itself cost). */
  public notePayloadBytes(bytes: number): void {
    this.lastPayloadBytes = bytes;
  }

  public snapshot(droppedTicks: number, counts: Record<string, number>): MiningServerPerf {
    const sorted = [...this.tickTimes].sort((a, b) => a - b);
    const avg = this.mean(this.tickTimes);
    const totals = new Map<string, { total: number; max: number }>();
    for (const tick of this.stepHistory) {
      for (const [name, ms] of tick) {
        const t = totals.get(name) ?? { total: 0, max: 0 };
        t.total += ms;
        t.max = Math.max(t.max, ms);
        totals.set(name, t);
      }
    }
    const steps = [...totals.entries()]
      .map(([name, t]) => ({ name, avgMs: round(t.total / Math.max(1, this.stepHistory.length)), maxMs: round(t.max) }))
      .sort((a, b) => b.avgMs - a.avgMs);
    return {
      windowTicks: sorted.length,
      budgetMs: round(this.budgetMs),
      tickMs: { avg: round(avg), p95: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0), max: round(sorted[sorted.length - 1] ?? 0) },
      loadPercent: Math.round((avg / this.budgetMs) * 100),
      loopGapMs: { avg: round(this.mean(this.loopGaps)), max: round(Math.max(0, ...this.loopGaps)) },
      steps,
      droppedTicks,
      counts,
      payloadBytes: this.lastPayloadBytes,
    };
  }

  private push(list: number[], value: number): void {
    list.push(value);
    if (list.length > WINDOW_TICKS) list.shift();
  }

  private mean(list: number[]): number {
    return list.length === 0 ? 0 : list.reduce((a, b) => a + b, 0) / list.length;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
