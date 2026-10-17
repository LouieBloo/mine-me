import React from 'react';
import type { FluidReaction } from '@mine-me/shared';
import './FluidReactionsPanel.css';

interface Option {
  typeKey: string;
  name: string;
}

interface FluidReactionsPanelProps {
  /** Null (or empty) means the fluid reacts with nothing. */
  value: FluidReaction[] | null | undefined;
  onChange: (value: FluidReaction[] | null) => void;
  /** The other fluids a reaction can be set off by. */
  fluids: Option[];
  /** The blocks a reacting cell can turn into. */
  blocks: Option[];
}

const selectClass = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-800';
const inputClass = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';

/** How the fluid reacts when another fluid touches it, e.g. lava turning to lavarock under water. */
export const FluidReactionsPanel: React.FC<FluidReactionsPanelProps> = ({ value, onChange, fluids, blocks }) => {
  const list = value ?? [];
  const emit = (next: FluidReaction[]) => onChange(next.length > 0 ? next : null);
  const patch = (index: number, change: Partial<FluidReaction>) => emit(list.map((r, i) => (i === index ? { ...r, ...change } : r)));
  const add = () => emit([...list, { with: fluids[0]?.typeKey ?? '', becomes: blocks[0]?.typeKey ?? '', costPerLevel: 1 }]);

  return (
    <div className="fluid-reactions-panel bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Reactions</h4>
          <p className="text-xs text-slate-500 font-medium">What happens where another fluid touches this one: both are used up and the cell turns into a block</p>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={fluids.length === 0 || blocks.length === 0}
          className="self-start sm:self-auto bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add Reaction
        </button>
      </div>

      {list.length === 0 && <p className="text-xs text-slate-400 font-medium">No reactions</p>}

      {list.map((reaction, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_8rem_auto] gap-3 items-end bg-white border border-slate-200 rounded-xl p-4">
          <div className="space-y-1">
            <label htmlFor={`reaction-with-${i}`} className={labelClass}>Touched By</label>
            <select id={`reaction-with-${i}`} className={selectClass} value={reaction.with} onChange={(e) => patch(i, { with: e.target.value })}>
              {!fluids.some((f) => f.typeKey === reaction.with) && <option value={reaction.with}>{reaction.with || 'Choose a fluid'}</option>}
              {fluids.map((f) => (
                <option key={f.typeKey} value={f.typeKey}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`reaction-becomes-${i}`} className={labelClass}>Turns Into</label>
            <select id={`reaction-becomes-${i}`} className={selectClass} value={reaction.becomes} onChange={(e) => patch(i, { becomes: e.target.value })}>
              {!blocks.some((b) => b.typeKey === reaction.becomes) && <option value={reaction.becomes}>{reaction.becomes || 'Choose a block'}</option>}
              {blocks.map((b) => (
                <option key={b.typeKey} value={b.typeKey}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`reaction-cost-${i}`} className={labelClass}>Cost Per Level</label>
            <input
              id={`reaction-cost-${i}`}
              type="number"
              min={0.1}
              step={0.1}
              className={inputClass}
              value={Number.isFinite(reaction.costPerLevel) ? reaction.costPerLevel : ''}
              onChange={(e) => patch(i, { costPerLevel: e.target.value === '' ? NaN : Number(e.target.value) })}
            />
          </div>
          <button
            type="button"
            aria-label={`Remove reaction ${i + 1}`}
            onClick={() => emit(list.filter((_, j) => j !== i))}
            className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-red-600 hover:bg-red-50 border border-red-200 cursor-pointer transition-colors"
          >
            Remove
          </button>
          <span className="sm:col-span-4 text-[11px] text-slate-400 font-medium">
            Each level of this fluid hardened uses up {Number.isFinite(reaction.costPerLevel) ? reaction.costPerLevel : '?'} level(s) of the other fluid
          </span>
        </div>
      ))}
    </div>
  );
};

export default FluidReactionsPanel;
