import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';

import type { MobAtlas } from '@mine-me/shared/types';
import SpritePreview from '../../components/SpritePreview/SpritePreview';
import SpriteAtlasOverview from '../../components/SpriteAtlasOverview/SpriteAtlasOverview';
import { DropTableEditor } from '../../components/DropTableEditor/DropTableEditor';

const ANIMATION_WHITELIST = ['idle', 'attacking', 'defending', 'takingDamage', 'taunt', 'walking', 'death'];

export default function MobDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [data, setData] = useState<any>(isNew ? { name: '', level: 1, health: 10, attack: 1, defense: 1, attackPercentage: 50, defendPercentage: 50, dropTable: null, animations: {} } : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [detectedAnimations, setDetectedAnimations] = useState<string[]>([]);
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  useEffect(() => {
    if (isNew) return;
    fetchWithAuth(`/api/admin/mobs/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch mob details');
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

  useEffect(() => {
    const atlasUrl = data?.animations?.atlasUrl;
    if (!atlasUrl) {
      setDetectedAnimations([]);
      return;
    }

    const fullUrl = atlasUrl.startsWith('http') ? atlasUrl : `${import.meta.env.VITE_API_URL}${atlasUrl}`;
    fetch(fullUrl)
      .then(res => res.json())
      .then(json => {
        if (json.animations) {
          setDetectedAnimations(Object.keys(json.animations));
        } else if (json.frames) {
          // Fallback if no explicit animations: just use whitelisted keys found in frames
          const frameNames = Object.keys(json.frames);
          const found = ANIMATION_WHITELIST.filter(k => frameNames.some(f => f.startsWith(k)));
          setDetectedAnimations(found);
        }
      })
      .catch(() => setDetectedAnimations([]));
  }, [data?.animations?.atlasUrl]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = isNew ? `/api/admin/mobs` : `/api/admin/mobs/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      
      const payload = { ...data };
      delete payload.animations; // Uploaded separately, though we can pass it, safer not to overwrite accidentally during base save

      const res = await fetchWithAuth(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        if (res.status === 400) {
          const errData = await res.json();
          const newErrors: any = {};
          errData.errors?.forEach((e: any) => { newErrors[e.path] = e.msg; });
          setErrors(newErrors);
          throw new Error('Please fix the validation errors.');
        }
        throw new Error('Failed to save mob');
      }
      setErrors({});
      const savedMob = await res.json();
      toast.success(isNew ? 'Mob created successfully!' : 'Mob saved successfully!');
      if (isNew) {
        navigate(`/mobs/${savedMob.id}`, { replace: true });
        setData(savedMob);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAtlasUpdate = (updatedMob: any) => {
    setData(updatedMob);
  };

  if (loading) return <LoadingSpinner size={80} />;
  if (!data) return <div className="p-8 text-red-500 font-bold">Mob not found.</div>;

  return (
    <div className="max-w-6xl space-y-8 relative pb-20">
      {saving && <LoadingSpinner fullScreen />}
      
      <div className="flex items-center space-x-4">
        <button onClick={() => navigate('/mobs')} className="cursor-pointer p-2 hover:bg-slate-200 rounded-full transition-colors">
          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">{isNew ? 'NEW MOB' : 'MOB DETAILS'}</h2>
          {!isNew && <p className="text-slate-500 font-medium">ID: {id}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200">
        <form onSubmit={handleSave} className="p-8 space-y-6">
          <h3 className="text-xl font-black text-slate-800 border-b border-slate-100 pb-2">Base Stats</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Name</label>
              <input type="text" value={data.name} onChange={(e) => { setData({ ...data, name: e.target.value }); if (errors.name) setErrors({...errors, name: ''}); }} className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.name ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`} />
              {errors.name && <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Level</label>
              <input type="number" value={data.level} onChange={(e) => { setData({ ...data, level: Number(e.target.value) }); if (errors.level) setErrors({...errors, level: ''}); }} className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.level ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Health</label>
              <input type="number" value={data.health} onChange={(e) => { setData({ ...data, health: Number(e.target.value) }); if (errors.health) setErrors({...errors, health: ''}); }} className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.health ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Attack</label>
              <input type="number" value={data.attack} onChange={(e) => { setData({ ...data, attack: Number(e.target.value) }); if (errors.attack) setErrors({...errors, attack: ''}); }} className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.attack ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Defense</label>
              <input type="number" value={data.defense} onChange={(e) => { setData({ ...data, defense: Number(e.target.value) }); if (errors.defense) setErrors({...errors, defense: ''}); }} className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.defense ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Attack %</label>
              <input type="number" value={data.attackPercentage ?? 50} onChange={(e) => { setData({ ...data, attackPercentage: Number(e.target.value) }); }} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Defend %</label>
              <input type="number" value={data.defendPercentage ?? 50} onChange={(e) => { setData({ ...data, defendPercentage: Number(e.target.value) }); }} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800" />
            </div>
          </div>
          
          <div className="pt-4 border-t border-slate-100">
            <DropTableEditor
              value={data.dropTable}
              onChange={(dropTable) => setData({ ...data, dropTable })}
              title="Mob Drops"
              description="Configure the items and Sol dropped when this mob is defeated."
            />
          </div>
          
          <div className="flex justify-end pt-4 border-t border-slate-100">
             <button type="submit" disabled={saving} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all">Save Base Information</button>
          </div>
        </form>
      </div>

      {!isNew ? (
        <div className="space-y-8">
           <SpriteAtlasOverview 
              mobId={id!} 
              config={data.animations as MobAtlas} 
              onUploadSuccess={handleAtlasUpdate} 
           />

           <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                 <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Detected Animations</h3>
                 <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                       <div className="w-2 h-2 rounded-full bg-green-500"></div>
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Whitelisted</span>
                    </div>
                    <div className="flex items-center space-x-2">
                       <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custom</span>
                    </div>
                 </div>
              </div>
              
              {detectedAnimations.length > 0 ? (
                (() => {
                  const config = data.animations as MobAtlas;
                  const fullSpriteUrl = config?.url?.startsWith('http') ? config.url : `${import.meta.env.VITE_API_URL}${config?.url}`;
                  const fullAtlasUrl = config?.atlasUrl?.startsWith('http') ? config.atlasUrl : `${import.meta.env.VITE_API_URL}${config?.atlasUrl}`;
                  return (
                    <SpritePreview
                      spriteUrl={fullSpriteUrl}
                      atlasUrl={fullAtlasUrl}
                      animationKeys={detectedAnimations}
                      whitelistedKeys={ANIMATION_WHITELIST}
                    />
                  );
                })()
              ) : (
                <div className="bg-slate-50 rounded-xl p-12 text-center border-2 border-dashed border-slate-200">
                   <p className="font-bold text-slate-400">No animations detected in the atlas file.</p>
                </div>
              )}
           </div>
        </div>
      ) : (
        <div className="bg-slate-100 rounded-xl p-8 text-center border-dashed border-2 border-slate-300">
           <p className="font-bold text-slate-500">Save the mob first to configure the Sprite Atlas.</p>
        </div>
      )}
    </div>
  );
}
