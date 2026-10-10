import { useState } from 'react';
import { describeEffectKinds, getEffectKind } from '../../pages/Effects/effectKinds';
import './EffectsEditor.css';

export interface AttachedEffect {
  effectId: string;
  value: number;
  effect?: Record<string, any>;
}

export interface EffectsEditorProps {
  /** Effects currently attached to the item/mob. */
  value: AttachedEffect[];
  /** Every effect that can be attached (from /api/admin/effects). */
  available: Record<string, any>[];
  onChange: (next: AttachedEffect[]) => void;
  /** What the owner is called in messages, e.g. "item" or "mob". */
  ownerLabel?: string;
}

/**
 * Add / edit / remove the effects attached to an entity. Items and mobs share this because
 * both get their stats from the same Effect table.
 */
export function EffectsEditor({ value, available, onChange, ownerLabel = 'item' }: EffectsEditorProps) {
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('10');
  const [error, setError] = useState('');

  const add = () => {
    const effect = available.find((e) => e.id === selectedId);
    if (!effect) return;
    if (value.some((v) => v.effectId === selectedId)) {
      setError(`This effect is already added to the ${ownerLabel}.`);
      return;
    }
    setError('');
    onChange([...value, { effectId: selectedId, value: Number(amount) || 0, effect }]);
    setSelectedId('');
  };

  return (
    <div className="effects-editor">
      <div className="flex gap-4 items-end flex-wrap">
        <div className="flex-grow min-w-[200px] space-y-1">
          <label htmlFor="effects-editor-select" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Select Effect
          </label>
          <select
            id="effects-editor-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800 cursor-pointer"
          >
            <option value="">-- Choose an Effect --</option>
            {available.map((eff) => (
              <option key={eff.id} value={eff.id}>
                {eff.name} {describeEffectKinds(eff)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24 space-y-1">
          <label htmlFor="effects-editor-value" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Value
          </label>
          <input
            id="effects-editor-value"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
          />
        </div>
        <button
          type="button"
          onClick={add}
          className="cursor-pointer px-5 py-2.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all text-sm active:scale-95"
        >
          Add Effect
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-600 text-xs font-bold">
          {error}
        </p>
      )}

      <div className="space-y-2 pt-2">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Active Effects ({value.length})
        </span>
        {value.length === 0 ? (
          <p className="text-slate-400 text-xs italic">No effects configured for this {ownerLabel}.</p>
        ) : (
          <div className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            {value.map((entry) => (
              <div key={entry.effectId} className="effects-editor-row">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{entry.effect?.name || 'Effect'}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        getEffectKind(entry.effect)?.badge ?? 'text-slate-700 bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {getEffectKind(entry.effect)?.short ?? 'Modifier'}
                    </span>
                  </div>
                  {entry.effect?.description && <p className="text-slate-500 text-xs mt-0.5">{entry.effect.description}</p>}
                </div>
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="flex items-center gap-1.5 bg-slate-100/90 px-3 py-1.5 rounded-lg border border-slate-200">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Value
                      <input
                        type="number"
                        aria-label={`${entry.effect?.name || 'Effect'} value`}
                        value={entry.value ?? ''}
                        onChange={(e) =>
                          onChange(
                            value.map((v) =>
                              v.effectId === entry.effectId ? { ...v, value: e.target.value === '' ? 0 : Number(e.target.value) } : v
                            )
                          )
                        }
                        className="ml-1.5 w-20 px-2 py-1 bg-white border border-slate-200 focus:border-blue-500 rounded font-bold text-slate-800 text-sm text-right focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((v) => v.effectId !== entry.effectId))}
                    className="cursor-pointer px-2.5 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg font-bold text-xs transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
