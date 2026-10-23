import { BLOCK_SCALE, DEFAULT_SKY_ROWS } from '@mine-me/shared';
import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import './MiningConfigSky.css';

/** Sky card: how many rows of open air sit above the ground in the generated mine. */
export default function MiningConfigSky({ config, onFieldChange }: MiningConfigFieldProps) {
  const skyRows = config.skyRows ?? DEFAULT_SKY_ROWS;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>☁️</span> Sky Above the Ground
        </h3>
        <p className="text-xs text-slate-500">
          Open air above the surface, where the extractor lands and the scenery stands. Depths below are counted from the ground.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-semibold text-slate-700">
          <label htmlFor="skyRows">Sky Height</label>
          <span className="text-sky-600 font-bold">
            {skyRows} blocks ({(skyRows / BLOCK_SCALE).toFixed(1)} original)
          </span>
        </div>
        <input
          id="skyRows"
          type="range"
          min="0"
          max={40 * BLOCK_SCALE}
          step="1"
          value={skyRows}
          onChange={(e) => onFieldChange('skyRows', Number(e.target.value))}
          className="w-full custom-slider cursor-pointer"
        />
        <p className="text-xs text-slate-400">
          The default is about one screen ({DEFAULT_SKY_ROWS} blocks). 0 puts the ground at the very top of the map. Applies to the next run.
        </p>
      </div>
    </div>
  );
}
