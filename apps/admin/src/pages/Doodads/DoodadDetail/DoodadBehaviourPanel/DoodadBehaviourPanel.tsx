import React from 'react';
import { BLOCK_SCALE, DOODAD_WANDER_MODES, type DoodadAnchor, type DoodadReacts, type DoodadWander, type DoodadWanderMode } from '@mine-me/shared';
import { DEFAULT_REACTS, DEFAULT_WANDER } from '../../doodadForm';
import { hintClass, inputClass, labelClass, panelClass, readNumber, show } from '../panelStyles';
import './DoodadBehaviourPanel.css';

interface DoodadBehaviourPanelProps {
  anchor: DoodadAnchor;
  reacts: DoodadReacts | null;
  wander: DoodadWander | null;
  particleEffects: Array<{ id: string; name: string }>;
  onReactsChange: (value: DoodadReacts | null) => void;
  onWanderChange: (value: DoodadWander | null) => void;
}

const MODE_TEXT: Record<DoodadWanderMode, string> = {
  CRAWL: 'Crawl: creeps along the surface it is on',
  FLUTTER: 'Flutter: drifts about in the air',
  HOP: 'Hop: jumps along the surface',
};

const original = (cells: number | null | undefined): string => (typeof cells === 'number' && Number.isFinite(cells) ? `${(cells / BLOCK_SCALE).toFixed(1)} original blocks` : '');

const Toggle: React.FC<{ label: string; hint: string; on: boolean; onChange: (on: boolean) => void }> = ({ label, hint, on, onChange }) => (
  <label className="flex items-start gap-3 cursor-pointer bg-white hover:bg-slate-100 border border-slate-200 px-4 py-3 rounded-xl transition-colors">
    <input type="checkbox" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-5 h-5 rounded cursor-pointer accent-slate-800" />
    <span>
      <span className="block text-xs font-black uppercase tracking-wider text-slate-700">{label}</span>
      <span className="block text-[11px] text-slate-400 font-medium">{hint}</span>
    </span>
  </label>
);

/** How the doodad answers bodies walking past (wiggle, spore puff) and whether it wanders (bugs). Both are cosmetic and client-only. */
const DoodadBehaviourPanel: React.FC<DoodadBehaviourPanelProps> = ({ anchor, reacts, wander, particleEffects, onReactsChange, onWanderChange }) => {
  // A doodad floating in the air has no surface to crawl or hop along
  const modes = anchor === 'AIR' ? DOODAD_WANDER_MODES.filter((m) => m === 'FLUTTER') : DOODAD_WANDER_MODES;

  return (
    <div className={`doodad-behaviour-panel ${panelClass}`}>
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Behaviour</h4>
        <p className="text-xs text-slate-500 font-medium">Cosmetic only: nothing here is sent over the network or changes how the game plays.</p>
      </div>

      <Toggle label="Reacts to bodies" hint="Wiggles when a player or mob moves past (mushrooms, grass)" on={reacts !== null} onChange={(on) => onReactsChange(on ? { ...DEFAULT_REACTS } : null)} />
      {reacts && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pl-2">
          <div className="space-y-1">
            <label htmlFor="reacts-strength" className={labelClass}>Strength</label>
            <input id="reacts-strength" type="number" min={0} max={1} step={0.05} value={show(reacts.strength)} onChange={(e) => onReactsChange({ ...reacts, strength: readNumber(e.target.value) })} className={inputClass} />
            <span className={hintClass}>0 to 1: how hard it wiggles</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="reacts-radius" className={labelClass}>Radius</label>
            <input id="reacts-radius" type="number" min={1} step={1} value={show(reacts.radius)} onChange={(e) => onReactsChange({ ...reacts, radius: readNumber(e.target.value) })} className={inputClass} />
            <span className={hintClass}>How near a body must be, in blocks. {original(reacts.radius)}</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="reacts-puff" className={labelClass}>Spore Puff</label>
            <select id="reacts-puff" value={reacts.puffEffectId ?? ''} onChange={(e) => onReactsChange({ ...reacts, puffEffectId: e.target.value === '' ? null : e.target.value })} className={`${inputClass} cursor-pointer`}>
              <option value="">No puff</option>
              {particleEffects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className={hintClass}>A particle effect when it is brushed</span>
          </div>
        </div>
      )}

      <Toggle
        label="Wanders"
        hint="Bugs: moves a little around its spot, and runs from bodies"
        on={wander !== null}
        onChange={(on) => onWanderChange(on ? { ...DEFAULT_WANDER, mode: anchor === 'AIR' ? 'FLUTTER' : DEFAULT_WANDER.mode } : null)}
      />
      {wander && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pl-2">
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="wander-mode" className={labelClass}>Mode</label>
            <select id="wander-mode" value={wander.mode} onChange={(e) => onWanderChange({ ...wander, mode: e.target.value as DoodadWanderMode })} className={`${inputClass} cursor-pointer`}>
              {modes.map((m) => (
                <option key={m} value={m}>{MODE_TEXT[m]}</option>
              ))}
            </select>
            {anchor === 'AIR' && <span className={hintClass}>A doodad floating in the air can only flutter</span>}
          </div>
          <div className="space-y-1">
            <label htmlFor="wander-radius" className={labelClass}>Radius</label>
            <input id="wander-radius" type="number" min={1} step={1} value={show(wander.radius)} onChange={(e) => onWanderChange({ ...wander, radius: readNumber(e.target.value) })} className={inputClass} />
            <span className={hintClass}>How far from its spot, in blocks. {original(wander.radius)}</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="wander-speed" className={labelClass}>Speed</label>
            <input id="wander-speed" type="number" min={0.1} step={0.1} value={show(wander.speed)} onChange={(e) => onWanderChange({ ...wander, speed: readNumber(e.target.value) })} className={inputClass} />
            <span className={hintClass}>Blocks per second</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="wander-pause" className={labelClass}>Rests For</label>
            <input id="wander-pause" type="number" min={0} step={100} value={show(wander.pauseMs)} onChange={(e) => onWanderChange({ ...wander, pauseMs: readNumber(e.target.value) })} className={inputClass} />
            <span className={hintClass}>Milliseconds between moves</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoodadBehaviourPanel;
