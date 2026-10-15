import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GasDefinition } from '@mine-me/shared';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import './Gases.css';

export default function Gases() {
  const [gases, setGases] = useState<GasDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/gases')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch gases');
        return res.json();
      })
      .then((data: GasDefinition[]) => setGases(data))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="gases-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">GASES</h2>
          <p className="text-slate-500 font-medium">Hydrogen, nitrogen and friends: how they spread, rise, sink, burn and appear in the mines.</p>
        </div>
        <button
          onClick={() => navigate('/gases/new')}
          className="cursor-pointer px-5 py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
        >
          + New Gas
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[400px]">
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : gases.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-24 text-slate-500">
            <p className="font-bold">No gases yet.</p>
            <p className="text-sm">Create one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">Colour</th>
                  <th className="py-4 px-6">Key</th>
                  <th className="py-4 px-6">Name</th>
                  <th className="py-4 px-6">Density</th>
                  <th className="py-4 px-6">Spreads</th>
                  <th className="py-4 px-6">Burns</th>
                  <th className="py-4 px-6">In Mines</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {gases.map((gas) => (
                  <tr key={gas.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6">
                      <div
                        className="w-12 h-12 rounded-lg border border-slate-300"
                        style={{ backgroundColor: gas.color, opacity: gas.opacity }}
                        aria-label={`${gas.name} colour ${gas.color}`}
                      />
                    </td>
                    <td className="py-4 px-6 font-mono font-bold text-slate-700">{gas.typeKey}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{gas.name}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{gas.density}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{gas.diffusionRate}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{gas.flammability ? 'Yes' : 'No'}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{gas.generation ? `${gas.generation.percentage}%` : 'No'}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/gases/${gas.id}`)}
                        className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                      >
                        Edit Gas
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
