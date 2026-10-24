import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BLOCK_SCALE, type BiomeDefinition } from '@mine-me/shared';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import './Biomes.css';

/** "30-90" in original blocks, or "30-bottom". */
export const depthText = (biome: Pick<BiomeDefinition, 'minDepth' | 'maxDepth'>): string => {
  const from = (biome.minDepth / BLOCK_SCALE).toFixed(0);
  return biome.maxDepth === null || biome.maxDepth === undefined ? `${from} - bottom` : `${from} - ${(biome.maxDepth / BLOCK_SCALE).toFixed(0)}`;
};

export default function Biomes() {
  const [biomes, setBiomes] = useState<BiomeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/biomes')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch biomes');
        return res.json();
      })
      .then((data: BiomeDefinition[]) => setBiomes(data))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="biomes-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">BIOMES</h2>
          <p className="text-slate-500 font-medium">Regions of the mine: what blocks, fluids, gases and mobs they have and how the cave looks there.</p>
        </div>
        <button
          onClick={() => navigate('/biomes/new')}
          className="cursor-pointer px-5 py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
        >
          + New Biome
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[400px]">
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : biomes.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-24 text-slate-500">
            <p className="font-bold">No biomes yet.</p>
            <p className="text-sm">The whole mine is one plain region until you create some. The first biome you create becomes the default.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">Tint</th>
                  <th className="py-4 px-6">Key</th>
                  <th className="py-4 px-6">Name</th>
                  <th className="py-4 px-6">Depth (original blocks)</th>
                  <th className="py-4 px-6">Weight</th>
                  <th className="py-4 px-6">Size</th>
                  <th className="py-4 px-6">Role</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {biomes.map((biome) => (
                  <tr key={biome.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6">
                      <div
                        className="w-12 h-12 rounded-lg border border-slate-300 bg-slate-100"
                        style={biome.ambient?.tint ? { backgroundColor: biome.ambient.tint } : undefined}
                        aria-label={biome.ambient?.tint ? `${biome.name} tint ${biome.ambient.tint}` : `${biome.name} has no tint`}
                      />
                    </td>
                    <td className="py-4 px-6 font-mono font-bold text-slate-700">{biome.key}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{biome.name}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{depthText(biome)}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{biome.weight}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{(biome.noiseScale / BLOCK_SCALE).toFixed(0)}</td>
                    <td className="py-4 px-6">
                      {biome.isDefault && <span className="px-3 py-1 bg-emerald-100 text-emerald-700 font-black text-xs uppercase tracking-wider rounded-full">Default</span>}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/biomes/${biome.id}`)}
                        className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                      >
                        Edit Biome
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
