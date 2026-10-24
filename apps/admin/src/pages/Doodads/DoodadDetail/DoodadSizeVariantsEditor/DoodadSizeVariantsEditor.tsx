import React from 'react';
import { BLOCK_SCALE, type DoodadSizeVariant } from '@mine-me/shared';
import { buttonClass, dangerButtonClass, hintClass, readNumber, show, smallInputClass } from '../panelStyles';
import './DoodadSizeVariantsEditor.css';

interface DoodadSizeVariantsEditorProps {
  value: DoodadSizeVariant[];
  /** The doodad's own footprint: a new size starts from it. */
  baseWidth: number;
  baseHeight: number;
  onChange: (value: DoodadSizeVariant[]) => void;
}

const original = (cells: number): string => (Number.isFinite(cells) ? `${Math.round((cells / BLOCK_SCALE) * 10) / 10}` : '?');

/**
 * The other sizes a doodad comes in. A placed doodad picks one by weight, so with sizes listed only they are used: list the
 * doodad's own size too if it should still appear. With none listed it is always its own size.
 */
const DoodadSizeVariantsEditor: React.FC<DoodadSizeVariantsEditorProps> = ({ value, baseWidth, baseHeight, onChange }) => {
  const update = (index: number, patch: Partial<DoodadSizeVariant>) => onChange(value.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  const add = () =>
    onChange([...value, { width: Number.isFinite(baseWidth) ? baseWidth : BLOCK_SCALE, height: Number.isFinite(baseHeight) ? baseHeight : BLOCK_SCALE, weight: 1 }]);
  const total = value.reduce((sum, v) => sum + (Number.isFinite(v.weight) && v.weight > 0 ? v.weight : 0), 0);

  return (
    <div className="doodad-size-variants space-y-3">
      <div>
        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700">Size Variants</h5>
        <p className={hintClass}>Optional. A placed doodad picks one of these by weight; with none listed it is always its own size. List its own size too if it should still appear.</p>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-slate-400 font-semibold italic">Always its own size.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((variant, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                Width
                <input aria-label={`Size ${i + 1} width`} type="number" min={1} step={1} value={show(variant.width)} onChange={(e) => update(i, { width: readNumber(e.target.value) })} className={smallInputClass} />
              </label>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                Height
                <input aria-label={`Size ${i + 1} height`} type="number" min={1} step={1} value={show(variant.height)} onChange={(e) => update(i, { height: readNumber(e.target.value) })} className={smallInputClass} />
              </label>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                Weight
                <input aria-label={`Size ${i + 1} weight`} type="number" min={0} step={0.1} value={show(variant.weight)} onChange={(e) => update(i, { weight: readNumber(e.target.value) })} className={smallInputClass} />
              </label>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600 flex-1 min-w-[10rem]">
                Picture
                <input
                  aria-label={`Size ${i + 1} picture`}
                  type="text"
                  placeholder="/assets/… (optional)"
                  value={variant.textureUrl ?? ''}
                  onChange={(e) => update(i, { textureUrl: e.target.value.trim() === '' ? null : e.target.value.trim() })}
                  className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
                />
              </label>
              <span className="text-[11px] text-slate-400 font-semibold w-36">
                {original(variant.width)} x {original(variant.height)} blocks{total > 0 && variant.weight > 0 ? `, ${Math.round((variant.weight / total) * 100)}%` : ''}
              </span>
              <button type="button" aria-label={`Remove size ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className={dangerButtonClass}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={add} className={buttonClass}>
        + Add Size
      </button>
    </div>
  );
};

export default DoodadSizeVariantsEditor;
