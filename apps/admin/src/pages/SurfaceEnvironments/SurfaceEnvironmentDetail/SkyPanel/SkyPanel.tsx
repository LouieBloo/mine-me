import React from 'react';
import { hintClass, inputClass, labelClass, panelClass, readNumber, show } from '../../../Doodads/DoodadDetail/panelStyles';
import type { SurfaceEnvironmentForm } from '../../surfaceEnvironmentForm';

interface SkyPanelProps {
  form: Pick<SurfaceEnvironmentForm, 'skyTop' | 'skyHorizon' | 'sunEnabled' | 'sunColor' | 'sunX' | 'sunHeight' | 'sunSize' | 'ambientTint'>;
  onChange: <K extends keyof SurfaceEnvironmentForm>(key: K, value: SurfaceEnvironmentForm[K]) => void;
}

const colorInput = 'h-10 w-16 cursor-pointer bg-white border border-slate-200 rounded-lg p-1';

/** The sky: a gradient from the top of the screen to the horizon, a sun, and the tint the sky light gets. */
const SkyPanel: React.FC<SkyPanelProps> = ({ form, onChange }) => (
  <div className={panelClass} data-testid="sky-panel">
    <div>
      <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Sky</h4>
      <p className="text-xs text-slate-500 font-medium">The sky blends from the top colour to the horizon colour. Cloud cover greys it. It is always daytime.</p>
    </div>

    <div className="flex flex-wrap items-end gap-6">
      <div className="space-y-1">
        <label htmlFor="sky-top" className={labelClass}>Top Colour</label>
        <input id="sky-top" type="color" value={form.skyTop} onChange={(e) => onChange('skyTop', e.target.value)} className={colorInput} />
      </div>
      <div className="space-y-1">
        <label htmlFor="sky-horizon" className={labelClass}>Horizon Colour</label>
        <input id="sky-horizon" type="color" value={form.skyHorizon} onChange={(e) => onChange('skyHorizon', e.target.value)} className={colorInput} />
      </div>
      <div className="space-y-1">
        <label htmlFor="ambient-tint" className={labelClass}>Light Tint</label>
        <div className="flex items-center gap-2">
          <input id="ambient-tint" type="color" value={form.ambientTint || '#ffffff'} onChange={(e) => onChange('ambientTint', e.target.value)} className={colorInput} />
          <button
            type="button"
            disabled={form.ambientTint === ''}
            onClick={() => onChange('ambientTint', '')}
            className="cursor-pointer px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            No tint
          </button>
        </div>
        <span className={hintClass}>Colours the light above the ground (warm or cool).</span>
      </div>
    </div>

    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer w-fit">
      <input type="checkbox" checked={form.sunEnabled} onChange={(e) => onChange('sunEnabled', e.target.checked)} className="cursor-pointer" />
      Show a sun
    </label>

    {form.sunEnabled && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-1">
          <label htmlFor="sun-color" className={labelClass}>Sun Colour</label>
          <input id="sun-color" type="color" value={form.sunColor} onChange={(e) => onChange('sunColor', e.target.value)} className={colorInput} />
        </div>
        <div className="space-y-1">
          <label htmlFor="sun-x" className={labelClass}>Position (0-1)</label>
          <input id="sun-x" type="number" min={0} max={1} step={0.05} value={show(form.sunX)} onChange={(e) => onChange('sunX', readNumber(e.target.value))} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="sun-height" className={labelClass}>Height (blocks)</label>
          <input id="sun-height" type="number" min={0} max={200} step={1} value={show(form.sunHeight)} onChange={(e) => onChange('sunHeight', readNumber(e.target.value))} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="sun-size" className={labelClass}>Size (blocks)</label>
          <input id="sun-size" type="number" min={0} max={50} step={0.5} value={show(form.sunSize)} onChange={(e) => onChange('sunSize', readNumber(e.target.value))} className={inputClass} />
        </div>
      </div>
    )}
  </div>
);

export default SkyPanel;
