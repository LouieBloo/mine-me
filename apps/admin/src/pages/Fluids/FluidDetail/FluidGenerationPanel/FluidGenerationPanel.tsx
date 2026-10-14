import React from 'react';
import type { FluidGeneration } from '@mine-me/shared';
import './FluidGenerationPanel.css';

interface FluidGenerationPanelProps {
  /** Null means the fluid never appears in generated mines. */
  value: FluidGeneration | null | undefined;
  onChange: (value: FluidGeneration | null) => void;
}

/** Starting values when generation is switched on. */
export const DEFAULT_GENERATION: FluidGeneration = {
  minDepth: 8,
  maxDepth: null,
  percentage: 1.5,
  minSize: 2,
  maxSize: 4,
};

const inputClass = 'w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';

const readNumber = (raw: string): number => (raw === '' ? NaN : Number(raw));
const show = (n: number | null | undefined): number | '' => (typeof n === 'number' && Number.isFinite(n) ? n : '');

/** Where the fluid appears when a mine is generated: sealed square pockets in the dirt. */
export const FluidGenerationPanel: React.FC<FluidGenerationPanelProps> = ({ value, onChange }) => {
  const enabled = Boolean(value);
  const update = (patch: Partial<FluidGeneration>) => onChange({ ...DEFAULT_GENERATION, ...value, ...patch });

  return (
    <div className="fluid-generation-panel bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Map Generation</h4>
          <p className="text-xs text-slate-500 font-medium">Sealed square pockets of this fluid carved into the dirt when a mine is generated</p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer self-start sm:self-auto bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl transition-colors">
          <input
            type="checkbox"
            aria-label="Appears in generated mines"
            checked={enabled}
            onChange={(e) => onChange(e.target.checked ? { ...DEFAULT_GENERATION } : null)}
            className="w-5 h-5 rounded cursor-pointer accent-sky-600"
          />
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">{enabled ? 'Generated' : 'Never generated'}</span>
        </label>
      </div>

      {value && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1">
            <label htmlFor="gen-minDepth" className={labelClass}>Shallowest Row</label>
            <input id="gen-minDepth" type="number" min={1} step={1} className={inputClass} value={show(value.minDepth)} onChange={(e) => update({ minDepth: readNumber(e.target.value) })} />
            <span className="text-[11px] text-slate-400 font-medium">Pockets start no higher than this row (0 is the surface)</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="gen-maxDepth" className={labelClass}>Deepest Row</label>
            <input
              id="gen-maxDepth"
              type="number"
              min={1}
              step={1}
              placeholder="No limit"
              className={inputClass}
              value={show(value.maxDepth)}
              onChange={(e) => update({ maxDepth: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <span className="text-[11px] text-slate-400 font-medium">Leave empty to go down to the bottom of the mine</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="gen-percentage" className={labelClass}>Amount (% of diggable tiles)</label>
            <input id="gen-percentage" type="number" min={0} max={100} step={0.5} className={inputClass} value={show(value.percentage)} onChange={(e) => update({ percentage: readNumber(e.target.value) })} />
            <span className="text-[11px] text-slate-400 font-medium">Share of the dirt in the depth range that becomes pocket</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="gen-minSize" className={labelClass}>Smallest Pocket</label>
              <input id="gen-minSize" type="number" min={1} step={1} className={inputClass} value={show(value.minSize)} onChange={(e) => update({ minSize: readNumber(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <label htmlFor="gen-maxSize" className={labelClass}>Largest Pocket</label>
              <input id="gen-maxSize" type="number" min={1} step={1} className={inputClass} value={show(value.maxSize)} onChange={(e) => update({ maxSize: readNumber(e.target.value) })} />
            </div>
            <span className="col-span-2 text-[11px] text-slate-400 font-medium">Pockets are squares; the side is between these, in tiles</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FluidGenerationPanel;
