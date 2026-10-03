import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import './MiningConfigResources.css';

/**
 * Resources & Hazards card: rocks, chests, ore veins, clustering.
 */
export default function MiningConfigResources({ config, onFieldChange }: MiningConfigFieldProps) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>💎</span> Resources & Hazards
        </h3>
        <p className="text-xs text-slate-500">
          Controls mineral ore clustering, stable rock formations, and treasure chest spawns.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="rockPercentage" className="text-sm font-semibold text-slate-700">
            Falling Rocks (%)
          </label>
          <input
            id="rockPercentage"
            type="number"
            min="1"
            max="40"
            value={config.rockPercentage}
            onChange={e => onFieldChange('rockPercentage', Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <p className="text-xs text-slate-400">Guaranteed supported.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="chestCount" className="text-sm font-semibold text-slate-700">
            Treasure Chests
          </label>
          <input
            id="chestCount"
            type="number"
            min="0"
            max="15"
            value={config.chestCount}
            onChange={e => onFieldChange('chestCount', Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <p className="text-xs text-slate-400">Placed on cavern floors.</p>
        </div>
      </div>

      {/* Ore Veins & Clustering */}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <span>⚡</span> Ore Veins & Discrete Nodes
          </h4>
          <p className="text-xs text-slate-500">
            Controls node clustering and generation for Copperium and Silverium.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="copperiumPercentage" className="text-sm font-semibold text-slate-700">
              Copperium Abundance (%)
            </label>
            <input
              id="copperiumPercentage"
              type="number"
              min="0"
              max="20"
              value={config.copperiumPercentage ?? 4}
              onChange={e => onFieldChange('copperiumPercentage', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-slate-400">Common conductive ore throughout strata.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="silveriumPercentage" className="text-sm font-semibold text-slate-700">
              Silverium Abundance (%)
            </label>
            <input
              id="silveriumPercentage"
              type="number"
              min="0"
              max="20"
              value={config.silveriumPercentage ?? 2}
              onChange={e => onFieldChange('silveriumPercentage', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-slate-400">Rarer high-grade energy conductor.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="silveriumMinDepth" className="text-sm font-semibold text-slate-700">
              Silverium Min Depth (Tiles)
            </label>
            <input
              id="silveriumMinDepth"
              type="number"
              min="1"
              max="40"
              value={config.silveriumMinDepth ?? 12}
              onChange={e => onFieldChange('silveriumMinDepth', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-slate-400">Prevents Silverium from appearing near surface.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="oreClusterChance" className="text-sm font-semibold text-slate-700">
              Ore Cluster Chance (%)
            </label>
            <input
              id="oreClusterChance"
              type="number"
              min="0"
              max="100"
              value={config.oreClusterChance ?? 65}
              onChange={e => onFieldChange('oreClusterChance', Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-slate-400">Probability of expanding seed into 2-5 contiguous tiles.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
