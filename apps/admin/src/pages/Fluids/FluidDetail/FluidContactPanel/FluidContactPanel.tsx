import React from 'react';
import type { FluidContactEffects } from '@mine-me/shared';
import './FluidContactPanel.css';

interface FluidContactPanelProps {
  /** Null means touching the fluid does nothing special. */
  value: FluidContactEffects | null | undefined;
  onChange: (value: FluidContactEffects | null) => void;
}

const inputClass = 'w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';

const readNumber = (raw: string): number => (raw === '' ? NaN : Number(raw));
const show = (n: number | undefined): number | '' => (typeof n === 'number' && Number.isFinite(n) ? n : '');

/** True when nothing is set, so the fluid can be saved as "no contact effects" (null). */
const isEmpty = (c: FluidContactEffects): boolean => !(c.damagePerSecond && c.damagePerSecond > 0) && !(c.ignites && c.ignites > 0) && !c.extinguishes;

/** What touching the fluid does to players and mobs: hurts them, sets them alight, or puts them out. */
export const FluidContactPanel: React.FC<FluidContactPanelProps> = ({ value, onChange }) => {
  const current: FluidContactEffects = value ?? {};
  const update = (patch: Partial<FluidContactEffects>) => {
    const next = { ...current, ...patch };
    // Ignite and extinguish cancel each other, so switching one on switches the other off
    if (patch.extinguishes) next.ignites = 0;
    if (patch.ignites && patch.ignites > 0) next.extinguishes = false;
    onChange(isEmpty(next) ? null : next);
  };

  return (
    <div className="fluid-contact-panel bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Contact Effects</h4>
        <p className="text-xs text-slate-500 font-medium">What the fluid does to players and mobs standing in it (lava burns, water puts fires out)</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1">
          <label htmlFor="contact-damage" className={labelClass}>Damage Per Second</label>
          <input id="contact-damage" type="number" min={0} step={1} className={inputClass} value={show(current.damagePerSecond)} placeholder="0" onChange={(e) => update({ damagePerSecond: readNumber(e.target.value) })} />
          <span className="text-[11px] text-slate-400 font-medium">At full submersion; wading shallow hurts less</span>
        </div>
        <div className="space-y-1">
          <label htmlFor="contact-ignites" className={labelClass}>Ignites (strength %)</label>
          <input id="contact-ignites" type="number" min={0} max={1000} step={5} className={inputClass} value={show(current.ignites)} placeholder="0" onChange={(e) => update({ ignites: readNumber(e.target.value) })} />
          <span className="text-[11px] text-slate-400 font-medium">Above 0, anything in it catches fire</span>
        </div>
        <label className="flex items-center gap-3 cursor-pointer bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl transition-colors sm:col-span-2">
          <input
            type="checkbox"
            aria-label="Puts out fires"
            checked={Boolean(current.extinguishes)}
            onChange={(e) => update({ extinguishes: e.target.checked })}
            className="w-5 h-5 rounded cursor-pointer accent-sky-600"
          />
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">Puts out burning bodies</span>
        </label>
      </div>
    </div>
  );
};

export default FluidContactPanel;
