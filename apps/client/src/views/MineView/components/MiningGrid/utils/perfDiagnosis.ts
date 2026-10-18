import type { ProfilerStats } from './MiningProfiler';

/** Where the lag is coming from, and what to look at next. */
export interface PerfVerdict {
  where: 'server' | 'network' | 'client-cpu' | 'gpu' | 'none';
  headline: string;
  detail: string;
}

/** A frame at 60 FPS lasts 16.7ms; this much of it spent in our own code leaves little for the browser and GPU. */
const CLIENT_CPU_HEAVY_MS = 10;
const FRAME_BUDGET_MS = 1000 / 60;

/**
 * Reads one report and says which side is slow. Checked in the order the data flows: a slow or stalling server
 * makes everything after it look bad, so it is ruled out first.
 */
export function diagnosePerformance(stats: ProfilerStats): PerfVerdict {
  const server = stats.server;
  if (server && (server.loadPercent >= 80 || server.tickMs.p95 > server.budgetMs)) {
    const top = server.steps[0];
    return {
      where: 'server',
      headline: `The server is the bottleneck: ${server.tickMs.avg}ms per tick of ${server.budgetMs}ms (${server.loadPercent}% load)`,
      detail: top ? `Costliest step: ${top.name} at ${top.avgMs}ms (worst ${top.maxMs}ms).` : 'No step breakdown yet.',
    };
  }

  // Slow frames stall the page, which also delays reading the server's ticks, so check our own frames before blaming the network
  const heavy = stats.frameCpu.avgMs >= CLIENT_CPU_HEAVY_MS;
  if (heavy) {
    const top = stats.sections[0];
    const objects = stats.gauges['Drawable objects'] ?? stats.gauges['Display objects'];
    const drawing = top?.name === 'Pixi Stage Render';
    return {
      where: 'client-cpu',
      headline: `The browser is the bottleneck: ${stats.frameCpu.avgMs}ms of each frame (${stats.fps.avg} FPS)`,
      detail: drawing
        ? `Drawing the scene takes ${top.avgMs.toFixed(1)}ms per frame${objects !== undefined ? ` for ${objects.toLocaleString()} display objects` : ''}; fewer objects (culling, merging tiles) is the fix.`
        : top ? `Biggest section: ${top.name} at ${top.avgMs.toFixed(2)}ms per frame.` : 'No section breakdown yet.',
    };
  }

  const interval = stats.events.find((e) => e.name === 'Server Tick Interval');
  if (interval && interval.maxMs > 120) {
    return {
      where: 'network',
      headline: `Server ticks arrive unevenly: up to ${interval.maxMs}ms apart (they should be about ${server?.budgetMs ?? 33}ms)`,
      detail: server && server.loopGapMs.max > 100
        ? `The server's own loop stalled for ${server.loopGapMs.max}ms, so it is busy with other work, not the network.`
        : 'The server loop is steady, so the delay is in the network or the browser being busy.',
    };
  }

  if (stats.fps.avg > 0 && stats.fps.avg < 1000 / FRAME_BUDGET_MS * 0.85 && stats.frameGap.avgMs > FRAME_BUDGET_MS * 0.5) {
    const objects = stats.gauges['Drawable objects'];
    return {
      where: 'gpu',
      headline: `Frames are waiting on the GPU or the browser: ${stats.frameGap.avgMs}ms outside our code`,
      detail: objects !== undefined ? `${objects} objects are being drawn; fewer or batched objects would help.` : 'Check the scene counts below.',
    };
  }

  return { where: 'none', headline: 'No bottleneck found', detail: 'Frames, server ticks and network are all within budget.' };
}

/** Everything worth attaching to a bug report, as plain data. */
export function buildPerfReport(stats: ProfilerStats, environment: Record<string, string | number>): Record<string, unknown> {
  return { capturedAt: new Date().toISOString(), environment, verdict: diagnosePerformance(stats), stats };
}
