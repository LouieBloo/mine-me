import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import './EntityDetail.css';

export const EntityDetail = () => {
  const { entity, id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch(`http://localhost:4000/api/admin/${entity}/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch entity details');
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
  }, [entity, id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:4000/api/admin/${entity}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to save entity');
      toast.success('Saved successfully!');
      navigate(`/${entity}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner size={80} />;
  if (!data) return <div className="p-8 text-red-500 font-bold">Entity not found.</div>;

  return (
    <div className="max-w-4xl space-y-8 relative">
      {saving && <LoadingSpinner fullScreen />}
      <div className="flex items-center space-x-4">
        <button 
          onClick={() => navigate(`/${entity}`)}
          className="cursor-pointer p-2 hover:bg-slate-200 rounded-full transition-colors"
        >
          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">{entity?.slice(0, -1)} DETAILS</h2>
          <p className="text-slate-500 font-medium">ID: {id}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {Object.keys(data).map(key => {
              if (key === 'id' || key === 'createdAt' || key === 'updatedAt') return null;
              
              const val = data[key];
              const isJson = typeof val === 'object' && val !== null;

              return (
                <div key={key} className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{key}</label>
                  {isJson ? (
                    <textarea
                      value={JSON.stringify(val, null, 2)}
                      onChange={(e) => {
                        try {
                           const parsed = JSON.parse(e.target.value);
                           setData({ ...data, [key]: parsed });
                        } catch (err) {}
                      }}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all h-32"
                    />
                  ) : (
                    <input
                      type={typeof val === 'number' ? 'number' : 'text'}
                      value={val || ''}
                      onChange={(e) => setData({ ...data, [key]: typeof val === 'number' ? Number(e.target.value) : e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-8 border-t border-slate-100 flex justify-end space-x-4">
             <button 
               type="button"
               onClick={() => navigate(`/${entity}`)}
               className="cursor-pointer px-6 py-2 text-slate-500 font-bold hover:text-slate-700 transition-colors"
             >
               Cancel
             </button>
             <button 
               type="submit"
               disabled={saving}
               className="cursor-pointer px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"
             >
               Save Changes
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};
