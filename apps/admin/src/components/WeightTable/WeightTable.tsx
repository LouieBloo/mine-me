import React, { useState } from 'react';
import './WeightTable.css';

export interface WeightOption {
  key: string;
  label: string;
}

interface WeightTableProps {
  /** Heading shown above the table. */
  title: string;
  /** One line saying what the numbers mean. */
  hint: string;
  /** Unique within the page, so the add controls have their own label. */
  id: string;
  /** Key -> number. Null/absent is the same as empty. */
  value: Record<string, number> | null | undefined;
  /** What can be added. Keys already in the table are not offered again. */
  options: WeightOption[];
  /** The number a newly added row starts with. */
  defaultWeight?: number;
  /** Called with the new table, or null once the last row is removed. */
  onChange: (value: Record<string, number> | null) => void;
  emptyText?: string;
}

const inputClass = 'w-28 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';

/** A small editor for a "name -> number" table (block palette weights, fluid weights, mob spawn weights...). */
const WeightTable: React.FC<WeightTableProps> = ({ title, hint, id, value, options, defaultWeight = 1, onChange, emptyText = 'Nothing set: the usual amounts.' }) => {
  const rows = Object.entries(value ?? {});
  const free = options.filter((o) => !(value && o.key in value));
  const [picked, setPicked] = useState('');
  const selected = free.some((o) => o.key === picked) ? picked : free[0]?.key ?? '';
  const labelOf = (key: string) => options.find((o) => o.key === key)?.label ?? key;

  const setWeight = (key: string, weight: number) => onChange({ ...(value ?? {}), [key]: weight });
  const remove = (key: string) => {
    const { [key]: _removed, ...rest } = value ?? {};
    onChange(Object.keys(rest).length > 0 ? rest : null);
  };

  return (
    <div className="weight-table space-y-3">
      <div>
        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700">{title}</h5>
        <p className="text-[11px] text-slate-400 font-medium">{hint}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 font-semibold italic">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(([key, weight]) => (
            <li key={key} className="flex items-center gap-3">
              <span className="flex-1 text-sm font-bold text-slate-800 truncate" title={key}>{labelOf(key)}</span>
              <input
                type="number"
                min={0}
                step={0.1}
                aria-label={`${title}: ${labelOf(key)}`}
                value={Number.isFinite(weight) ? weight : ''}
                onChange={(e) => setWeight(key, e.target.value === '' ? NaN : Number(e.target.value))}
                className={inputClass}
              />
              <button
                type="button"
                aria-label={`Remove ${labelOf(key)} from ${title}`}
                onClick={() => remove(key)}
                className="cursor-pointer px-3 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 font-bold text-xs rounded-lg transition-all"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {free.length > 0 && (
        <div className="flex items-center gap-3">
          <select
            id={`${id}-add`}
            aria-label={`Add to ${title}`}
            value={selected}
            onChange={(e) => setPicked(e.target.value)}
            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-800"
          >
            {free.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => selected && setWeight(selected, defaultWeight)}
            className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
};

export default WeightTable;
