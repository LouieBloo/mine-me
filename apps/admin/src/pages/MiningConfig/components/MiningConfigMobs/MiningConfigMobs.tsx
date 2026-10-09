import { useEffect, useState } from 'react';
import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import './MiningConfigMobs.css';

interface MobOption {
  id: string;
  name: string;
  aiType?: string;
}

/**
 * Hostile NPCs & Mob Spawning card. Which mobs live in the mine, and which one (if any) stands on
 * the surface as a target dummy, come from the mobs in the database.
 */
export default function MiningConfigMobs({ config, onFieldChange }: MiningConfigFieldProps) {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [mobs, setMobs] = useState<MobOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchWithAuth('/api/admin/mobs?limit=200')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load mobs');
        return res.json();
      })
      .then((list: MobOption[]) => {
        if (!cancelled) setMobs(Array.isArray(list) ? list : []);
      })
      .catch((err) => toast.error(err.message || 'Failed to load mobs'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allowedMobIds = config.allowedMobIds ?? [];
  const toggleMob = (id: string) =>
    onFieldChange(
      'allowedMobIds',
      allowedMobIds.includes(id) ? allowedMobIds.filter((m) => m !== id) : [...allowedMobIds, id]
    );

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

      {/* Which mobs spawn underground */}
      <div className="border-t border-slate-100 pt-3 space-y-2">
        <span className="text-xs font-semibold text-slate-500 block">Underground Species:</span>
        {loading ? (
          <LoadingSpinner size={24} />
        ) : mobs.length === 0 ? (
          <p className="text-xs text-slate-400">No mobs exist yet. Create some in the Mobs section.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mobs.map((mob) => {
              const active = allowedMobIds.includes(mob.id);
              return (
                <label
                  key={mob.id}
                  className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    active
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <input type="checkbox" checked={active} onChange={() => toggleMob(mob.id)} className="cursor-pointer" />
                  <span className="font-bold">{mob.name}</span>
                  <span className="font-mono text-[10px] opacity-70">({mob.id})</span>
                </label>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-400">With none selected, no hostiles spawn underground.</p>
      </div>

      {/* Surface target dummy */}
      <div className="border-t border-slate-100 pt-3 space-y-1">
        <label htmlFor="surfaceDummyMobId" className="text-sm font-semibold text-slate-700">
          Surface Target Dummy
        </label>
        <select
          id="surfaceDummyMobId"
          value={config.surfaceDummyMobId ?? ''}
          onChange={(e) => onFieldChange('surfaceDummyMobId', e.target.value || null)}
          disabled={loading}
          className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 cursor-pointer hover:border-slate-400"
        >
          <option value="">None</option>
          {mobs.map((mob) => (
            <option key={mob.id} value={mob.id}>
              {mob.name} ({mob.aiType ?? 'mob'})
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">A mob placed near the entrance for practising combat.</p>
      </div>
    </div>
  );
}
