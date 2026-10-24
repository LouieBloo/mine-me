import React, { useState } from 'react';
import type { DoodadBiomeLink } from '@mine-me/shared';
import { buttonClass, dangerButtonClass, hintClass, inputClass, panelClass, readNumber, show, smallInputClass } from '../panelStyles';
import './DoodadBiomeLinks.css';

export interface BiomeOption {
  id: string;
  key: string;
  name: string;
}

interface DoodadBiomeLinksProps {
  value: DoodadBiomeLink[];
  biomes: BiomeOption[];
  onChange: (value: DoodadBiomeLink[]) => void;
}

/**
 * The biomes a doodad appears in. Each has its own weight (the chance against the other doodads of that biome) and density
 * (how many are placed there). A doodad in no biome is never placed. (Two numbers per row, so this is its own table
 * rather than a `WeightTable`.)
 */
const DoodadBiomeLinks: React.FC<DoodadBiomeLinksProps> = ({ value, biomes, onChange }) => {
  const free = biomes.filter((b) => !value.some((l) => l.biomeId === b.id));
  const [picked, setPicked] = useState('');
  const selected = free.some((b) => b.id === picked) ? picked : free[0]?.id ?? '';
  const nameOf = (link: DoodadBiomeLink) => biomes.find((b) => b.id === link.biomeId)?.name ?? link.biomeKey ?? link.biomeId;

  const update = (id: string, patch: Partial<DoodadBiomeLink>) => onChange(value.map((l) => (l.biomeId === id ? { ...l, ...patch } : l)));
  const add = () => {
    const biome = biomes.find((b) => b.id === selected);
    if (biome) onChange([...value, { biomeId: biome.id, biomeKey: biome.key, weight: 1, density: 1 }]);
  };

  return (
    <div className={`doodad-biome-links ${panelClass}`}>
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Biomes</h4>
        <p className="text-xs text-slate-500 font-medium">Where this doodad appears. <strong>Weight</strong> is its chance against the other doodads of that biome; <strong>density</strong> is how many are placed there (1 is the usual amount, 0 is none).</p>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-slate-400 font-semibold italic">In no biome yet: the generator never places it.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((link) => (
            <li key={link.biomeId} className="flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-[8rem] text-sm font-bold text-slate-800 truncate" title={link.biomeKey}>{nameOf(link)}</span>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                Weight
                <input aria-label={`${nameOf(link)} weight`} type="number" min={0} step={0.1} value={show(link.weight)} onChange={(e) => update(link.biomeId, { weight: readNumber(e.target.value) })} className={smallInputClass} />
              </label>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                Density
                <input aria-label={`${nameOf(link)} density`} type="number" min={0} step={0.1} value={show(link.density)} onChange={(e) => update(link.biomeId, { density: readNumber(e.target.value) })} className={smallInputClass} />
              </label>
              <button type="button" aria-label={`Remove ${nameOf(link)}`} onClick={() => onChange(value.filter((l) => l.biomeId !== link.biomeId))} className={dangerButtonClass}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <select aria-label="Biome to add" value={selected} disabled={free.length === 0} onChange={(e) => setPicked(e.target.value)} className={`${inputClass} max-w-xs cursor-pointer`}>
          {free.length === 0 && <option value="">{biomes.length === 0 ? 'No biomes exist yet' : 'Every biome is added'}</option>}
          {free.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={free.length === 0} className={buttonClass}>
          + Add Biome
        </button>
      </div>
      {biomes.length === 0 && <span className={hintClass}>Create biomes on the Biomes page first.</span>}
    </div>
  );
};

export default DoodadBiomeLinks;
