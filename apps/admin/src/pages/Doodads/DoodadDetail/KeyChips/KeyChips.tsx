import React from 'react';
import './KeyChips.css';

export interface KeyChipOption {
  key: string;
  label: string;
}

interface KeyChipsProps {
  /** Heading, and a line saying what the choice means. */
  title: string;
  hint: string;
  /** Unique within the page: the group's label and the chips' ids come from it. */
  id: string;
  options: KeyChipOption[];
  /** The chosen keys; null/absent is none. */
  value: string[] | null | undefined;
  onChange: (value: string[]) => void;
  emptyText?: string;
}

/** A pick-any-of-these row of toggle chips (blocks a doodad can sit on, fluids it must be near...). */
const KeyChips: React.FC<KeyChipsProps> = ({ title, hint, id, options, value, onChange, emptyText = 'Nothing to pick from yet.' }) => {
  const chosen = value ?? [];
  const toggle = (key: string) => onChange(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]);
  // A key the options no longer know (a deleted fluid) stays visible so it can be taken off
  const unknown = chosen.filter((k) => !options.some((o) => o.key === k));
  const all = [...options, ...unknown.map((k) => ({ key: k, label: `${k} (unknown)` }))];

  return (
    <div className="key-chips space-y-2">
      <div>
        <h5 id={`${id}-title`} className="text-xs font-black uppercase tracking-wider text-slate-700">{title}</h5>
        <p className="text-[11px] text-slate-400 font-medium">{hint}</p>
      </div>
      {all.length === 0 ? (
        <p className="text-xs text-slate-400 font-semibold italic">{emptyText}</p>
      ) : (
        <div role="group" aria-labelledby={`${id}-title`} className="flex flex-wrap gap-2">
          {all.map((option) => {
            const on = chosen.includes(option.key);
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(option.key)}
                className={`cursor-pointer px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
                  on ? 'bg-slate-900 border-slate-900 text-white hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-400'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KeyChips;
