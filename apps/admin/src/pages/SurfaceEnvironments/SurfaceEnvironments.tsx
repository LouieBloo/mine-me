import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WEATHER_IDS, WEATHER_TYPES, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import './SurfaceEnvironments.css';

/** "Clear, Cloudy, Rain": the weather an environment gets, most likely first. */
export const weatherSummary = (env: Pick<SurfaceEnvironmentDefinition, 'weather'>): string => {
  const kinds = WEATHER_IDS.filter((id) => (env.weather?.[id] ?? 0) > 0).sort((a, b) => (env.weather![b] ?? 0) - (env.weather![a] ?? 0));
  return kinds.length === 0 ? 'Always clear' : kinds.map((id) => WEATHER_TYPES[id].label).join(', ');
};

export default function SurfaceEnvironments() {
  const [environments, setEnvironments] = useState<SurfaceEnvironmentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/surface-environments')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch surface environments');
        return res.json();
      })
      .then((data: SurfaceEnvironmentDefinition[]) => setEnvironments(data))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="surface-environments-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">SURFACE</h2>
          <p className="text-slate-500 font-medium">The sky, scenery, clouds, weather and props above the ground. Each run picks one by weight, from its seed.</p>
        </div>
        <button
          onClick={() => navigate('/surface-environments/new')}
          className="cursor-pointer px-5 py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
        >
          + New Environment
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[300px]">
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : environments.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-24 text-slate-500">
            <p className="font-bold">No environments yet.</p>
            <p className="text-sm">Runs use a plain blue day until you create some.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">Key</th>
                  <th className="py-4 px-6">Name</th>
                  <th className="py-4 px-6">Weight</th>
                  <th className="py-4 px-6">Weather</th>
                  <th className="py-4 px-6">Scenery</th>
                  <th className="py-4 px-6">Props</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {environments.map((env) => (
                  <tr key={env.id} className="environment-row transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-slate-700">{env.key}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">
                      {env.name}
                      {env.isDefault && <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 font-black text-[10px] uppercase tracking-wider rounded-full">Default</span>}
                    </td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{env.weight}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{weatherSummary(env)}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{env.layers.length} layer{env.layers.length === 1 ? '' : 's'}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{env.props?.length ?? 0}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/surface-environments/${env.id}`)}
                        className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
