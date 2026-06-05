import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';

export default function EffectDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [data, setData] = useState<any>(isNew ? { name: '', description: '', healthGain: false, staminaGain: false } : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  useEffect(() => {
    if (isNew) return;
    fetchWithAuth(`/api/admin/effects/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch effect details');
        return res.json();
      })
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message);
        setLoading(false);
      });
  }, [id, isNew]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = isNew ? `/api/admin/effects` : `/api/admin/effects/${id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetchWithAuth(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        if (res.status === 400) {
          const errData = await res.json();
          const newErrors: any = {};
          errData.errors?.forEach((e: any) => { newErrors[e.path] = e.msg; });
          setErrors(newErrors);
          throw new Error('Please fix the validation errors.');
        }
        throw new Error('Failed to save effect');
      }
      setErrors({});
      const savedEffect = await res.json();
      toast.success(isNew ? 'Effect created successfully!' : 'Effect saved successfully!');
      if (isNew) {
        navigate(`/effects/${savedEffect.id}`, { replace: true });
        setData(savedEffect);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this effect? This action cannot be undone.')) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/effects/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete effect');
      toast.success('Effect deleted successfully!');
      navigate('/effects');
    } catch (err: any) {
      toast.error(err.message);
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner size={80} />;
  if (!data) return <div className="p-8 text-red-500 font-bold">Effect not found.</div>;

  return (
    <div className="max-w-4xl space-y-8 relative pb-20">
      {saving && <LoadingSpinner fullScreen />}

      <div className="flex items-center space-x-4">
        <button onClick={() => navigate('/effects')} className="cursor-pointer p-2 hover:bg-slate-200 rounded-full transition-colors">
          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">{isNew ? 'NEW EFFECT' : 'EFFECT DETAILS'}</h2>
          {!isNew && <p className="text-slate-500 font-medium">ID: {id}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200">
        <form onSubmit={handleSave} className="p-8 space-y-6">
          <h3 className="text-xl font-black text-slate-800 border-b border-slate-100 pb-2">Effect Config</h3>
          <div className="grid grid-cols-1 gap-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Name</label>
              <input 
                type="text" 
                value={data.name} 
                onChange={(e) => { setData({ ...data, name: e.target.value }); if (errors.name) setErrors({...errors, name: ''}); }} 
                className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.name ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`} 
              />
              {errors.name && <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{errors.name}</p>}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Description</label>
              <textarea 
                value={data.description} 
                onChange={(e) => { setData({ ...data, description: e.target.value }); if (errors.description) setErrors({...errors, description: ''}); }} 
                className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all h-24 ${errors.description ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`} 
              />
              {errors.description && <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{errors.description}</p>}
            </div>

            {/* Gains toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <label className="text-sm font-black text-slate-700 uppercase tracking-widest cursor-pointer flex items-center">
                <input
                  type="checkbox"
                  checked={data.healthGain || false}
                  onChange={(e) => setData({ ...data, healthGain: e.target.checked })}
                  className="w-5 h-5 mr-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Grants Health Gain
              </label>

              <label className="text-sm font-black text-slate-700 uppercase tracking-widest cursor-pointer flex items-center">
                <input
                  type="checkbox"
                  checked={data.staminaGain || false}
                  onChange={(e) => setData({ ...data, staminaGain: e.target.checked })}
                  className="w-5 h-5 mr-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Grants Stamina Gain
              </label>
            </div>
          </div>

          <div className="flex justify-between pt-6 border-t border-slate-100">
             <div>
               {!isNew && (
                 <button 
                   type="button" 
                   onClick={handleDelete} 
                   className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl shadow-lg transition-all"
                 >
                   Delete Effect
                 </button>
               )}
             </div>
             <div className="flex space-x-4">
               <button 
                 type="button" 
                 onClick={() => navigate('/effects')} 
                 className="px-6 py-3 text-slate-500 font-bold hover:text-slate-700 transition-colors"
               >
                 Cancel
               </button>
               <button 
                 type="submit" 
                 disabled={saving} 
                 className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all"
               >
                 Save Effect
               </button>
             </div>
          </div>
        </form>
      </div>
    </div>
  );
}
