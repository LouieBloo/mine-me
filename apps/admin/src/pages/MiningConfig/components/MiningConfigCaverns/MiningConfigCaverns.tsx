import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import './MiningConfigCaverns.css';

/**
 * Cavern generation (cellular automata) + Tunnel generation (random-walk worms) cards.
 */
export default function MiningConfigCaverns({ config, onFieldChange }: MiningConfigFieldProps) {
  return (
    <>
      {/* Cavern Generation Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>🕳️</span> Cavern Generation (Cellular Automata)
          </h3>
          <p className="text-xs text-slate-500">
            Sculpts organic open chambers and subterranean hollows using depth-scaled cellular automata.
          </p>
        </div>

        {/* Cavern Density Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-semibold text-slate-700">
            <label htmlFor="cavernDensity">Cavern Density (Open Space Ratio)</label>
            <span className="text-blue-600 font-bold">{config.cavernDensity}%</span>
          </div>
          <input
            id="cavernDensity"
            type="range"
            min="0"
            max="90"
            value={config.cavernDensity}
            onChange={e => onFieldChange('cavernDensity', Number(e.target.value))}
            className="w-full custom-slider cursor-pointer"
          />
          <p className="text-xs text-slate-400">
            Higher density creates expansive, sweeping hollows. Lower density leaves thick, dense rock.
          </p>
        </div>

        {/* Cavern Smoothing Iterations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="cavernIterations" className="text-sm font-semibold text-slate-700">
              Smoothing Passes
            </label>
            <input
              id="cavernIterations"
              type="number"
              min="1"
              max="6"
              value={config.cavernIterations}
              onChange={e => onFieldChange('cavernIterations', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-slate-400">Iterations of the 4-5 neighbor rule (3-4 is optimal).</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="cavernMinDepth" className="text-sm font-semibold text-slate-700">
              Cavern Start Depth (Tiles)
            </label>
            <input
              id="cavernMinDepth"
              type="number"
              min="1"
              max="15"
              value={config.cavernMinDepth}
              onChange={e => onFieldChange('cavernMinDepth', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-slate-400">Depth where caverns begin forming (protects surface).</p>
          </div>
        </div>
      </div>

      {/* Tunnel Generation Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>⛏️</span> Tunnel Generation (Random-Walk Worms)
          </h3>
          <p className="text-xs text-slate-500">
            Carves winding mine shafts connecting isolated caverns and creating exploratory corridors.
          </p>
        </div>

        {/* Tunnel Count Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-semibold text-slate-700">
            <label htmlFor="tunnelCount">Tunnel Count</label>
            <span className="text-blue-600 font-bold">{config.tunnelCount} Worms</span>
          </div>
          <input
            id="tunnelCount"
            type="range"
            min="0"
            max="20"
            value={config.tunnelCount}
            onChange={e => onFieldChange('tunnelCount', Number(e.target.value))}
            className="w-full custom-slider cursor-pointer"
          />
          <p className="text-xs text-slate-400">Number of random-walk diggers carving across the strata.</p>
        </div>

        {/* Min and Max Length */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="tunnelMinLength" className="text-sm font-semibold text-slate-700">
              Min Tunnel Length (Steps)
            </label>
            <input
              id="tunnelMinLength"
              type="number"
              min="5"
              max="60"
              value={config.tunnelMinLength}
              onChange={e => onFieldChange('tunnelMinLength', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="tunnelMaxLength" className="text-sm font-semibold text-slate-700">
              Max Tunnel Length (Steps)
            </label>
            <input
              id="tunnelMaxLength"
              type="number"
              min="10"
              max="100"
              value={config.tunnelMaxLength}
              onChange={e => onFieldChange('tunnelMaxLength', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Tunnel Width & Min Depth */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="tunnelWidth" className="text-sm font-semibold text-slate-700">
              Tunnel Width
            </label>
            <select
              id="tunnelWidth"
              value={config.tunnelWidth}
              onChange={e => onFieldChange('tunnelWidth', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
            >
              <option value={1}>1 Tile (Narrow Shaft)</option>
              <option value={2}>2 Tiles (Wide Shaft)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="tunnelMinDepth" className="text-sm font-semibold text-slate-700">
              Tunnel Start Depth (Tiles)
            </label>
            <input
              id="tunnelMinDepth"
              type="number"
              min="1"
              max="10"
              value={config.tunnelMinDepth}
              onChange={e => onFieldChange('tunnelMinDepth', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>
    </>
  );
}
