import { useEffect, useState } from 'react';
import { DEFAULT_BIOME_BLEND_WIDTH, type BiomeDefinition } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import WeightTable from '../../../../components/WeightTable/WeightTable';
import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import './MiningConfigBiomes.css';

/** Biomes card: which biomes this map has, how strong each is on it, and how soft the borders between them are. */
export default function MiningConfigBiomes({ config, onFieldChange }: MiningConfigFieldProps) {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [biomes, setBiomes] = useState<BiomeDefinition[]>([]);
  const blend = config.biomeBlendWidth ?? DEFAULT_BIOME_BLEND_WIDTH;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/admin/biomes');
        if (!res.ok) throw new Error('Failed to load biomes');
        const list = await res.json();
        if (!cancelled) setBiomes(Array.isArray(list) ? list : []);
      } catch (err: any) {
        if (!cancelled) toast.error(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A biome just added to the map starts at its own weight, not a fixed 1. */
  const startAtOwnWeight = (next: Record<string, number> | null, previous: Record<string, number> | null | undefined) => {
    if (!next) return next;
    const out = { ...next };
    for (const key of Object.keys(out)) {
      if (previous && key in previous) continue;
      const own = biomes.find((b) => b.key === key)?.weight;
      if (typeof own === 'number') out[key] = own;
    }
    return out;
  };

  const options = biomes.filter((b) => !b.isDefault).map((b) => ({ key: b.key, label: b.name }));

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>🗺️</span> Biome Borders
        </h3>
        <p className="text-xs text-slate-500">
          Which biomes this map has and how strong each is here. Where two biomes meet, the content of both is mixed. The biomes themselves are made on the Biomes page.
        </p>
      </div>

      <WeightTable
        id="map-biomes"
        title="Biomes On This Map"
        hint="The weight is how big and common the biome is on this map (a biome's own weight is only the starting value). The default biome fills everywhere else."
        value={config.biomeWeights}
        options={options}
        defaultWeight={1}
        onChange={(value) => onFieldChange('biomeWeights', startAtOwnWeight(value, config.biomeWeights))}
        emptyText="Nothing chosen: every biome is on this map at its own weight."
      />

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-semibold text-slate-700">
          <label htmlFor="biomeBlendWidth">Border Softness</label>
          <span className="text-sky-600 font-bold">{blend === 0 ? 'Hard edges' : blend.toFixed(2)}</span>
        </div>
        <input
          id="biomeBlendWidth"
          type="range"
          min="0"
          max="0.5"
          step="0.01"
          value={blend}
          onChange={(e) => onFieldChange('biomeBlendWidth', Number(e.target.value))}
          className="w-full custom-slider cursor-pointer"
        />
        <p className="text-xs text-slate-400">
          0 makes sharp edges between biomes; higher values make a wider mixed border (default {DEFAULT_BIOME_BLEND_WIDTH}). Applies to the next run.
        </p>
      </div>
    </div>
  );
}
