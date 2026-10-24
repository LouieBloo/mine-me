import React, { useState } from 'react';
import { DOODAD_MOTION_PRESETS, DRIP_DROP_PART, type DoodadMotion, type DoodadPartDef } from '@mine-me/shared';
import { buttonClass, dangerButtonClass, hintClass, inputClass, labelClass, panelClass, readNumber, show, smallInputClass } from '../panelStyles';
import './DoodadMotionPanel.css';

interface DoodadMotionPanelProps {
  value: DoodadMotion | null;
  parts: DoodadPartDef[];
  onChange: (value: DoodadMotion | null) => void;
}

/** The param that keeps (or lessens) the motion on one part of a doodad. */
export const weightParam = (partName: string): string => `weight_${partName}`;

/** Tidies a motion: empty optional fields are left out so a stored motion holds only what was set. */
function tidy(motion: DoodadMotion): DoodadMotion {
  const out: DoodadMotion = { preset: motion.preset };
  if (motion.speed !== undefined && Number.isFinite(motion.speed)) out.speed = motion.speed;
  if (motion.amplitude !== undefined && Number.isFinite(motion.amplitude)) out.amplitude = motion.amplitude;
  if (motion.phase !== undefined && Number.isFinite(motion.phase)) out.phase = motion.phase;
  if (motion.params && Object.keys(motion.params).length > 0) out.params = motion.params;
  return out;
}

/**
 * The procedural motion on the still picture: which preset (the registry in the shared code), how fast, how far, and the
 * preset's extra numbers. For a doodad in parts, a `weight_<part>` number says how much of the motion that part gets (0 keeps it planted).
 */
const DoodadMotionPanel: React.FC<DoodadMotionPanelProps> = ({ value, parts, onChange }) => {
  const [newParam, setNewParam] = useState('');
  const preset = value ? DOODAD_MOTION_PRESETS[value.preset] : undefined;
  const params = value?.params ?? {};

  const set = (patch: Partial<DoodadMotion>) => value && onChange(tidy({ ...value, ...patch }));
  const optional = (raw: string): number | undefined => (raw === '' ? undefined : Number(raw));
  const setParam = (name: string, number: number) => set({ params: { ...params, [name]: number } });
  const removeParam = (name: string) => {
    const { [name]: _removed, ...rest } = params;
    set({ params: rest });
  };
  const addParam = (name: string) => {
    const clean = name.trim();
    if (clean && !(clean in params)) setParam(clean, clean.startsWith('weight_') ? 0 : 1);
    setNewParam('');
  };
  const weightable = parts.filter((p) => !(weightParam(p.name) in params));

  return (
    <div className={`doodad-motion-panel ${panelClass}`}>
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Motion</h4>
        <p className="text-xs text-slate-500 font-medium">A still picture moved by a small formula, so no animation art is needed. Every placed doodad starts at its own point in the cycle, so a field of them does not move in step.</p>
      </div>

      <div className="space-y-1 max-w-xs">
        <label htmlFor="motion-preset" className={labelClass}>Preset</label>
        <select
          id="motion-preset"
          value={value?.preset ?? ''}
          onChange={(e) => (e.target.value === '' ? onChange(null) : onChange({ preset: e.target.value }))}
          className={`${inputClass} cursor-pointer`}
        >
          <option value="">None (stands still)</option>
          {Object.values(DOODAD_MOTION_PRESETS).map((p) => (
            <option key={p.name} value={p.name}>{p.label}</option>
          ))}
        </select>
        {preset && <span className={hintClass}>{preset.description}</span>}
      </div>

      {value && preset && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="space-y-1">
              <label htmlFor="motion-speed" className={labelClass}>Speed</label>
              <input id="motion-speed" type="number" min={0} step={0.05} placeholder={String(preset.defaultSpeed)} value={show(value.speed)} onChange={(e) => set({ speed: optional(e.target.value) })} className={inputClass} />
              <span className={hintClass}>Cycles per second. Empty: {preset.defaultSpeed}</span>
            </div>
            <div className="space-y-1">
              <label htmlFor="motion-amplitude" className={labelClass}>Amplitude</label>
              <input id="motion-amplitude" type="number" step={0.01} placeholder={String(preset.defaultAmplitude)} value={show(value.amplitude)} onChange={(e) => set({ amplitude: optional(e.target.value) })} className={inputClass} />
              <span className={hintClass}>How far it goes. Empty: {preset.defaultAmplitude}</span>
            </div>
            <div className="space-y-1">
              <label htmlFor="motion-phase" className={labelClass}>Phase</label>
              <input id="motion-phase" type="number" min={0} max={1} step={0.05} placeholder="Each its own" value={show(value.phase)} onChange={(e) => set({ phase: optional(e.target.value) })} className={inputClass} />
              <span className={hintClass}>0 to 1. Empty: every doodad gets its own.</span>
            </div>
          </div>

          <div className="space-y-2">
            <h5 className="text-xs font-black uppercase tracking-wider text-slate-700">Extra Numbers</h5>
            <p className={hintClass}>
              Read by the preset. <code>weight_&lt;part&gt;</code> sets how much of the motion a part gets (0 keeps it planted).
              {value.preset === 'drip' && <> A drip's falling drop is a part named <code>{DRIP_DROP_PART}</code>; <code>fallShare</code> is how much of the cycle it spends falling.</>}
            </p>
            {Object.keys(params).length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold italic">None set: the preset's own.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(params).map(([name, number]) => (
                  <li key={name} className="flex items-center gap-3">
                    <span className="flex-1 font-mono text-sm font-bold text-slate-800 truncate">{name}</span>
                    <input aria-label={`${name} value`} type="number" step={0.05} value={show(number)} onChange={(e) => setParam(name, readNumber(e.target.value))} className={smallInputClass} />
                    <button type="button" aria-label={`Remove ${name}`} onClick={() => removeParam(name)} className={dangerButtonClass}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {weightable.map((p) => (
                <button key={p.name} type="button" onClick={() => addParam(weightParam(p.name))} className={buttonClass}>
                  + Weight for {p.name}
                </button>
              ))}
              <input
                aria-label="New extra number name"
                type="text"
                placeholder="name, e.g. fallShare"
                value={newParam}
                onChange={(e) => setNewParam(e.target.value)}
                className="w-48 px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
              />
              <button type="button" disabled={newParam.trim() === ''} onClick={() => addParam(newParam)} className={buttonClass}>
                + Add Number
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DoodadMotionPanel;
