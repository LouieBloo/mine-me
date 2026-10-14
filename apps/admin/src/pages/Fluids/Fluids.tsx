import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FluidDefinition } from '@mine-me/shared';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import './Fluids.css';

export default function Fluids() {
  const [fluids, setFluids] = useState<FluidDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/fluids')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch fluids');
        return res.json();
      })
      .then((data: FluidDefinition[]) => setFluids(data))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fluids-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">FLUIDS</h2>
          <p className="text-slate-500 font-medium">Oil, water, lava and friends: how they flow, burn and appear in the mines.</p>
        </div>
        <button
          onClick={() => navigate('/fluids/new')}
          className="cursor-pointer px-5 py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
        >
          + New Fluid
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[400px]">
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : fluids.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-24 text-slate-500">
            <p className="font-bold">No fluids yet.</p>
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
                  <th className="py-4 px-6">Viscosity</th>
                  <th className="py-4 px-6">Burns</th>
                  <th className="py-4 px-6">In Mines</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {fluids.map((fluid) => (
                  <tr key={fluid.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6">
                      <div
                        className="w-12 h-12 rounded-lg border border-slate-300"
                        style={{ backgroundColor: fluid.color, opacity: fluid.opacity }}
                        aria-label={`${fluid.name} colour ${fluid.color}`}
                      />
                    </td>
                    <td className="py-4 px-6 font-mono font-bold text-slate-700">{fluid.typeKey}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{fluid.name}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{fluid.density}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{fluid.viscosity}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{fluid.flammability ? 'Yes' : 'No'}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{fluid.generation ? `${fluid.generation.percentage}%` : 'No'}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/fluids/${fluid.id}`)}
                        className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                      >
                        Edit Fluid
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
