import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import { getAssetUrl, type MiningBlockConfig } from '@mine-me/shared';
import './Blocks.css';

export default function Blocks() {
  const [blocks, setBlocks] = useState<MiningBlockConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/blocks')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch mining blocks');
        return res.json();
      })
      .then((data: MiningBlockConfig[]) => {
        setBlocks(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="blocks-page space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">MINING BLOCKS</h2>
          <p className="text-slate-500 font-medium">Manage mining block properties and custom sprite textures.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">Texture</th>
                  <th className="py-4 px-6">Type Key</th>
                  <th className="py-4 px-6">Name</th>
                  <th className="py-4 px-6">Description</th>
                  <th className="py-4 px-6">Mine Time</th>
                  <th className="py-4 px-6">Stamina Cost</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {blocks.map((block) => (
                  <tr key={block.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center p-1">
                        {block.textureUrl ? (
                          <img
                            src={getAssetUrl(block.textureUrl)}
                            alt={block.name}
                            className="w-full h-full object-cover rounded"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Color</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 font-mono font-bold text-slate-700">{block.typeKey}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{block.name}</td>
                    <td className="py-4 px-6 text-slate-500 max-w-xs truncate">{block.description || '—'}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{block.mineTimeMs} ms</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{block.staminaCost}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/blocks/${block.id}`)}
                        className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                      >
                        Edit Block
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
