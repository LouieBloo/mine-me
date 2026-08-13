import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../../hooks/useApi';
import type { ItemType } from '@mine-me/shared/types';
import ItemIconUpload from './ItemIconUpload';
import ItemGearUpload from './ItemGearUpload';
import './ItemDetail.css';

interface ItemEnums {
  types: string[];
  subTypes: Record<string, string[]>;
  rarities: string[];
}

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [data, setData] = useState<any>(isNew ? {
    name: '', description: '', type: 'GEAR', subType: 'HEAD',
    vendorBuyPrice: 0, vendorSellPrice: 0, userSellPrice: 0, userBuyPrice: 0, rarity: 'LOW', isStartingPiece: false, experience: 0,
    combatScore: 0, defenseScore: 0, itemEffects: []
  } : null);
  const [enums, setEnums] = useState<ItemEnums | null>(null);
  const [effectsList, setEffectsList] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  // Fetch enums & effects
  useEffect(() => {
    Promise.all([
      fetchWithAuth('/api/admin/item-enums').then(res => res.json()),
      fetchWithAuth('/api/admin/effects').then(res => res.json())
    ])
      .then(([enumsJson, effectsJson]) => {
        setEnums(enumsJson);
        setEffectsList(effectsJson);
        if (isNew) setLoading(false);
      })
      .catch(err => {
        toast.error('Failed to load enums/effects: ' + err.message);
        if (isNew) setLoading(false);
      });
  }, []);

  // Fetch item data
  useEffect(() => {
    if (isNew) return;
    fetchWithAuth(`/api/admin/items/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch item');
        return res.json();
      })
      .then(json => { setData(json); setLoading(false); })
      .catch(err => { toast.error(err.message); setLoading(false); });
  }, [id, isNew]);

  const handleTypeChange = (newType: string) => {
    const firstSubType = enums?.subTypes[newType]?.[0] || '';
    setData({ ...data, type: newType, subType: firstSubType });
    setErrors({ ...errors, type: '', subType: '' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = isNew ? '/api/admin/items' : `/api/admin/items/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetchWithAuth(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const errData = await res.json();
          const newErrors: any = {};
          errData.errors?.forEach((e: any) => { newErrors[e.path] = e.msg; });
          setErrors(newErrors);
          throw new Error('Please fix the validation errors.');
        }
        throw new Error('Failed to save item');
      }
      setErrors({});
      const savedItem = await res.json();
      toast.success(isNew ? 'Item created!' : 'Item saved!');
      if (isNew) {
        navigate(`/items/${savedItem.id}`, { replace: true });
        setData(savedItem);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner size={80} />;
  if (!data) return <div className="p-8 text-red-500 font-bold">Item not found.</div>;

  const availableSubTypes = enums?.subTypes[data.type as ItemType] || [];

  return (
    <div className="max-w-4xl space-y-8 relative pb-20">
      {saving && <LoadingSpinner fullScreen />}

      <div className="flex items-center space-x-4">
        <button onClick={() => navigate('/items')} className="cursor-pointer p-2 hover:bg-slate-200 rounded-full transition-colors">
          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">{isNew ? 'NEW ITEM' : 'ITEM DETAILS'}</h2>
          {!isNew && <p className="text-slate-500 font-medium">ID: {id}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <form onSubmit={handleSave} className="p-8 space-y-6">
          <h3 className="text-xl font-black text-slate-800 border-b border-slate-100 pb-2">Item Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Name</label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => { setData({ ...data, name: e.target.value }); if (errors.name) setErrors({ ...errors, name: '' }); }}
                className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.name ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.name && <p className="text-red-500 text-xs font-bold mt-1">{errors.name}</p>}
            </div>

            {/* Description */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Description</label>
              <textarea
                value={data.description}
                onChange={(e) => { setData({ ...data, description: e.target.value }); if (errors.description) setErrors({ ...errors, description: '' }); }}
                className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all h-24 ${errors.description ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.description && <p className="text-red-500 text-xs font-bold mt-1">{errors.description}</p>}
            </div>

            {/* Type */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Type</label>
              <select
                value={data.type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className={`item-detail-select ${errors.type ? 'has-error' : ''}`}
              >
                {enums?.types.map(t => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
              </select>
              {errors.type && <p className="text-red-500 text-xs font-bold mt-1">{errors.type}</p>}
            </div>

            {/* Sub Type */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Sub Type</label>
              <select
                value={data.subType}
                onChange={(e) => { setData({ ...data, subType: e.target.value }); if (errors.subType) setErrors({ ...errors, subType: '' }); }}
                className={`item-detail-select ${errors.subType ? 'has-error' : ''}`}
              >
                {availableSubTypes.map(st => (
                  <option key={st} value={st}>{st.charAt(0) + st.slice(1).toLowerCase().replace(/_/g, ' ')}</option>
                ))}
              </select>
              {errors.subType && <p className="text-red-500 text-xs font-bold mt-1">{errors.subType}</p>}
            </div>

            {/* Rarity */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Rarity</label>
              <select
                value={data.rarity}
                onChange={(e) => { setData({ ...data, rarity: e.target.value }); if (errors.rarity) setErrors({ ...errors, rarity: '' }); }}
                className={`item-detail-select ${errors.rarity ? 'has-error' : ''}`}
              >
                {enums?.rarities.map(r => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ')}</option>)}
              </select>
              {errors.rarity && <p className="text-red-500 text-xs font-bold mt-1">{errors.rarity}</p>}
            </div>

            {/* Experience */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Experience</label>
              <input
                type="number"
                value={data.experience ?? 0}
                onChange={(e) => { setData({ ...data, experience: Number(e.target.value) }); if (errors.experience) setErrors({ ...errors, experience: '' }); }}
                className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.experience ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.experience && <p className="text-red-500 text-xs font-bold mt-1">{errors.experience}</p>}
            </div>

            {/* GEAR-only Combat and Defense scores */}
            {data.type === 'GEAR' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Combat Score Bonus</label>
                  <input
                    type="number"
                    value={data.combatScore ?? 0}
                    onChange={(e) => { setData({ ...data, combatScore: Number(e.target.value) }); if (errors.combatScore) setErrors({ ...errors, combatScore: '' }); }}
                    className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.combatScore ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
                  />
                  {errors.combatScore && <p className="text-red-500 text-xs font-bold mt-1">{errors.combatScore}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Defense Score Bonus</label>
                  <input
                    type="number"
                    value={data.defenseScore ?? 0}
                    onChange={(e) => { setData({ ...data, defenseScore: Number(e.target.value) }); if (errors.defenseScore) setErrors({ ...errors, defenseScore: '' }); }}
                    className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.defenseScore ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
                  />
                  {errors.defenseScore && <p className="text-red-500 text-xs font-bold mt-1">{errors.defenseScore}</p>}
                </div>
              </>
            )}

            {/* Consumable Effects Configurator */}
            {data.type === 'CONSUMABLE' && (
              <div className="space-y-4 md:col-span-2 bg-slate-50 p-6 rounded-xl border border-slate-200">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Consumable Effects</h4>
                
                {/* Add effect form */}
                <div className="flex gap-4 items-end flex-wrap">
                  <div className="flex-grow min-w-[200px] space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Effect</label>
                    <select
                      id="effect-select"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800 cursor-pointer"
                    >
                      <option value="">-- Choose an Effect --</option>
                      {effectsList.map(eff => (
                        <option key={eff.id} value={eff.id}>
                          {eff.name} ({eff.healthGain ? 'Health' : ''}{eff.healthGain && eff.staminaGain ? ' & ' : ''}{eff.staminaGain ? 'Stamina' : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Value</label>
                    <input
                      type="number"
                      id="effect-value-input"
                      defaultValue="10"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const selectEl = document.getElementById('effect-select') as HTMLSelectElement;
                      const valueEl = document.getElementById('effect-value-input') as HTMLInputElement;
                      if (!selectEl || !valueEl || !selectEl.value) return;
                      
                      const effectId = selectEl.value;
                      const val = Number(valueEl.value);
                      
                      const selectedEffect = effectsList.find(e => e.id === effectId);
                      if (!selectedEffect) return;

                      // Check if already exists
                      const exists = (data.itemEffects || []).some((ie: any) => ie.effectId === effectId);
                      if (exists) {
                        toast.error('This effect is already added to the item.');
                        return;
                      }

                      const newEffects = [...(data.itemEffects || []), {
                        effectId,
                        value: val,
                        effect: selectedEffect
                      }];
                      setData({ ...data, itemEffects: newEffects });
                      selectEl.value = '';
                    }}
                    className="cursor-pointer px-5 py-2.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all text-sm active:scale-95"
                  >
                    Add Effect
                  </button>
                </div>

                {/* List of current effects */}
                <div className="space-y-2 pt-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Effects ({ (data.itemEffects || []).length })</label>
                  {(data.itemEffects || []).length === 0 ? (
                    <p className="text-slate-400 text-xs italic">No effects configured for this consumable item.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 overflow-hidden">
                      {(data.itemEffects || []).map((ie: any, idx: number) => (
                        <div key={ie.effectId || idx} className="flex justify-between items-center p-3 text-sm">
                          <div>
                            <span className="font-bold text-slate-800">{ie.effect?.name || 'Effect'}</span>
                            <span className="ml-2 text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Value: +{ie.value}</span>
                            <p className="text-slate-500 text-xs mt-0.5">{ie.effect?.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newEffects = (data.itemEffects || []).filter((itemEff: any) => itemEff.effectId !== ie.effectId);
                              setData({ ...data, itemEffects: newEffects });
                            }}
                            className="cursor-pointer text-red-500 hover:text-red-700 font-bold text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Starting Piece toggle */}
            <div className="space-y-2 md:col-span-2 flex items-center pt-2">
              <label className="text-sm font-black text-slate-700 uppercase tracking-widest cursor-pointer flex items-center">
                <input
                  type="checkbox"
                  checked={data.isStartingPiece || false}
                  onChange={(e) => { setData({ ...data, isStartingPiece: e.target.checked }); if (errors.isStartingPiece) setErrors({ ...errors, isStartingPiece: '' }); }}
                  className="w-5 h-5 mr-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Is Starting Piece (Character Creator)
              </label>
              {errors.isStartingPiece && <p className="text-red-500 text-xs font-bold mt-1">{errors.isStartingPiece}</p>}
            </div>
          </div>

          <h3 className="text-xl font-black text-slate-800 border-b border-slate-100 pb-2 pt-4">Pricing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {['vendorBuyPrice', 'vendorSellPrice', 'userBuyPrice', 'userSellPrice'].map(key => (
              <div key={key} className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                </label>
                <input
                  type="number"
                  value={data[key]}
                  onChange={(e) => { setData({ ...data, [key]: Number(e.target.value) }); if (errors[key]) setErrors({ ...errors, [key]: '' }); }}
                  className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors[key] ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
                />
                {errors[key] && <p className="text-red-500 text-xs font-bold mt-1">{errors[key]}</p>}
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100 space-x-4">
            <button type="button" onClick={() => navigate('/items')} className="cursor-pointer px-6 py-2 text-slate-500 font-bold hover:text-slate-700 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="cursor-pointer px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all">Save Item</button>
          </div>
        </form>
      </div>

      {!isNew && (
        <div className="pt-4">
          <ItemIconUpload 
            itemId={id!} 
            iconUrl={data.iconUrl} 
            onUploadSuccess={(updatedItem) => setData(updatedItem)} 
          />
          <ItemGearUpload
            itemId={id!}
            gearImageUrl={data.gearImageUrl}
            onUploadSuccess={(updatedItem) => setData(updatedItem)}
          />
        </div>
      )}
    </div>
  );
}
