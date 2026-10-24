import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BLOCK_SCALE, getAssetUrl, type DoodadDefinition } from '@mine-me/shared';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { spawnDepthText } from './doodadForm';
import './Doodads.css';

/** "2x2" in original blocks (a third of a block is written as a fraction of 1 decimal). */
export const sizeText = (doodad: Pick<DoodadDefinition, 'width' | 'height'>): string => {
  const fmt = (n: number) => (Math.round((n / BLOCK_SCALE) * 10) / 10).toString();
  return `${fmt(doodad.width)} x ${fmt(doodad.height)}`;
};

export default function Doodads() {
  const [doodads, setDoodads] = useState<DoodadDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/doodads')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch doodads');
        return res.json();
      })
      .then((data: DoodadDefinition[]) => setDoodads(data))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="doodads-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">DOODADS</h2>
          <p className="text-slate-500 font-medium">Scenery of the mine: mushrooms, grass, drips, crystals and bugs. They are drawn behind the characters and never get in the way.</p>
        </div>
        <button
          onClick={() => navigate('/doodads/new')}
          className="cursor-pointer px-5 py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
        >
          + New Doodad
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[400px]">
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : doodads.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-24 text-slate-500">
            <p className="font-bold">No doodads yet.</p>
            <p className="text-sm">The mine has no scenery until you create some and give them a biome to appear in.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">Picture</th>
                  <th className="py-4 px-6">Key</th>
                  <th className="py-4 px-6">Name</th>
                  <th className="py-4 px-6">Anchor</th>
                  <th className="py-4 px-6">Size (original blocks)</th>
                  <th className="py-4 px-6">Depth (original blocks)</th>
                  <th className="py-4 px-6">Biomes</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {doodads.map((doodad) => (
                  <tr key={doodad.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6">
                      <div className="w-12 h-12 rounded-lg border border-slate-300 bg-slate-100 flex items-center justify-center overflow-hidden">
                        {doodad.textureUrl ? (
                          <img src={getAssetUrl(doodad.textureUrl)} alt={`${doodad.name} picture`} className="max-w-full max-h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                        ) : (
                          <span className="text-[9px] font-black uppercase text-slate-400 text-center leading-tight">No art</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 font-mono font-bold text-slate-700">{doodad.key}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{doodad.name}</td>
                    <td className="py-4 px-6">
                      <span className="px-3 py-1 bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-wider rounded-full">{doodad.anchor}</span>
                    </td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{sizeText(doodad)}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{spawnDepthText(doodad.spawn)}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">
                      {doodad.biomes?.length ? doodad.biomes.map((b) => b.biomeKey ?? b.biomeId).join(', ') : <span className="text-slate-400 italic">none</span>}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/doodads/${doodad.id}`)}
                        className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                      >
                        Edit Doodad
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
