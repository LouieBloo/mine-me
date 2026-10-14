import React from 'react';
import type { Flammability } from '@mine-me/shared';
import ItemLightEffectConfig from '../ItemLightEffectConfig/ItemLightEffectConfig';
import './FlammabilityPanel.css';

interface FlammabilityPanelProps {
  /** Null means the material does not burn. */
  value: Flammability | null | undefined;
  onChange: (value: Flammability | null) => void;
  title?: string;
  description?: string;
  /** The particle effect library to pick the flames from. Leave out to hide the flame settings. */
  particleEffects?: Array<{ id: string; name: string }>;
}

/** Starting values when "Can burn" is switched on. */
export const DEFAULT_FLAMMABILITY: Flammability = {
  ignitionChance: 0.5,
  spreadChance: 0.3,
  burnDuration: 6,
  heat: 2,
  burnsInto: null,
};

interface NumberField {
  key: 'ignitionChance' | 'spreadChance' | 'burnDuration' | 'heat';
  label: string;
  hint: string;
  min: number;
  max?: number;
  step: number;
}

const NUMBER_FIELDS: NumberField[] = [
  { key: 'ignitionChance', label: 'Ignition Chance', hint: 'Chance (0-1) that a spark or flame touching it sets it alight', min: 0, max: 1, step: 0.05 },
  { key: 'spreadChance', label: 'Spread Chance', hint: 'Chance (0-1) per second that a burning cell lights a neighbouring flammable cell', min: 0, max: 1, step: 0.05 },
  { key: 'burnDuration', label: 'Burn Duration (s)', hint: 'Seconds a cell burns before it is spent and the fire goes out', min: 0.5, step: 0.5 },
  { key: 'heat', label: 'Heat', hint: 'How much heat the fire gives off; anything close to it takes damage', min: 0, step: 0.5 },
];

/** "Can burn" switch and fire settings. Shared by fluids and (later) flammable blocks. */
export const FlammabilityPanel: React.FC<FlammabilityPanelProps> = ({
  value,
  onChange,
  title = 'Flammability',
  description = 'Whether it catches fire, how fast fire spreads through it and what it leaves behind',
  particleEffects,
}) => {
  const canBurn = Boolean(value);

  const update = (patch: Partial<Flammability>) => onChange({ ...DEFAULT_FLAMMABILITY, ...value, ...patch });

  return (
    <div className="flammability-panel bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">{title}</h4>
          <p className="text-xs text-slate-500 font-medium">{description}</p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer self-start sm:self-auto bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl transition-colors">
          <input
            type="checkbox"
            aria-label="Can burn"
            checked={canBurn}
            onChange={(e) => onChange(e.target.checked ? { ...DEFAULT_FLAMMABILITY } : null)}
            className="w-5 h-5 rounded cursor-pointer accent-orange-500"
          />
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">{canBurn ? 'Can burn' : 'Does not burn'}</span>
        </label>
      </div>

      {value && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {NUMBER_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <label htmlFor={`flammability-${field.key}`} className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                {field.label}
              </label>
              <input
                id={`flammability-${field.key}`}
                type="number"
                value={Number.isFinite(value[field.key]) ? value[field.key] : ''}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(e) => update({ [field.key]: e.target.value === '' ? NaN : Number(e.target.value) })}
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
              />
              <span className="text-[11px] text-slate-400 font-medium">{field.hint}</span>
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="flammability-burnsInto" className="block text-xs font-black uppercase text-slate-600 tracking-wider">
              Burns Into (block key)
            </label>
            <input
              id="flammability-burnsInto"
              type="text"
              value={value.burnsInto ?? ''}
              placeholder="Leave empty to leave nothing behind"
              onChange={(e) => update({ burnsInto: e.target.value.trim() === '' ? null : e.target.value.trim().toUpperCase() })}
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
            />
            <span className="text-[11px] text-slate-400 font-medium">The block type left once it has burned out, e.g. DIRT</span>
          </div>

          {particleEffects && (
            <>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="flammability-flameEffectId" className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                  Flame Effect
                </label>
                <select
                  id="flammability-flameEffectId"
                  value={value.flameEffectId ?? ''}
                  onChange={(e) => update({ flameEffectId: e.target.value === '' ? null : e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
                >
                  <option value="">None (no flames drawn)</option>
                  {particleEffects.map((effect) => (
                    <option key={effect.id} value={effect.id}>
                      {effect.name}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 font-medium">The particle effect that rises from every burning cell</span>
              </div>
              <div className="sm:col-span-2">
                <ItemLightEffectConfig
                  lightConfig={value.flameLight}
                  onChange={(light) => update({ flameLight: light })}
                  title="Flame Light"
                  description="The light every burning cell gives off"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FlammabilityPanel;
