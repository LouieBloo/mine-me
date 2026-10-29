import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OBJECTIVE_TYPES, type MissionDefinition } from '@mine-me/shared';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { tierName } from './missionForm';
import MissionSimulator from './MissionSimulator/MissionSimulator';
import './Missions.css';

/** "Collect an item, Kill mobs": the kinds of goal a mission has, in order. */
export const objectiveSummary = (mission: Pick<MissionDefinition, 'objectives'>): string =>
  mission.objectives.map((o) => OBJECTIVE_TYPES[o.type]?.label ?? o.type).join(' + ');

export default function Missions() {
  const [missions, setMissions] = useState<MissionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/missions')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch missions');
        return res.json();
      })
      .then((data: MissionDefinition[]) => setMissions(data))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="missions-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">MISSIONS</h2>
          <p className="text-slate-500 font-medium">A goal for each run. Before the mine is made, a player picks one of two to four missions that fit their level.</p>
        </div>
        <button
          onClick={() => navigate('/missions/new')}
          className="cursor-pointer px-5 py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
        >
          + New Mission
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[300px]">
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : missions.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-24 text-slate-500">
            <p className="font-bold">No missions yet.</p>
            <p className="text-sm">Runs have no goal until you create some missions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">Key</th>
                  <th className="py-4 px-6">Name</th>
                  <th className="py-4 px-6">Tier</th>
                  <th className="py-4 px-6">Levels</th>
                  <th className="py-4 px-6">Goals</th>
                  <th className="py-4 px-6">Reward</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {missions.map((mission) => (
                  <tr key={mission.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-slate-700">{mission.key}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{mission.name}</td>
                    <td className="py-4 px-6">
                      <span className="px-3 py-1 bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-wider rounded-full">{tierName(mission.tier)}</span>
                    </td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{mission.minLevel}-{mission.maxLevel}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{objectiveSummary(mission)}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">
                      {mission.rewardSol} Sol, {mission.rewardXp} XP{mission.rewardItems?.length ? `, ${mission.rewardItems.length} item${mission.rewardItems.length === 1 ? '' : 's'}` : ''}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/missions/${mission.id}`)}
                        className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                      >
                        Edit Mission
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MissionSimulator />
    </div>
  );
}
