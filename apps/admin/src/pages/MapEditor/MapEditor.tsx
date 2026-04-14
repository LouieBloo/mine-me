import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import type { GameCity } from '@nvg/shared';
import './MapEditor.css';

export default function MapEditor() {
  const [cities, setCities] = useState<GameCity[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const { fetchWithAuth } = useApi();
  const toast = useToast();

  useEffect(() => {
    fetchWithAuth('/api/admin/cities?take=1000') // Assume pagination override or large limit
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch cities');
        return res.json();
      })
      .then(json => {
        setCities(json.data || json); // Handle response wrapper if present
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message);
        setLoading(false);
      });
  }, []);

  const handleMapClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedCityId) {
      toast.error('Select a city from the sidebar first.');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));

    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/cities/${selectedCityId}/coordinates`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldPositionX: x, worldPositionY: y })
      });

      if (!res.ok) throw new Error('Failed to update coordinates');
      
      const updatedCity = await res.json();
      setCities(prev => prev.map(c => c.id === updatedCity.id ? updatedCity : c));
      toast.success(`${updatedCity.name} moved to (${x}, ${y})!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner size={80} />;

  return (
    <div className="flex h-full gap-6 pb-20 relative">
      {saving && <LoadingSpinner fullScreen />}
      
      {/* Sidebar */}
      <div className="w-80 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">CITIES</h2>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">Select a city to place it</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {cities.map(city => (
            <button
              key={city.id}
              onClick={() => setSelectedCityId(city.id)}
              className={`w-full text-left cursor-pointer p-3 rounded-lg flex items-center justify-between transition-colors ${
                selectedCityId === city.id 
                  ? 'bg-blue-500 text-white shadow-md' 
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="font-bold truncate">{city.name}</div>
              <div className={`text-xs px-2 py-1 rounded font-mono ${
                selectedCityId === city.id ? 'bg-blue-600' : 'bg-slate-200 text-slate-500'
              }`}>
                {city.worldPositionX ?? 50},{city.worldPositionY ?? 50}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Map View */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-xl p-8 flex flex-col items-center">
        <div className="w-full max-w-4xl flex justify-between items-end mb-6">
          <div>
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Global Map Editor</h2>
            <p className="text-slate-500 font-medium">Click anywhere on the map to place the selected city.</p>
          </div>
        </div>

        <div 
          className="relative w-full aspect-square max-w-[800px] bg-slate-900 border-4 border-slate-300 rounded-2xl overflow-hidden cursor-crosshair shadow-inner"
          style={{ 
            backgroundImage: 'linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)', 
            backgroundSize: '2% 2%' // 50x50 visual grid squares to represent 100x100 resolution nicely
          }}
          onClick={handleMapClick}
        >
          {cities.map(city => {
            const isSelected = selectedCityId === city.id;
            return (
              <div
                key={city.id}
                className={`absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-lg transition-all duration-300 pointer-events-none flex items-center justify-center ${
                  isSelected 
                    ? 'bg-blue-500 border-white scale-125 z-50 animate-pulse' 
                    : 'bg-emerald-500 border-emerald-200 z-10'
                }`}
                style={{
                  left: `${city.worldPositionX ?? 50}%`,
                  top: `${city.worldPositionY ?? 50}%`
                }}
              >
                <div className={`absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs font-black uppercase tracking-wider shadow whitespace-nowrap ${
                  isSelected ? 'bg-blue-600 text-white' : 'bg-slate-900/90 text-slate-200'
                }`}>
                  {city.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
