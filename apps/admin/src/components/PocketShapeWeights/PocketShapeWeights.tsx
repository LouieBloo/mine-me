import React from 'react';
import { POCKET_SHAPES, resolveShapeWeights, type PocketShape, type PocketShapeWeights as Weights } from '@mine-me/shared';
import './PocketShapeWeights.css';

interface PocketShapeWeightsProps {
  /** Null/absent means every shape is equally likely. */
  value: Weights | null | undefined;
  onChange: (value: Weights | null) => void;
}

const LABELS: Record<PocketShape, string> = { SQUARE: 'Squares', RECTANGLE: 'Rectangles', VEIN: 'Veins' };
const HINTS: Record<PocketShape, string> = {
  SQUARE: 'Equal sides',
  RECTANGLE: 'Width and height drawn separately',
  VEIN: 'A winding, branching run of cells',
};

const inputClass = 'w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';

/** How likely each pocket shape is, as weights: 0 never, and the rest in proportion. All equal is saved as "no setting". */
export const PocketShapeWeights: React.FC<PocketShapeWeightsProps> = ({ value, onChange }) => {
  const weights = resolveShapeWeights(value);
  const set = (shape: PocketShape, raw: string) => {
    const next = { ...weights, [shape]: raw === '' ? NaN : Number(raw) };
    const values = POCKET_SHAPES.map((s) => next[s]);
    onChange(values.every((v) => v === values[0]) ? null : next);
  };

  return (
    <div className="pocket-shape-weights col-span-1 sm:col-span-2 space-y-2">
      <span className={labelClass}>Pocket Shapes</span>
      <div className="grid grid-cols-3 gap-3">
        {POCKET_SHAPES.map((shape) => (
          <div key={shape} className="space-y-1">
            <label htmlFor={`shape-${shape}`} className="block text-[11px] font-bold text-slate-600">{LABELS[shape]}</label>
            <input
              id={`shape-${shape}`}
              aria-label={`${LABELS[shape]} weight`}
              type="number"
              min={0}
              step={1}
              className={inputClass}
              value={Number.isFinite(weights[shape]) ? weights[shape] : ''}
              onChange={(e) => set(shape, e.target.value)}
            />
            <span className="text-[11px] text-slate-400 font-medium">{HINTS[shape]}</span>
          </div>
        ))}
      </div>
      <span className="text-[11px] text-slate-400 font-medium">Weights, not percentages: 0 never happens, 2 is twice as common as 1. Every pocket is one connected piece.</span>
    </div>
  );
};

export default PocketShapeWeights;
