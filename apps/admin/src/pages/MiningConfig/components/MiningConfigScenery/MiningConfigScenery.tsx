import { DEFAULT_DOODAD_MAX_COUNT, DEFAULT_DOODAD_MAX_LIGHTS } from '@mine-me/shared';
import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import './MiningConfigScenery.css';

/** Scenery card: how many doodads (mushrooms, moss, drips, bugs...) the generated mine holds at most, and how many of them may glow at once. */
export default function MiningConfigScenery({ config, onFieldChange }: MiningConfigFieldProps) {
  const maxCount = config.doodadMaxCount ?? DEFAULT_DOODAD_MAX_COUNT;
  const maxLights = config.doodadMaxLights ?? DEFAULT_DOODAD_MAX_LIGHTS;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>🍄</span> Scenery
        </h3>
        <p className="text-xs text-slate-500">
          Doodads are decoration only. Which ones appear, and how often, is set on each doodad for each biome.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-semibold text-slate-700">
          <label htmlFor="doodadMaxCount">Most Doodads</label>
          <span className="text-sky-600 font-bold">{maxCount === 0 ? 'None' : maxCount}</span>
        </div>
        <input
          id="doodadMaxCount"
          type="range"
          min="0"
          max="2000"
          step="10"
          value={maxCount}
          onChange={(e) => onFieldChange('doodadMaxCount', Number(e.target.value))}
          className="w-full custom-slider cursor-pointer"
        />
        <p className="text-xs text-slate-400">
          A cap that keeps the scene cheap (default {DEFAULT_DOODAD_MAX_COUNT}). 0 means no doodads. Applies to the next run.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-semibold text-slate-700">
          <label htmlFor="doodadMaxLights">Most Doodad Lights</label>
          <span className="text-sky-600 font-bold">{maxLights === 0 ? 'None' : maxLights}</span>
        </div>
        <input
          id="doodadMaxLights"
          type="range"
          min="0"
          max="40"
          step="1"
          value={maxLights}
          onChange={(e) => onFieldChange('doodadMaxLights', Number(e.target.value))}
          className="w-full custom-slider cursor-pointer"
        />
        <p className="text-xs text-slate-400">
          Glowing doodads each cost a light; only this many near the player light up at once (default {DEFAULT_DOODAD_MAX_LIGHTS}). Applies to the next run.
        </p>
      </div>
    </div>
  );
}
