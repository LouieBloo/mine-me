import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker';
import CityBackgroundUpload from './CityBackgroundUpload/CityBackgroundUpload';
import CityMapIconUpload from './CityMapIconUpload/CityMapIconUpload';
import { ITEM_SUBTYPES } from '@nvg/shared';
import './CityDetail.css';

const MATERIAL_SUBTYPES = ITEM_SUBTYPES.MATERIAL;

interface CityDungeonEntry {
  id: string;
  cityId: string;
  dungeonId: string;
  dungeon: { id: string; name: string; description: string; minLevel: number };
}

interface CityMaterialEntry {
  id: string;
  cityId: string;
  itemId: string;
  item: { id: string; name: string; description: string; type: string; subType: string; rarity: string };
}

export default function CityDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [data, setData] = useState<any>(isNew ? { name: '', description: '', backgroundImageUrl: null } : null);
  const [cityDungeons, setCityDungeons] = useState<CityDungeonEntry[]>([]);
  const [cityMaterials, setCityMaterials] = useState<CityMaterialEntry[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  useEffect(() => {
    if (!isNew) {
      fetchWithAuth(`/api/admin/cities/${id}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch city details');
          return res.json();
        })
        .then(json => {
          setData({ name: json.name, description: json.description, id: json.id, backgroundImageUrl: json.backgroundImageUrl, mapIconUrl: json.mapIconUrl });
          setCityDungeons(json.cityDungeons || []);
          setCityMaterials(json.cityMaterials || []);
          setLoading(false);
        })
        .catch(err => {
          toast.error(err.message);
          setLoading(false);
        });
    }
  }, [id, isNew]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = isNew ? '/api/admin/cities' : `/api/admin/cities/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetchWithAuth(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, description: data.description })
      });
      if (!res.ok) {
        if (res.status === 400) {
          const errData = await res.json();
          const newErrors: any = {};
          errData.errors?.forEach((e: any) => { newErrors[e.path] = e.msg; });
          setErrors(newErrors);
          throw new Error('Please fix the validation errors.');
        }
        throw new Error('Failed to save city');
      }
      setErrors({});
      const savedCity = await res.json();
      toast.success(isNew ? 'City created!' : 'City saved!');
      if (isNew) {
        navigate(`/cities/${savedCity.id}`, { replace: true });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Dungeon Assignment ---
  const handleAddDungeon = async (dungeonId: string) => {
    // Prevent adding a dungeon that's already assigned
    if (cityDungeons.some(cd => cd.dungeonId === dungeonId)) {
      toast.error('This dungeon is already assigned to this city.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/cities/${id}/dungeons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dungeonId })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Failed to add dungeon');
      }
      const entry = await res.json();
      setCityDungeons(prev => [...prev, entry]);
      toast.success('Dungeon assigned!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDungeon = async (cityDungeonId: string) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/cities/${id}/dungeons/${cityDungeonId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to remove dungeon');
      setCityDungeons(prev => prev.filter(cd => cd.id !== cityDungeonId));
      toast.success('Dungeon removed.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMoveDungeon = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === cityDungeons.length - 1) return;

    const newCityDungeons = [...cityDungeons];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newCityDungeons[index];
    newCityDungeons[index] = newCityDungeons[targetIndex];
    newCityDungeons[targetIndex] = temp;

    setCityDungeons(newCityDungeons);
    setSaving(true);
    try {
      const orderedIds = newCityDungeons.map(cd => cd.id);
      const res = await fetchWithAuth(`/api/admin/cities/${id}/dungeons/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
      if (!res.ok) throw new Error('Failed to reorder dungeons');
      toast.success('Dungeons reordered');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Material Assignment ---
  const handleAddMaterial = async (itemId: string) => {
    if (cityMaterials.some(cm => cm.itemId === itemId)) {
      toast.error('This material is already assigned to this city.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/cities/${id}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Failed to add material');
      }
      const entry = await res.json();
      setCityMaterials(prev => [...prev, entry]);
      toast.success('Material assigned!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMaterial = async (cityMaterialId: string) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/cities/${id}/materials/${cityMaterialId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to remove material');
      setCityMaterials(prev => prev.filter(cm => cm.id !== cityMaterialId));
      toast.success('Material removed.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getMaterialsBySubType = (subType: string) => {
    return cityMaterials.filter(cm => cm.item?.subType === subType);
  };

  const getSubTypeIcon = (subType: string): string => {
    switch (subType) {
      case 'LUMBER': return '🪵';
      case 'MINERAL': return '⛏️';
      case 'AGRICULTURE': return '🌾';
      case 'HERB': return '🌿';
      default: return '📦';
    }
  };

  const getSubTypeColor = (subType: string): string => {
    switch (subType) {
      case 'LUMBER': return 'from-amber-500 to-amber-600';
      case 'MINERAL': return 'from-slate-500 to-slate-600';
      case 'AGRICULTURE': return 'from-green-500 to-green-600';
      case 'HERB': return 'from-emerald-500 to-teal-600';
      default: return 'from-blue-500 to-blue-600';
    }
  };

  const getSubTypeBorder = (subType: string): string => {
    switch (subType) {
      case 'LUMBER': return 'border-amber-200';
      case 'MINERAL': return 'border-slate-300';
      case 'AGRICULTURE': return 'border-green-200';
      case 'HERB': return 'border-emerald-200';
      default: return 'border-blue-200';
    }
  };

  if (loading) return <LoadingSpinner size={80} />;
  if (!data) return <div className="p-8 text-red-500 font-bold">City not found.</div>;

  return (
    <div className="max-w-6xl space-y-8 relative pb-20">
      {saving && <LoadingSpinner fullScreen />}

      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/cities')}
          className="cursor-pointer p-2 hover:bg-slate-200 rounded-full transition-colors"
        >
          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">
            {isNew ? 'NEW CITY' : 'CITY DETAILS'}
          </h2>
          {!isNew && <p className="text-slate-500 font-medium">ID: {id}</p>}
        </div>
      </div>

      {/* Basic Info */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200">
        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Name</label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => {
                  setData({ ...data, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: '' });
                }}
                className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 transition-all ${errors.name ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.name && <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Description</label>
              <textarea
                value={data.description}
                onChange={(e) => {
                  setData({ ...data, description: e.target.value });
                  if (errors.description) setErrors({ ...errors, description: '' });
                }}
                className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 h-24 focus:ring-2 focus:ring-blue-500 transition-all ${errors.description ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.description && <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{errors.description}</p>}
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              className="cursor-pointer px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700 transition-colors active:scale-95"
            >
              Save City Info
            </button>
          </div>
        </form>
      </div>

      {/* Background Image Upload - only show after city exists */}
      {!isNew && (
        <>
          <CityBackgroundUpload 
            cityId={id!} 
            backgroundImageUrl={data.backgroundImageUrl} 
            onUploadSuccess={(updatedCity) => setData(updatedCity)} 
          />
          <CityMapIconUpload 
            cityId={id!} 
            mapIconUrl={data.mapIconUrl} 
            onUploadSuccess={(updatedCity) => setData(updatedCity)} 
          />
        </>
      )}

      {/* Dungeons Section - only show after city exists */}
      {!isNew && (
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <h3 className="text-2xl font-black text-slate-800">DUNGEONS</h3>
              <p className="text-slate-500 text-sm font-medium">Assign dungeons available in this city.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            {cityDungeons.length === 0 ? (
              <div className="text-center p-8 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-slate-500 font-medium">
                No dungeons assigned to this city yet.
              </div>
            ) : (
              <div className="flex flex-col space-y-2">
                {cityDungeons.map((cd, index) => (
                  <div key={cd.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex justify-between items-center group hover:border-slate-300 transition-colors">
                    <div className="flex items-center space-x-4">
                      {/* Order Controls */}
                      <div className="flex flex-col space-y-1 bg-white border border-slate-200 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); handleMoveDungeon(index, 'up'); }}
                          disabled={index === 0}
                          className="cursor-pointer text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); handleMoveDungeon(index, 'down'); }}
                          disabled={index === cityDungeons.length - 1}
                          className="cursor-pointer text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      
                      <div>
                        <div className="font-bold text-slate-800 flex items-center space-x-2">
                          <span className="text-lg">🏰</span>
                          <span>{cd.dungeon?.name || cd.dungeonId}</span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-1">Min Level: {cd.dungeon?.minLevel ?? '?'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveDungeon(cd.id)}
                      className="cursor-pointer text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors opacity-50 group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="w-72 pt-2">
              <EntityPicker
                entityType="dungeons"
                value=""
                onChange={(dungeonId) => handleAddDungeon(dungeonId)}
                placeholder="+ Add Dungeon to City"
              />
            </div>
          </div>
        </div>
      )}

      {/* Materials Section - only show after city exists */}
      {!isNew && (
        <div className="space-y-4">
          <div>
            <h3 className="text-2xl font-black text-slate-800">MATERIALS</h3>
            <p className="text-slate-500 text-sm font-medium">Assign gatherable materials available in this city, organized by type.</p>
          </div>

          <div className="space-y-6">
            {MATERIAL_SUBTYPES.map(subType => {
              const materialsOfType = getMaterialsBySubType(subType);
              return (
                <div key={subType} className={`bg-white rounded-2xl shadow-xl border ${getSubTypeBorder(subType)}`}>
                  {/* SubType Header */}
                  <div className={`bg-gradient-to-r ${getSubTypeColor(subType)} px-6 py-3 flex items-center space-x-3 rounded-t-[15px]`}>
                    <span className="text-xl">{getSubTypeIcon(subType)}</span>
                    <h4 className="text-lg font-black text-white tracking-wide uppercase">{subType}</h4>
                    <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {materialsOfType.length} assigned
                    </span>
                  </div>

                  <div className="p-6 space-y-3">
                    {materialsOfType.length === 0 ? (
                      <div className="text-center p-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-slate-400 font-medium text-sm">
                        No {subType.toLowerCase()} materials assigned yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {materialsOfType.map(cm => (
                          <div key={cm.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between items-start group hover:border-red-300 transition-colors">
                            <div>
                              <div className="font-bold text-slate-800">{cm.item?.name || cm.itemId}</div>
                              <p className="text-xs text-slate-400 font-medium mt-1 capitalize">
                                {cm.item?.rarity?.toLowerCase().replace('_', ' ') || 'Unknown'} rarity
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveMaterial(cm.id)}
                              className="cursor-pointer text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors opacity-50 group-hover:opacity-100"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="w-72 pt-2">
                      <EntityPicker
                        entityType="items"
                        value=""
                        onChange={(itemId) => handleAddMaterial(itemId)}
                        placeholder={`+ Add ${subType.charAt(0) + subType.slice(1).toLowerCase()} Material`}
                        queryParams={{ type: 'MATERIAL', subType }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
