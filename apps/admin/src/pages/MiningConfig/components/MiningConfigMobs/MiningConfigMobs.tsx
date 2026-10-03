import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import './MiningConfigMobs.css';

/**
 * Hostile NPCs & Mob Spawning card.
 */
export default function MiningConfigMobs({ config, onFieldChange }: MiningConfigFieldProps) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>🦇</span> Hostile NPCs & Mob Spawning
        </h3>
        <p className="text-xs text-slate-500">
          Configure subterranean monster population, minimum cavern spawn depth, and hostile behavior.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label htmlFor="mobSpawnCount" className="text-sm font-semibold text-slate-700">
              Active Mob Count
            </label>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
              {config.mobSpawnCount ?? 3} Mobs
            </span>
          </div>
          <input
            id="mobSpawnCount"
            type="range"
            min="0"
            max="10"
            step="1"
            value={config.mobSpawnCount ?? 3}
            onChange={e => onFieldChange('mobSpawnCount', Number(e.target.value))}
            className="w-full custom-slider cursor-pointer"
          />
          <p className="text-xs text-slate-400">Total hostiles procedurally seeded in cavern pockets.</p>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label htmlFor="mobSpawnMinDepth" className="text-sm font-semibold text-slate-700">
              Min Spawn Depth
            </label>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
              Depth {config.mobSpawnMinDepth ?? 5}+
            </span>
          </div>
          <input
            id="mobSpawnMinDepth"
            type="range"
            min="2"
            max="25"
            step="1"
            value={config.mobSpawnMinDepth ?? 5}
            onChange={e => onFieldChange('mobSpawnMinDepth', Number(e.target.value))}
            className="w-full custom-slider cursor-pointer"
          />
          <p className="text-xs text-slate-400">Keeps upper entrance levels safe for starting miners.</p>
        </div>
      </div>

      {/* Configured Mob Species */}
      <div className="border-t border-slate-100 pt-3">
        <span className="text-xs font-semibold text-slate-500 block mb-2">Available Underground Species:</span>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-900">
            <span className="text-base">🦹</span>
            <div>
              <span className="font-bold">Mole Person</span>
              <span className="text-amber-600 ml-1.5 font-mono text-[10px]">(cmn_mole_person_001)</span>
            </div>
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-200 text-amber-800">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
