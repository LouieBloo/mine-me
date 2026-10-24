import React from 'react';
import { BLOCK_SCALE, DEFAULT_DOODAD_NEAR_RADIUS, type DoodadSpawnRules } from '@mine-me/shared';
import KeyChips, { type KeyChipOption } from '../KeyChips/KeyChips';
import { hintClass, inputClass, labelClass, panelClass, show } from '../panelStyles';
import './DoodadSpawnPanel.css';

interface DoodadSpawnPanelProps {
  value: DoodadSpawnRules;
  onChange: (value: DoodadSpawnRules) => void;
  blocks: KeyChipOption[];
  fluids: KeyChipOption[];
  gases: KeyChipOption[];
}

const original = (cells: number | null | undefined): string => (typeof cells === 'number' && Number.isFinite(cells) ? `${(cells / BLOCK_SCALE).toFixed(1)} original blocks` : '');

/** Where the generator may put the doodad. Every rule is optional: an empty rule is no restriction. */
const DoodadSpawnPanel: React.FC<DoodadSpawnPanelProps> = ({ value, onChange, blocks, fluids, gases }) => {
  const set = (patch: Partial<DoodadSpawnRules>) => onChange({ ...value, ...patch });
  const optional = (raw: string): number | null => (raw === '' ? null : Number(raw));
  const needsNear = (value.nearFluids?.length ?? 0) > 0 || (value.nearGases?.length ?? 0) > 0;

  return (
    <div className={`doodad-spawn-panel ${panelClass}`}>
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Where It Spawns</h4>
        <p className="text-xs text-slate-500 font-medium">Rules the generator checks before it places the doodad. Leave a rule empty for no restriction. Which biomes it appears in, and how often, is set below.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1">
          <label htmlFor="spawn-min-depth" className={labelClass}>Shallowest Row</label>
          <input id="spawn-min-depth" type="number" min={0} step={1} value={show(value.minDepth)} onChange={(e) => set({ minDepth: optional(e.target.value) })} className={inputClass} />
          <span className={hintClass}>From the ground, in blocks. {original(value.minDepth)}</span>
        </div>
        <div className="space-y-1">
          <label htmlFor="spawn-max-depth" className={labelClass}>Deepest Row</label>
          <input id="spawn-max-depth" type="number" min={0} step={1} placeholder="Bottom of the map" value={show(value.maxDepth)} onChange={(e) => set({ maxDepth: optional(e.target.value) })} className={inputClass} />
          <span className={hintClass}>Leave empty to go to the bottom. {original(value.maxDepth)}</span>
        </div>
      </div>

      <KeyChips
        id="spawn-blocks"
        title="Sits On / Hangs From"
        hint="Only on these blocks (the block under a floor doodad, above a ceiling one, beside a wall one). None chosen: any block."
        options={blocks}
        value={value.blocks}
        onChange={(v) => set({ blocks: v })}
      />
      <KeyChips id="spawn-fluids" title="Near Fluid" hint="Only close to one of these fluids. None chosen: no need." options={fluids} value={value.nearFluids} onChange={(v) => set({ nearFluids: v })} />
      <KeyChips id="spawn-gases" title="Near Gas" hint="Only close to one of these gases. None chosen: no need." options={gases} value={value.nearGases} onChange={(v) => set({ nearGases: v })} />

      {needsNear && (
        <div className="space-y-1 max-w-xs">
          <label htmlFor="spawn-near-radius" className={labelClass}>Near Means Within</label>
          <input
            id="spawn-near-radius"
            type="number"
            min={1}
            step={1}
            placeholder={String(DEFAULT_DOODAD_NEAR_RADIUS)}
            value={show(value.nearRadius)}
            onChange={(e) => set({ nearRadius: optional(e.target.value) })}
            className={inputClass}
          />
          <span className={hintClass}>In blocks. Empty: {DEFAULT_DOODAD_NEAR_RADIUS} ({DEFAULT_DOODAD_NEAR_RADIUS / BLOCK_SCALE} original blocks). {original(value.nearRadius)}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1">
          <label htmlFor="spawn-min-spacing" className={labelClass}>Minimum Spacing</label>
          <input id="spawn-min-spacing" type="number" min={0} step={1} value={show(value.minSpacing)} onChange={(e) => set({ minSpacing: optional(e.target.value) })} className={inputClass} />
          <span className={hintClass}>No other doodad of this kind this close, in blocks. {original(value.minSpacing)}</span>
        </div>
        <label className="flex items-start gap-3 cursor-pointer bg-white hover:bg-slate-100 border border-slate-200 px-4 py-3 rounded-xl transition-colors self-start">
          <input type="checkbox" aria-label="Dark places only" checked={Boolean(value.darkOnly)} onChange={(e) => set({ darkOnly: e.target.checked })} className="mt-0.5 w-5 h-5 rounded cursor-pointer accent-slate-800" />
          <span>
            <span className="block text-xs font-black uppercase tracking-wider text-slate-700">Dark places only</span>
            <span className="block text-[11px] text-slate-400 font-medium">Only deep enough that no sunlight reaches</span>
          </span>
        </label>
      </div>
    </div>
  );
};

export default DoodadSpawnPanel;
