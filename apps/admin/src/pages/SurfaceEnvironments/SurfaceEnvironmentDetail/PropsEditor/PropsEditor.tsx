import React from 'react';
import type { SurfacePropDef } from '@mine-me/shared';
import { buttonClass, dangerButtonClass, hintClass, inputClass, labelClass, panelClass, readNumber, show } from '../../../Doodads/DoodadDetail/panelStyles';
import { newProp } from '../../surfaceEnvironmentForm';

export interface PropDoodad {
  key: string;
  name: string;
  anchor: string;
}

interface PropsEditorProps {
  props: SurfacePropDef[];
  /** Every doodad; only floor ones (trees, bushes) and air ones (birds) can be surface props. */
  doodads: PropDoodad[];
  onChange: (props: SurfacePropDef[]) => void;
}

/** The doodads that can stand on the ground or fly in the sky. */
export const surfaceDoodads = (doodads: readonly PropDoodad[]): PropDoodad[] => doodads.filter((d) => d.anchor === 'FLOOR' || d.anchor === 'AIR');

/**
 * What stands on the ground and flies in the sky: doodads chosen from the doodad library. A floor doodad (a tree, a bush) is
 * placed along the ground; an air doodad (a bird) flies in loose flocks at the heights given. They sway in the wind, react to
 * walkers and can be hidden in some weather, all set on the doodad itself.
 */
const PropsEditor: React.FC<PropsEditorProps> = ({ props, doodads, onChange }) => {
  const options = surfaceDoodads(doodads);
  const byKey = new Map(doodads.map((d) => [d.key, d]));
  const update = (index: number, patch: Partial<SurfacePropDef>) => onChange(props.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <div className={panelClass} data-testid="props-editor">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Props</h4>
        <p className="text-xs text-slate-500 font-medium">Trees, bushes and birds are doodads. Density is how many per 100 columns of ground (flocks, for a bird). They keep clear of the exit and the extractor.</p>
      </div>
      {props.length === 0 && <p className="text-xs text-slate-400 font-semibold italic">No props: the ground is bare.</p>}
      {options.length === 0 && <p className={hintClass}>There are no floor or air doodads yet. Make a tree, a bush or a bird on the Doodads page first.</p>}

      {props.map((prop, i) => {
        const doodad = byKey.get(prop.doodadKey);
        const isAir = doodad?.anchor === 'AIR';
        const missing = prop.doodadKey !== '' && !doodad;
        return (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" data-testid={`prop-${i}`}>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1 min-w-[12rem] flex-1">
                <label htmlFor={`prop-${i}-doodad`} className={labelClass}>Doodad</label>
                <select id={`prop-${i}-doodad`} value={prop.doodadKey} onChange={(e) => update(i, { doodadKey: e.target.value })} className={`${inputClass} cursor-pointer`}>
                  <option value="">Pick a doodad…</option>
                  {missing && <option value={prop.doodadKey}>{prop.doodadKey} (missing)</option>}
                  {options.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.name} ({d.anchor === 'AIR' ? 'flies' : 'stands'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor={`prop-${i}-density`} className={labelClass}>{isAir ? 'Flocks / 100' : 'Per 100 columns'}</label>
                <input id={`prop-${i}-density`} type="number" min={0} max={200} step={0.5} value={show(prop.density)} onChange={(e) => update(i, { density: readNumber(e.target.value) })} className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              {!isAir && (
                <div className="space-y-1">
                  <label htmlFor={`prop-${i}-spacing`} className={labelClass}>Gap (blocks)</label>
                  <input id={`prop-${i}-spacing`} type="number" min={0} step={1} value={show(prop.spacing ?? 0)} onChange={(e) => update(i, { spacing: readNumber(e.target.value) })} className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
              )}
              {isAir && (
                <>
                  <div className="space-y-1">
                    <label htmlFor={`prop-${i}-low`} className={labelClass}>Lowest (blocks)</label>
                    <input id={`prop-${i}-low`} type="number" step={1} value={show(prop.minHeight ?? 6)} onChange={(e) => update(i, { minHeight: readNumber(e.target.value) })} className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`prop-${i}-high`} className={labelClass}>Highest (blocks)</label>
                    <input id={`prop-${i}-high`} type="number" step={1} value={show(prop.maxHeight ?? 20)} onChange={(e) => update(i, { maxHeight: readNumber(e.target.value) })} className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800" />
                  </div>
                </>
              )}
              <button type="button" aria-label={`Remove prop ${i + 1}`} onClick={() => onChange(props.filter((_, j) => j !== i))} className={dangerButtonClass}>Remove</button>
            </div>
            {missing && <span className="text-[11px] text-red-600 font-semibold">That doodad no longer exists; saving will be refused until you change or remove this prop.</span>}
          </div>
        );
      })}

      <button type="button" onClick={() => onChange([...props, newProp(options[0]?.key ?? '')])} className={buttonClass}>
        + Add Prop
      </button>
    </div>
  );
};

export default PropsEditor;
