import React from 'react';
import type { MissionResultView } from '@mine-me/shared';
import { formatProgress } from '@mine-me/shared';
import { Modal } from '../../../../components/Modal/Modal';
import './MissionResults.css';

export interface MissionResultsProps {
  isOpen: boolean;
  /** How the run's mission went. Without one there is nothing to show. */
  result: MissionResultView | null;
  onClose: () => void;
}

const HEADLINE: Record<MissionResultView['outcome'], { text: string; style: string }> = {
  paid: { text: 'Mission Complete', style: 'text-emerald-400' },
  completed: { text: 'Mission Complete', style: 'text-emerald-400' },
  unfinished: { text: 'Mission Unfinished', style: 'text-amber-400' },
  failed: { text: 'Mission Failed', style: 'text-rose-400' },
};

/**
 * What the run's mission came to, shown when the run ends: each objective done or not, what was paid on a safe exit (or why
 * nothing was), and in a team who did how much of each objective.
 */
export const MissionResults: React.FC<MissionResultsProps> = ({ isOpen, result, onClose }) => {
  if (!result) return null;
  const headline = HEADLINE[result.outcome];
  const reward = result.reward;
  const shared = result.contributions.length > 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={<span className={`flex items-center gap-2 ${headline.style}`}>🎯 {headline.text}</span>} maxWidthClass="max-w-lg">
      <div className="mission-results flex flex-col gap-4" data-testid="mission-results">
        <div>
          <p className="text-base font-bold text-white">{result.name}</p>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Tier {result.tier}</p>
        </div>

        <ul className="space-y-2" aria-label="Objectives">
          {result.objectives.map((o, i) => (
            <li key={`${o.label}-${i}`} className="flex items-start justify-between gap-3 text-sm">
              <span className={o.done ? 'text-emerald-300 font-semibold' : 'text-slate-300'}>{o.done ? '✔' : '✘'} {o.label}</span>
              <span className="text-xs font-black text-slate-400 shrink-0">{formatProgress(o.unit, o.progress, o.target)}</span>
            </li>
          ))}
        </ul>

        {reward ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-sm text-emerald-100" data-testid="mission-reward">
            <p className="font-black uppercase text-[10px] tracking-widest text-emerald-400 mb-1">Reward paid</p>
            <p>{reward.coins} coins, {reward.xp} XP</p>
            {reward.items.map((item) => (
              <p key={item.itemId}>{item.itemName} x{item.quantity}</p>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-300" data-testid="mission-no-reward">
            {result.reason ?? (result.outcome === 'completed' ? 'The reward was already paid.' : 'Nothing was paid.')}
          </div>
        )}

        {shared && (
          <table className="w-full text-left text-xs" aria-label="Contributions">
            <thead>
              <tr className="text-slate-400 uppercase tracking-wider font-black">
                <th className="py-1 pr-3">Player</th>
                {result.objectives.map((_, i) => (
                  <th key={i} className="py-1 px-2">#{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-200 font-semibold">
              {result.contributions.map((c) => (
                <tr key={c.characterId}>
                  <td className="py-1 pr-3">{c.characterName}</td>
                  {c.amounts.map((a, i) => (
                    <td key={i} className="py-1 px-2">{a}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black uppercase tracking-widest rounded-lg cursor-pointer transition-all active:scale-95"
          >
            Continue
          </button>
        </div>
      </div>
    </Modal>
  );
};
