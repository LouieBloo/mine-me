import React, { useState } from 'react';
import type { BiomeBlockSwap } from '@mine-me/shared';
import type { WeightOption } from '../../../../components/WeightTable/WeightTable';
import './BlockSwapsEditor.css';

interface BlockSwapsEditorProps {
  /** The swaps in the biome (null/absent: none). */
  value: BiomeBlockSwap[] | null | undefined;
  /** The blocks that can be swapped from and to. */
  blocks: WeightOption[];
  onChange: (value: BiomeBlockSwap[] | undefined) => void;
}

const selectClass = 'flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-800';

/** Base-block swaps: one kind of block becomes another across the biome (dirt into ice...), for a share or all of them. */
const BlockSwapsEditor: React.FC<BlockSwapsEditorProps> = ({ value, blocks, onChange }) => {
  const swaps = value ?? [];
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const fromKey = blocks.some((b) => b.key === from) ? from : blocks[0]?.key ?? '';
  const toKey = blocks.some((b) => b.key === to) ? to : blocks[1]?.key ?? blocks[0]?.key ?? '';
  const labelOf = (key: string) => blocks.find((b) => b.key === key)?.label ?? key;

  const emit = (next: BiomeBlockSwap[]) => onChange(next.length > 0 ? next : undefined);
  const setChance = (index: number, percent: number) =>
    emit(swaps.map((s, i) => (i === index ? { ...s, chance: Number.isFinite(percent) ? percent / 100 : NaN } : s)));

  return (
    <div className="block-swaps-editor space-y-3">
      <div>
        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700">Block Swaps</h5>
        <p className="text-[11px] text-slate-400 font-medium">Replace one block with another across this biome, e.g. dirt into ice. Done last, after ores and rocks are placed on dirt</p>
      </div>

      {swaps.length === 0 ? (
        <p className="text-xs text-slate-400 font-semibold italic">No swaps: the biome keeps the usual blocks.</p>
      ) : (
        <ul className="space-y-2">
          {swaps.map((swap, i) => (
            <li key={`${swap.from}-${i}`} className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-slate-800">{labelOf(swap.from)}</span>
              <span className="text-slate-400 font-black">→</span>
              <span className="text-sm font-bold text-slate-800">{labelOf(swap.to)}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                aria-label={`Share of ${labelOf(swap.from)} swapped (%)`}
                value={swap.chance === undefined ? 100 : Number.isFinite(swap.chance) ? Math.round(swap.chance * 100) : ''}
                onChange={(e) => setChance(i, e.target.value === '' ? NaN : Number(e.target.value))}
                className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
              />
              <span className="text-xs font-bold text-slate-500">%</span>
              <button
                type="button"
                aria-label={`Remove swap of ${labelOf(swap.from)}`}
                onClick={() => emit(swaps.filter((_, j) => j !== i))}
                className="cursor-pointer ml-auto px-3 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 font-bold text-xs rounded-lg transition-all"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {blocks.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Swap from" value={fromKey} onChange={(e) => setFrom(e.target.value)} className={selectClass}>
            {blocks.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
          <span className="text-slate-400 font-black">→</span>
          <select aria-label="Swap to" value={toKey} onChange={(e) => setTo(e.target.value)} className={selectClass}>
            {blocks.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!fromKey || !toKey || fromKey === toKey || swaps.some((s) => s.from === fromKey)}
            onClick={() => emit([...swaps, { from: fromKey, to: toKey }])}
            className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
          >
            Add Swap
          </button>
        </div>
      )}
    </div>
  );
};

export default BlockSwapsEditor;
