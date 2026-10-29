import React from 'react';
import type { MissionOfferView, MissionRewardView } from '@mine-me/shared';
import './MissionPicker.css';

export interface MissionPickerProps {
  offers: MissionOfferView[];
  /** Id of the chosen mission, or null for none yet. */
  selected: string | null;
  onSelect: (missionId: string) => void;
}

const TIER_STYLE: Record<number, string> = {
  1: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
  2: 'bg-amber-950/80 border-amber-500/40 text-amber-300',
  3: 'bg-rose-950/80 border-rose-500/40 text-rose-300',
};

/** "30 Sol, 20 XP, Copperium x1-3 (50%)": a reward as one line. */
export const rewardText = (reward: MissionRewardView): string => {
  const parts: string[] = [];
  if (reward.sol > 0) parts.push(`${reward.sol} Sol`);
  if (reward.xp > 0) parts.push(`${reward.xp} XP`);
  for (const item of reward.items) {
    const qty = item.minQuantity === item.maxQuantity ? `${item.minQuantity}` : `${item.minQuantity}-${item.maxQuantity}`;
    parts.push(`${item.itemName} x${qty}${item.chance < 100 ? ` (${Math.round(item.chance)}%)` : ''}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'No reward';
};

/**
 * The missions a run offers: one card each with its name, tier, what to do and what it pays. Pick one before the mine is made.
 * There is no re-roll: the same offers come back every time they are asked for.
 */
export const MissionPicker: React.FC<MissionPickerProps> = ({ offers, selected, onSelect }) => (
  <ul className="mission-picker grid grid-cols-1 gap-3" data-testid="mission-picker" aria-label="Missions on offer">
    {offers.map((offer) => {
      const isSelected = offer.id === selected;
      return (
        <li key={offer.id}>
          <button
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(offer.id)}
            className={`mission-card w-full text-left p-4 rounded-xl border-2 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              isSelected ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800/80 hover:border-amber-500/60 hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center justify-between gap-3 mb-2">
              <span className="font-bold text-white text-base">{offer.name}</span>
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${TIER_STYLE[offer.tier] ?? TIER_STYLE[3]}`}>Tier {offer.tier}</span>
            </span>
            {offer.description && <span className="block text-xs text-slate-400 mb-2">{offer.description}</span>}
            <span className="block text-sm text-slate-200">
              {offer.objectives.map((o, i) => (
                <span key={`${o.label}-${i}`} className="block">• {o.label}</span>
              ))}
            </span>
            <span className="block mt-2 text-xs font-bold text-amber-300">Reward: {rewardText(offer.reward)}</span>
          </button>
        </li>
      );
    })}
  </ul>
);
