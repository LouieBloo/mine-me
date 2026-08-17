import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import BlockTextureUpload from './BlockTextureUpload';
import type { MiningBlockConfig } from '@mine-me/shared';
import './BlockDetail.css';

export default function BlockDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { fetchWithAuth } = useApi();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [block, setBlock] = useState<MiningBlockConfig | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    mineTimeMs: 500,
    staminaCost: 1,
  });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchWithAuth(`/api/admin/blocks/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch block details');
        return res.json();
      })
      .then((data: MiningBlockConfig) => {
        setBlock(data);
        setFormData({
          name: data.name || '',
          description: data.description || '',
          mineTimeMs: data.mineTimeMs ?? 500,
          staminaCost: data.staminaCost ?? 1,
        });
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err.message);
        setLoading(false);
      });
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!block) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/blocks/${block.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update block');
      }

      const updated = await res.json();
      setBlock(updated);
      toast.success('Block properties saved successfully!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <LoadingSpinner size={60} />
      </div>
    );
  }

  if (!block) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-bold text-slate-700">Block not found</h3>
        <button
          onClick={() => navigate('/blocks')}
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg font-bold"
        >
          Back to Blocks
        </button>
      </div>
    );
  }

  return (
    <div className="block-detail-page max-w-5xl mx-auto space-y-8 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/blocks')}
            className="cursor-pointer text-xs font-black uppercase text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2"
          >
            ← Back to Blocks
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{block.name}</h2>
            <span className="px-3 py-1 bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-full">
              {block.typeKey}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 p-6">
              <h3 className="text-xl font-black text-white tracking-tight uppercase">Block Properties</h3>
              <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">
                Configure mining duration and stamina costs
              </p>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                  Block Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                    Mine Time (Milliseconds)
                  </label>
                  <input
                    type="number"
                    name="mineTimeMs"
                    value={formData.mineTimeMs}
                    onChange={handleChange}
                    min={0}
                    step={50}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
                  />
                  <span className="text-[11px] text-slate-400 font-medium">0 ms for unmineable blocks</span>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                    Stamina Cost
                  </label>
                  <input
                    type="number"
                    name="staminaCost"
                    value={formData.staminaCost}
                    onChange={handleChange}
                    min={0}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
                  />
                  <span className="text-[11px] text-slate-400 font-medium">Stamina spent per block mined</span>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="cursor-pointer w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <LoadingSpinner size={20} color="inherit" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    'Save Block Properties'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="space-y-8">
          <BlockTextureUpload
            block={block}
            onUploadSuccess={(updated) => setBlock(updated)}
          />
        </div>
      </div>
    </div>
  );
}
