import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import './DungeonDetail.css';

export default function DungeonDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [data, setData] = useState<any>(isNew ? { id: '', name: '', description: '', cityId: '', minLevel: 1, levels: [] } : null);
  const [allMobs, setAllMobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  useEffect(() => {
    // Fetch mobs for selection
    fetchWithAuth('/api/admin/mobs')
      .then(res => res.json())
      .then(setAllMobs)
      .catch(err => console.error("Could not fetch mobs", err));

    if (!isNew) {
      fetchWithAuth(`/api/admin/dungeons/${id}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch dungeon details');
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
    }
  }, [id, isNew]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    // We omit levels from the dungeon save payload as they will be saved separately or are nested.
    // Wait, prisma create/update can accept nested but we are maintaining separate routes for levels.
    // Actually, simplest is to save the dungeon basic details first, levels are managed dynamically.
    const { levels, ...dungeonData } = data;

    try {
      const res = await fetchWithAuth(`/api/admin/dungeons${isNew ? '' : `/${id}`}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dungeonData)
      });
      if (!res.ok) throw new Error('Failed to save dungeon');
      
      const savedDungeon = await res.json();
      toast.success('Dungeon saved successfully!');
      
      if (isNew) {
        navigate(`/dungeons/${savedDungeon.id}`, { replace: true });
        setData({ ...savedDungeon, levels: [] });
      } else {
        // Just refresh
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLevelSave = async (level: any, index: number) => {
    setSaving(true);
    try {
      const isNewLevel = !level.id;
      const res = await fetchWithAuth(`/api/admin/dungeon-levels${!isNewLevel ? `/${level.id}` : ''}`, {
        method: isNewLevel ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dungeonId: data.id,
          name: level.name,
          orderIndex: level.orderIndex || index,
          mobs: level.mobs || []
        })
      });
      if (!res.ok) throw new Error('Failed to save level');
      const savedLevel = await res.json();
      const newLevels = [...data.levels];
      newLevels[index] = savedLevel;
      setData({ ...data, levels: newLevels });
      toast.success('Level saved!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLevel = async (level: any, index: number) => {
    if (!level.id) {
       const newLevels = data.levels.filter((_: any, i: number) => i !== index);
       setData({ ...data, levels: newLevels });
       return;
    }
    
    if (!confirm('Are you sure you want to delete this level?')) return;
    
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/dungeon-levels/${level.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete level');
      const newLevels = data.levels.filter((l: any) => l.id !== level.id);
      setData({ ...data, levels: newLevels });
      toast.success('Level deleted');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const moveLevel = async (index: number, moveUp: boolean) => {
    if (moveUp && index === 0) return;
    if (!moveUp && index === data.levels.length - 1) return;
    
    const newLevels = [...data.levels];
    const swapIndex = moveUp ? index - 1 : index + 1;
    
    // Swap
    const temp = newLevels[index];
    newLevels[index] = newLevels[swapIndex];
    newLevels[swapIndex] = temp;
    
    // Update orderIndex
    newLevels.forEach((l: any, i: number) => {
      l.orderIndex = i;
    });
    
    setData({ ...data, levels: newLevels });
    
    // If they already have IDs, save them immediately
    if (newLevels[index].id) await handleLevelSave(newLevels[index], index);
    if (newLevels[swapIndex].id) await handleLevelSave(newLevels[swapIndex], swapIndex);
  };
  
  const addLevel = () => {
    const newLevels = [...(data.levels || []), {
      name: `Level ${(data.levels?.length || 0) + 1}`,
      orderIndex: data.levels?.length || 0,
      mobs: []
    }];
    setData({ ...data, levels: newLevels });
  };

  if (loading) return <LoadingSpinner size={80} />;
  if (!data) return <div className="p-8 text-red-500 font-bold">Dungeon not found.</div>;

  return (
    <div className="max-w-6xl space-y-8 relative pb-20">
      {saving && <LoadingSpinner fullScreen />}
      
      <div className="flex items-center space-x-4">
        <button 
          onClick={() => navigate('/dungeons')}
          className="cursor-pointer p-2 hover:bg-slate-200 rounded-full transition-colors"
        >
          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">
            {isNew ? 'NEW DUNGEON' : 'DUNGEON DETAILS'}
          </h2>
          {!isNew && <p className="text-slate-500 font-medium">ID: {id}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">ID</label>
              <input
                type="text"
                value={data.id}
                disabled={!isNew}
                onChange={(e) => setData({ ...data, id: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Name</label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">City ID</label>
              <input
                type="text"
                value={data.cityId}
                onChange={(e) => setData({ ...data, cityId: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Min Level</label>
              <input
                type="number"
                value={data.minLevel}
                onChange={(e) => setData({ ...data, minLevel: Number(e.target.value) })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Description</label>
              <textarea
                value={data.description}
                onChange={(e) => setData({ ...data, description: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 h-24"
              />
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700">
              Save Dungeon Info
            </button>
          </div>
        </form>
      </div>

      {!isNew && (
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <h3 className="text-2xl font-black text-slate-800">DUNGEON LEVELS</h3>
            <button onClick={addLevel} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded shadow">
              + Add Level
            </button>
          </div>
          
          <div className="space-y-4">
            {data.levels?.map((level: any, i: number) => (
              <div key={level.id || `new-${i}`} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6">
                
                {/* Reorder controls */}
                <div className="flex flex-col justify-center items-center bg-slate-50 rounded-lg p-2 gap-2 border border-slate-100">
                  <button onClick={() => moveLevel(i, true)} disabled={i === 0} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <span className="font-black text-slate-400">{i + 1}</span>
                  <button onClick={() => moveLevel(i, false)} disabled={i === data.levels.length - 1} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>

                <div className="flex-grow space-y-4">
                  <div className="flex flex-col md:flex-row gap-4 items-start">
                    <div className="flex-grow w-full">
                      <label className="text-xs font-bold text-slate-400 uppercase">Level Name</label>
                      <input 
                        type="text" 
                        value={level.name} 
                        onChange={(e) => {
                          const newLevels = [...data.levels];
                          newLevels[i].name = e.target.value;
                          setData({ ...data, levels: newLevels });
                        }}
                        className="w-full p-2 mt-1 border border-slate-200 rounded font-bold"
                      />
                    </div>
                    
                    <div className="flex-grow w-full">
                       <label className="text-xs font-bold text-slate-400 uppercase">Mobs in Level</label>
                       {/* Simplified mob selection just using IDs by comma, or a multi-select. A text input of Json for now or simple select. Let's do a basic multi select experience */}
                       <div className="mt-1 flex flex-wrap gap-2">
                         {level.mobs?.map((mobId: string, mIndex: number) => (
                           <span key={mIndex} className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full flex items-center">
                             {allMobs.find(m => m.id === mobId)?.name || mobId}
                             <button onClick={() => {
                               const newLevels = [...data.levels];
                               newLevels[i].mobs = newLevels[i].mobs.filter((_: any, idx: number) => idx !== mIndex);
                               setData({...data, levels: newLevels});
                             }} className="ml-1 hover:text-red-900 border-l border-red-200 pl-1 ml-2">x</button>
                           </span>
                         ))}
                         <select 
                           className="bg-slate-50 border border-slate-200 rounded text-sm font-bold p-1"
                           onChange={(e) => {
                             if (!e.target.value) return;
                             const newLevels = [...data.levels];
                             newLevels[i].mobs = [...(newLevels[i].mobs || []), e.target.value];
                             setData({...data, levels: newLevels});
                             e.target.value = "";
                           }}
                           value=""
                         >
                           <option value="">+ Add Mob</option>
                           {allMobs.map(m => (
                             <option key={m.id} value={m.id}>{m.name} (Lv {m.level})</option>
                           ))}
                         </select>
                       </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-2 pt-2">
                    <button onClick={() => handleDeleteLevel(level, i)} className="px-3 py-1 text-sm bg-red-50 text-red-600 hover:bg-red-100 font-bold rounded">
                      Delete Level
                    </button>
                    <button onClick={() => handleLevelSave(level, i)} className="px-4 py-1 text-sm bg-green-600 text-white hover:bg-green-700 font-bold rounded">
                      Save Level
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {(!data.levels || data.levels.length === 0) && (
              <div className="text-center p-8 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-slate-500 font-medium">
                No levels configured for this dungeon yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
