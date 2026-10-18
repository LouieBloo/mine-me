import React, { useCallback, useEffect, useState } from 'react';
import { BLOCK_SCALE } from '@mine-me/shared';
import { miningProfiler, type ProfilerStats } from '../MiningGrid/utils/MiningProfiler';
import { buildPerfReport, diagnosePerformance, type PerfVerdict } from '../MiningGrid/utils/perfDiagnosis';
import { notificationService } from '../../../../services/notificationService';
import './PerformanceOverlay.css';

/** How often the numbers refresh while the overlay is open. */
const REPORT_INTERVAL_MS = 1000;
const STORAGE_KEY = 'miningProfiler';

const VERDICT_COLOUR: Record<PerfVerdict['where'], string> = {
  none: 'text-emerald-400',
  server: 'text-red-400',
  network: 'text-orange-400',
  'client-cpu': 'text-red-400',
  gpu: 'text-orange-400',
};

/** Turns profiling on or off and remembers the choice for the next visit. */
export function setPerformanceOverlayOpen(open: boolean): void {
  miningProfiler.logToConsole = !open;
  miningProfiler.setReportInterval(open ? REPORT_INTERVAL_MS : 5000);
  miningProfiler.setEnabled(open);
  try {
    window.localStorage?.setItem(STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Storage blocked: the overlay still works, it just will not be remembered
  }
}

const fpsColour = (fps: number) => (fps < 30 ? 'text-red-400' : fps < 50 ? 'text-amber-400' : 'text-emerald-400');
const loadColour = (percent: number) => (percent >= 80 ? 'text-red-400' : percent >= 50 ? 'text-amber-400' : 'text-emerald-400');

const Row: React.FC<{ label: string; value: React.ReactNode; className?: string }> = ({ label, value, className }) => (
  <div className="flex justify-between gap-4">
    <span className="text-slate-400">{label}</span>
    <span className={className ?? 'text-white'}>{value}</span>
  </div>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-2 mb-0.5 text-[10px] font-black uppercase tracking-widest text-amber-500">{children}</div>
);

/** What the page knows about the machine, to attach to a copied report. */
function readEnvironment(): Record<string, string | number> {
  return {
    userAgent: navigator.userAgent,
    pixelRatio: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    cores: navigator.hardwareConcurrency ?? 0,
    blockScale: BLOCK_SCALE,
  };
}

/**
 * An on-screen performance panel for the mine, opened with F3 (or `?miningProfiler=1`). Shows frame rate, where each
 * frame goes, how the scene is sized, and what the server spends per tick, with a plain-words verdict on which side
 * is slow. "Copy report" puts everything on the clipboard as JSON to paste into a bug report.
 */
export const PerformanceOverlay: React.FC = () => {
  const [open, setOpen] = useState(miningProfiler.enabled);
  const [stats, setStats] = useState<ProfilerStats | null>(null);

  useEffect(() => {
    if (miningProfiler.enabled) setPerformanceOverlayOpen(true); // switched on by the URL flag: show it too
    const unsubscribe = miningProfiler.subscribe(setOpen);
    const unsubscribeReport = miningProfiler.onReport(setStats);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F3') return;
      e.preventDefault();
      setPerformanceOverlayOpen(!miningProfiler.enabled);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unsubscribe();
      unsubscribeReport();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const copyReport = useCallback(async () => {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildPerfReport(stats, readEnvironment()), null, 2));
      notificationService.success('Report copied', 'Paste it into a message to share the numbers.');
    } catch (err) {
      notificationService.error('Could not copy the report', err instanceof Error ? err.message : 'The browser blocked clipboard access.');
    }
  }, [stats]);

  if (!open) return null;

  const verdict = stats ? diagnosePerformance(stats) : null;
  const server = stats?.server;
  const sectionTotal = stats ? stats.sections.reduce((sum, s) => sum + s.avgMs, 0) : 0;

  return (
    <div
      data-testid="performance-overlay"
      className="performance-overlay pointer-events-auto fixed bottom-4 left-4 z-50 w-[360px] rounded-xl border border-slate-700/80 bg-slate-900/90 p-3 font-mono text-[11px] text-slate-200 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-widest text-amber-500">Performance (F3)</span>
        <div className="flex gap-1.5">
          <button
            onClick={copyReport}
            disabled={!stats}
            className="cursor-pointer rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-200 transition-colors hover:border-amber-500 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            title="Copy all the numbers as JSON"
          >
            Copy report
          </button>
          <button
            onClick={() => setPerformanceOverlayOpen(false)}
            className="cursor-pointer rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-200 transition-colors hover:border-red-500 hover:text-red-400"
            title="Close (F3)"
          >
            Close
          </button>
        </div>
      </div>

      {!stats && <div className="mt-2 text-slate-400">Collecting numbers for a second…</div>}

      {stats && verdict && (
        <>
          <div className={`mt-2 font-bold ${VERDICT_COLOUR[verdict.where]}`} data-testid="performance-verdict">{verdict.headline}</div>
          <div className="text-slate-400">{verdict.detail}</div>

          <Heading>Browser</Heading>
          <Row label="FPS" value={`${stats.fps.avg} (min ${stats.fps.min})`} className={fpsColour(stats.fps.avg)} />
          <Row label="Frame code" value={`${stats.frameCpu.avgMs}ms (peak ${stats.frameCpu.maxMs}ms)`} />
          <Row label="Waiting on GPU/browser" value={`${stats.frameGap.avgMs}ms (peak ${stats.frameGap.maxMs}ms)`} />
          {stats.spikeCount > 0 && <Row label="Frames under 20 FPS" value={stats.spikeCount} className="text-red-400" />}

          <Heading>Where each frame goes</Heading>
          {stats.sections.slice(0, 8).map((s) => (
            <div key={s.name}>
              <Row label={s.name} value={`${s.avgMs.toFixed(2)}ms (peak ${s.maxMs.toFixed(1)})`} />
              <div className="performance-overlay-bar" style={{ width: `${sectionTotal > 0 ? (s.avgMs / sectionTotal) * 100 : 0}%` }} />
            </div>
          ))}

          {stats.events.length > 0 && (
            <>
              <Heading>Now and then</Heading>
              {stats.events.map((e) => (
                <Row key={e.name} label={e.name} value={`${e.perSecond}/s · ${e.avgMs}ms (peak ${e.maxMs})`} />
              ))}
            </>
          )}

          {Object.keys(stats.gauges).length > 0 && (
            <>
              <Heading>Scene</Heading>
              {Object.entries(stats.gauges).map(([name, value]) => (
                <Row key={name} label={name} value={value.toLocaleString()} />
              ))}
            </>
          )}

          <Heading>Server</Heading>
          {server ? (
            <>
              <Row label="Tick" value={`${server.tickMs.avg}ms of ${server.budgetMs}ms (p95 ${server.tickMs.p95}, max ${server.tickMs.max})`} className={loadColour(server.loadPercent)} />
              <Row label="Load" value={`${server.loadPercent}%`} className={loadColour(server.loadPercent)} />
              <Row label="Loop gap" value={`avg ${server.loopGapMs.avg}ms, max ${server.loopGapMs.max}ms`} />
              <Row label="Tick message size" value={`${(server.payloadBytes / 1024).toFixed(1)} KB`} />
              {server.droppedTicks > 0 && <Row label="Dropped ticks" value={server.droppedTicks} className="text-red-400" />}
              {server.steps.slice(0, 6).map((s) => (
                <Row key={s.name} label={`  ${s.name}`} value={`${s.avgMs}ms (peak ${s.maxMs})`} />
              ))}
              {Object.entries(server.counts).map(([name, value]) => (
                <Row key={name} label={name} value={value.toLocaleString()} />
              ))}
            </>
          ) : (
            <div className="text-slate-400">Waiting for the server&apos;s first report…</div>
          )}
        </>
      )}
    </div>
  );
};
