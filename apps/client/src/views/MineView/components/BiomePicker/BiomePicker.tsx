import React, { useCallback, useEffect, useState } from 'react';
import type { PickableBiome } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import { LoadingSpinner } from '../../../../components/LoadingSpinner/LoadingSpinner';
import './BiomePicker.css';

export interface BiomePickerProps {
  /** Keys of the chosen biomes. Empty means "All biomes (normal)". */
  selected: string[];
  onChange: (selected: string[]) => void;
}

/** Adds or removes a biome from the chosen keys, keeping the order they were picked in. */
export const toggleBiomeKey = (selected: readonly string[], key: string): string[] =>
  selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];

/**
 * The optional biome step of a Single Player run. Nothing chosen is a normal run; chosen biomes are the only ones in the
 * mine, at any depth. The list is whatever biomes the server has loaded.
 */
export const BiomePicker: React.FC<BiomePickerProps> = ({ selected, onChange }) => {
  const { fetchWithAuth } = useApi();
  const [biomes, setBiomes] = useState<PickableBiome[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    setError(null);
    setBiomes(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    fetchWithAuth('/api/game/biomes')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Could not load the biomes');
        }
        return res.json() as Promise<PickableBiome[]>;
      })
      .then((list) => {
        if (active) setBiomes(list);
      })
      .catch((err: Error) => {
        if (active) setError(err.message || 'Could not load the biomes');
      });
    return () => {
      active = false;
    };
  }, [fetchWithAuth, attempt]);

  return (
    <div className="biome-picker space-y-3" data-testid="biome-picker">
      <button
        type="button"
        aria-pressed={selected.length === 0}
        onClick={() => onChange([])}
        className={`biome-option w-full text-left p-3 rounded-lg border-2 cursor-pointer transition ${
          selected.length === 0 ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800/80 hover:border-amber-500/60'
        }`}
      >
        <span className="block font-bold text-white text-sm">All biomes (normal)</span>
        <span className="block text-xs text-slate-400">The usual mine: every biome in its own depth range.</span>
      </button>

      {biomes === null && !error && (
        <div className="py-4">
          <LoadingSpinner size="md" message="Loading biomes..." />
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-sm text-red-200 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={load} className="px-3 py-1 text-xs font-bold rounded bg-red-900/60 hover:bg-red-800 cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {biomes && biomes.length === 0 && <p className="text-xs text-slate-400">No biomes are defined yet, so every mine is the usual one.</p>}

      {biomes && biomes.length > 0 && (
        <>
          <p className="text-xs text-slate-400">Or pick the biomes to explore. Only the ones you pick appear, at every depth.</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            {biomes.map((biome) => {
              const checked = selected.includes(biome.key);
              return (
                <li key={biome.key}>
                  <label
                    className={`biome-option flex items-start gap-2 p-2 rounded-lg border-2 cursor-pointer transition ${
                      checked ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800/80 hover:border-amber-500/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 cursor-pointer"
                      checked={checked}
                      onChange={() => onChange(toggleBiomeKey(selected, biome.key))}
                      aria-label={biome.name}
                    />
                    <span>
                      <span className="block font-semibold text-sm text-white">{biome.name}</span>
                      {biome.description && <span className="block text-xs text-slate-400">{biome.description}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};
