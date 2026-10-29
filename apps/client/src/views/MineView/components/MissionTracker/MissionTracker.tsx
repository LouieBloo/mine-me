import React, { useState } from 'react';
import { formatProgress, progressFraction, type MissionClientState } from '@mine-me/shared';
import './MissionTracker.css';

export interface MissionTrackerProps {
  mission: MissionClientState;
}

/**
 * The run's mission in the HUD: its name, each objective with a progress bar (a count, a percent or a depth) and a check mark
 * when done. It can be folded away to a one-line summary. When everything is done it says to leave the mine to claim the reward.
 */
export const MissionTracker: React.FC<MissionTrackerProps> = ({ mission }) => {
  const [collapsed, setCollapsed] = useState(false);
  const doneCount = mission.objectives.filter((o) => o.done).length;

  return (
    <div
      className={`mission-tracker w-72 rounded-xl border shadow-2xl backdrop-blur-md ${mission.completed ? 'bg-emerald-950/90 border-emerald-500/60' : 'bg-slate-900/90 border-slate-700/80'}`}
      data-testid="mission-tracker"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show the mission' : 'Fold the mission away'}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 rounded-xl transition-colors text-left"
      >
        <span className="flex flex-col min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">{mission.completed ? 'Mission Complete' : `Mission · Tier ${mission.tier}`}</span>
          <span className="text-sm font-bold text-white truncate">{mission.name}</span>
        </span>
        <span className="text-[11px] font-black text-slate-300 shrink-0">
          {doneCount}/{mission.objectives.length} {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {!collapsed && (
        <ul className="px-3 pb-3 space-y-2" aria-label="Objectives">
          {mission.objectives.map((o, i) => (
            <li key={`${o.label}-${i}`} className="flex flex-col gap-1" data-testid={`mission-objective-${i}`}>
              <div className="flex items-start justify-between gap-2 text-xs">
                <span className={`font-semibold ${o.done ? 'text-emerald-300 line-through decoration-emerald-500/60' : 'text-slate-200'}`}>
                  {o.done ? '✔ ' : ''}{o.label}
                </span>
                <span className="font-black text-slate-400 shrink-0">{formatProgress(o.unit, o.progress, o.target)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progressFraction(o.progress, o.target) * 100)}
                  className={`h-full transition-all duration-300 ${o.done ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${progressFraction(o.progress, o.target) * 100}%` }}
                />
              </div>
            </li>
          ))}
          {mission.completed && <li className="text-[11px] font-bold text-emerald-300 pt-1">Done! Leave the mine safely to claim the reward.</li>}
        </ul>
      )}
    </div>
  );
};
