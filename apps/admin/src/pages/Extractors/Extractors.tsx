import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExtractorDefinition } from '@mine-me/shared';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import './Extractors.css';

export default function Extractors() {
  const [extractors, setExtractors] = useState<ExtractorDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/extractors')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch extractors');
        return res.json();
      })
      .then((data: ExtractorDefinition[]) => setExtractors(data))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="extractors-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">EXTRACTORS</h2>
          <p className="text-slate-500 font-medium">The machine that lands on the surface, takes the loot, and runs the conveyor belt down into the mine.</p>
        </div>
        <button
          onClick={() => navigate('/extractors/new')}
          className="cursor-pointer px-5 py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
        >
          + New Extractor
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[400px]">
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : extractors.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-24 text-slate-500">
            <p className="font-bold">No extractors yet.</p>
            <p className="text-sm">Runs use the built-in extractor until you create one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">Key</th>
                  <th className="py-4 px-6">Name</th>
                  <th className="py-4 px-6">Size</th>
                  <th className="py-4 px-6">Build (s/segment)</th>
                  <th className="py-4 px-6">Belt Speed</th>
                  <th className="py-4 px-6">Default</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {extractors.map((extractor) => (
                  <tr key={extractor.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-slate-700">{extractor.key}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{extractor.name}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{extractor.width} x {extractor.height}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{extractor.buildSecondsPerSegment}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{extractor.beltSpeed}</td>
                    <td className="py-4 px-6 text-slate-600 font-semibold">{extractor.isDefault ? 'Yes' : ''}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/extractors/${extractor.id}`)}
                        className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm"
                      >
                        Edit Extractor
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
