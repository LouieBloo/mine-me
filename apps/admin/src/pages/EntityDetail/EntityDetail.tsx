import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker';
import './EntityDetail.css';

export const EntityDetail = () => {
  const { entity, id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const getTemplate = (entityName: string | undefined) => {
    switch (entityName) {
      case 'mobs': return { name: '', level: 1, health: 10, attack: 1, defense: 1, drops: [] };
      case 'items': return { name: '', description: '', type: 'GEAR', subType: 'HEAD', vendorBuyPrice: 0, vendorSellPrice: 0, userSellPrice: 0, userBuyPrice: 0, rarity: 'LOW' };
      case 'cities': return { name: '', description: '' };
      case 'users': return { phoneNumber: '', familyName: '', isAdmin: false };
      case 'inventory-items': return { characterId: '', itemId: '', quantity: 1 };
      default: return {};
    }
  };

  const [data, setData] = useState<any>(isNew ? getTemplate(entity) : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  useEffect(() => {
    if (isNew) return;
    fetchWithAuth(`/api/admin/${entity}/${id}`)
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
  }, [entity, id, isNew]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = isNew ? `/api/admin/${entity}` : `/api/admin/${entity}/${id}`;
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
        const errText = await res.text();
        throw new Error(errText || 'Failed to save entity');
      }
      setErrors({});
      toast.success(isNew ? 'Created successfully!' : 'Saved successfully!');
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

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200">
        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {Object.keys(data).map(key => {
              if (key === 'id' || key === 'createdAt' || key === 'updatedAt') return null;
              
              const val = data[key];
              const isJson = typeof val === 'object' && val !== null;

              return (
                <div key={key} className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{key}</label>
                  {key === 'cityId' ? (
                     <EntityPicker entityType="cities" value={val} onChange={(id) => { setData({...data, [key]: id}); setErrors({...errors, [key]: ''}); }} error={errors[key]} />
                  ) : key === 'characterId' ? (
                     <EntityPicker entityType="characters" value={val} onChange={(id) => { setData({...data, [key]: id}); setErrors({...errors, [key]: ''}); }} error={errors[key]} />
                  ) : key === 'itemId' && entity === 'inventory-items' ? (
                     <EntityPicker entityType="items" value={val} onChange={(id) => { setData({...data, [key]: id}); setErrors({...errors, [key]: ''}); }} error={errors[key]} />
                  ) : typeof val === 'boolean' ? (
                     <input
                       type="checkbox"
                       checked={!!val}
                       onChange={(e) => {
                          setData({ ...data, [key]: e.target.checked });
                          if (errors[key]) setErrors({...errors, [key]: ''});
                       }}
                       className="w-5 h-5 ml-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                     />
                  ) : isJson ? (
                    <textarea
                      value={JSON.stringify(val, null, 2)}
                      onChange={(e) => {
                        try {
                           const parsed = JSON.parse(e.target.value);
                           setData({ ...data, [key]: parsed });
                           if (errors[key]) setErrors({...errors, [key]: ''});
                        } catch (err) {}
                      }}
                      className={`w-full p-3 bg-slate-50 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 transition-all h-32 ${errors[key] ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
                    />
                  ) : (
                    <input
                      type={typeof val === 'number' ? 'number' : 'text'}
                      value={val || ''}
                      onChange={(e) => {
                         setData({ ...data, [key]: typeof val === 'number' ? Number(e.target.value) : e.target.value });
                         if (errors[key]) setErrors({...errors, [key]: ''});
                      }}
                      className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 transition-all ${errors[key] ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
                    />
                  )}
                  {errors[key] && <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{errors[key]}</p>}
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
