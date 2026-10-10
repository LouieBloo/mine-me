import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { deriveCombatStats } from '@mine-me/shared';
import { ModularRigEditor } from '../../components/ModularRigEditor/ModularRigEditor';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import './MobViewer.css';

export interface MobListItem {
  id: string;
  name: string;
  level: number;
  health: number;
  defense: number;
  mobEffects?: { value: number; effect?: Record<string, any> }[];
  aiType?: string;
  moveSpeed?: number;
  jumpForce?: number;
  animations?: any;
}

export default function MobViewer() {
  const [mobs, setMobs] = useState<MobListItem[]>([]);
  const [selectedMobId, setSelectedMobId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const navigate = useNavigate();

  const loadMobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/admin/mobs');
      if (!res.ok) {
        throw new Error(`Failed to fetch mobs (${res.status} ${res.statusText})`);
      }
      const data: MobListItem[] = await res.json();
      setMobs(data);
      if (data.length > 0) {
        // Default to first mob or keep current selection if valid
        setSelectedMobId((prev) => (data.some((m) => m.id === prev) ? prev : data[0].id));
      }
    } catch (err: any) {
      const msg = err.message || 'Error loading mob list';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, toast]);

  useEffect(() => {
    loadMobs();
  }, [loadMobs]);

  const selectedMob = mobs.find((m) => m.id === selectedMobId) || null;

  return (
    <div className="mob-viewer-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center space-x-3">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl text-xl">👾</span>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">MOB VIEWER</h2>
              <p className="text-slate-500 font-medium text-xs mt-0.5">
                Preview and configure skeletal rigging, bone pivots, and animation for active mobs.
              </p>
            </div>
          </div>
        </div>

        {/* Mob Selector Controls */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          {mobs.length > 0 && (
            <div className="relative flex-1 md:w-64">
              <label htmlFor="mob-select" className="sr-only">
                Select Mob
              </label>
              <select
                id="mob-select"
                value={selectedMobId}
                onChange={(e) => setSelectedMobId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm font-bold rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer shadow-sm hover:bg-slate-100"
              >
                {mobs.map((mob) => (
                  <option key={mob.id} value={mob.id}>
                    {mob.name} (Lv.{mob.level} | {mob.aiType || 'CHASE_AND_MINE'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedMob && (
            <button
              onClick={() => navigate(`/mobs/${selectedMob.id}`)}
              className="cursor-pointer px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center space-x-1.5 shrink-0"
              title="Edit stats and drops in Mob Details"
            >
              <span>⚙️</span>
              <span>Edit Mob Details</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2 text-red-700 text-sm font-semibold">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={loadMobs}
            className="cursor-pointer px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
          <LoadingSpinner size={60} />
          <p className="mt-4 text-sm font-bold text-slate-400 uppercase tracking-widest">
            Loading Mob Rigging Editor...
          </p>
        </div>
      ) : mobs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-center">
          <span className="text-4xl mb-3">📭</span>
          <h3 className="text-lg font-bold text-slate-700">No Mobs Found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">
            Create your first mob in the Mobs Editor to start configuring skeletal rigs.
          </p>
          <button
            onClick={() => navigate('/mobs/new')}
            className="cursor-pointer mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition-all"
          >
            + Create New Mob
          </button>
        </div>
      ) : selectedMob ? (
        <div className="flex-1 flex flex-col min-h-0 space-y-4">
          {/* Quick Info Bar */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-medium shadow-sm">
            <span className="text-slate-400 font-bold uppercase tracking-wider">Active Mob:</span>
            <span className="font-black text-indigo-300 text-sm">{selectedMob.name}</span>
            <span className="text-slate-500">|</span>
            <span>ID: <code className="text-slate-300 font-mono">{selectedMob.id}</code></span>
            <span className="text-slate-500">|</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-700 font-bold text-emerald-400">
              HP: {selectedMob.health}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-700 font-bold text-amber-400">
              ATK: {deriveCombatStats(selectedMob.mobEffects).weaponDamage}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-700 font-bold text-sky-400">
              AI: {selectedMob.aiType || 'CHASE_AND_MINE'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-700 font-bold text-purple-300">
              Speed: {selectedMob.moveSpeed ?? 2.5}
            </span>
          </div>

          {/* Modular Rig Editor */}
          <div className="flex-1 min-h-0">
            <ModularRigEditor
              key={selectedMob.id}
              target={{ type: 'mob', mobId: selectedMob.id, mobName: selectedMob.name }}
              initialManifestData={selectedMob.animations?.parts ? selectedMob.animations : null}
              showHeader={true}
              onSaveSuccess={(updatedManifest) => {
                setMobs((prev) =>
                  prev.map((m) => (m.id === selectedMob.id ? { ...m, animations: updatedManifest } : m))
                );
                toast.success(`${selectedMob.name} skeleton manifest saved successfully!`);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
