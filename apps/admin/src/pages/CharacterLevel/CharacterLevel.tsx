import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { DropTableEditor } from '../../components/DropTableEditor/DropTableEditor';
import './CharacterLevel.css';

interface LevelData {
  id?: string;
  level: number;
  xpRequired: number;
  dropTable?: any;
}

export default function CharacterLevel() {
  const [levels, setLevels] = useState<LevelData[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<LevelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  const fetchLevels = async (selectId?: string) => {
    try {
      const res = await fetchWithAuth('/api/admin/levels');
      if (!res.ok) throw new Error('Failed to fetch levels');
      const data = await res.json();
      setLevels(data);
      
      // Auto-select level
      if (data.length > 0) {
        if (selectId) {
          const found = data.find((l: any) => l.id === selectId);
          setSelectedLevel(found || data[0]);
        } else {
          setSelectedLevel(data[0]);
        }
      } else {
        setSelectedLevel(null);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLevels();
  }, []);

  const handleSelectLevel = (level: LevelData) => {
    setSelectedLevel(level);
    setErrors({});
  };

  const handleAddLevel = () => {
    const nextLevelNum = levels.length > 0 
      ? Math.max(...levels.map(l => l.level)) + 1 
      : 1;
    
    // Formula matching cumulative XP table logic: (level - 1)^2 * 100
    const calculatedXp = (nextLevelNum - 1) * (nextLevelNum - 1) * 100;

    const newLevel: LevelData = {
      level: nextLevelNum,
      xpRequired: calculatedXp,
      dropTable: {
        solMin: 0,
        solMax: 0,
        experience: 0,
        items: []
      }
    };

    setSelectedLevel(newLevel);
    setErrors({});
  };

  const handleSave = async () => {
    if (!selectedLevel) return;
    setSaving(true);
    setErrors({});

    try {
      const isNew = !selectedLevel.id;
      const endpoint = isNew ? '/api/admin/levels' : `/api/admin/levels/${selectedLevel.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetchWithAuth(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedLevel)
      });

      if (!res.ok) {
        if (res.status === 400) {
          const errData = await res.json();
          const newErrors: any = {};
          errData.errors?.forEach((e: any) => { newErrors[e.path] = e.msg; });
          setErrors(newErrors);
          throw new Error('Please fix the validation errors.');
        }
        throw new Error('Failed to save level config.');
      }

      const savedData = await res.json();
      toast.success(isNew ? 'Level config created successfully!' : 'Level config saved successfully!');
      
      // Refresh list and select the saved level
      await fetchLevels(savedData.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedLevel || !selectedLevel.id) {
      // Local new level: just clear selection
      if (levels.length > 0) {
        setSelectedLevel(levels[0]);
      } else {
        setSelectedLevel(null);
      }
      return;
    }

    if (!confirm(`Are you sure you want to delete Level ${selectedLevel.level}?`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/levels/${selectedLevel.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete level config');
      toast.success('Level config deleted successfully.');
      await fetchLevels();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner size={80} />;

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6 relative">
      {saving && <LoadingSpinner fullScreen />}

      {/* Left Column: Levels List */}
      <div className="w-80 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Levels Config</h3>
          <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
            {levels.length} Total
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {levels.map((l) => (
            <button
              key={l.id}
              onClick={() => handleSelectLevel(l)}
              className={`w-full text-left p-3.5 rounded-xl transition-all flex items-center justify-between border cursor-pointer ${
                selectedLevel?.id === l.id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md font-black'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-100'
              }`}
            >
              <div>
                <p className="text-sm font-black uppercase">Level {l.level}</p>
                <p className={`text-[11px] mt-0.5 ${selectedLevel?.id === l.id ? 'text-slate-400' : 'text-slate-500'}`}>
                  {l.xpRequired.toLocaleString()} cumulative XP
                </p>
              </div>
              <svg className={`w-5 h-5 ${selectedLevel?.id === l.id ? 'text-white' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
          {levels.length === 0 && (
            <div className="text-center py-8 text-slate-400 font-medium text-sm">
              No character levels configured yet.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={handleAddLevel}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer text-center"
          >
            + Add Level
          </button>
        </div>
      </div>

      {/* Right Column: Level Config Editor */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {selectedLevel ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                  {selectedLevel.id ? `Level ${selectedLevel.level} Configuration` : 'New Level Configuration'}
                </h3>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Set cumulative experience points requirement and rewards drops.
                </p>
              </div>
              <button
                onClick={handleDelete}
                className="cursor-pointer px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black uppercase tracking-wider rounded-lg border border-red-200 transition-colors"
              >
                Delete Level
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">Level Number</label>
                  <input
                    type="number"
                    disabled={!!selectedLevel.id}
                    value={selectedLevel.level}
                    onChange={(e) => {
                      setSelectedLevel({ ...selectedLevel, level: Number(e.target.value) });
                      if (errors.level) setErrors({ ...errors, level: '' });
                    }}
                    className={`w-full p-3 bg-white border rounded-lg font-bold text-slate-800 transition-all ${
                      errors.level ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-400'
                    }`}
                  />
                  {errors.level && <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{errors.level}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">XP Required</label>
                  <input
                    type="number"
                    value={selectedLevel.xpRequired}
                    onChange={(e) => {
                      setSelectedLevel({ ...selectedLevel, xpRequired: Number(e.target.value) });
                      if (errors.xpRequired) setErrors({ ...errors, xpRequired: '' });
                    }}
                    className={`w-full p-3 bg-white border rounded-lg font-bold text-slate-800 transition-all ${
                      errors.xpRequired ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-400'
                    }`}
                  />
                  {errors.xpRequired && <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{errors.xpRequired}</p>}
                </div>
              </div>

              <div className="pt-2">
                <DropTableEditor
                  value={selectedLevel.dropTable}
                  onChange={(dropTable) => setSelectedLevel({ ...selectedLevel, dropTable })}
                  title="Level Up Rewards (Drop Table)"
                  description="Items, Sol, or experience given when a character reaches this level."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={handleSave}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                Save Configuration
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4 font-bold uppercase tracking-wider text-sm">Select or add a level configuration to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
