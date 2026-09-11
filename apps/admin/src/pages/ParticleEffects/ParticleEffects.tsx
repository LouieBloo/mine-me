import { useEffect, useState } from 'react';
import { DataGrid } from '../../components/DataGrid/DataGrid';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import type { ParticleEffect } from '@mine-me/shared';
import './ParticleEffects.css';

export default function ParticleEffects() {
  const [effects, setEffects] = useState<ParticleEffect[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  const loadEffects = () => {
    setLoading(true);
    fetchWithAuth('/api/admin/particle-effects')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch particle effects');
        return res.json();
      })
      .then((data) => {
        setEffects(data);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err.message || 'Error loading particle effects');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadEffects();
  }, []);

  const columnDefs = [
    { field: 'id', headerName: 'ID', minWidth: 150 },
    { field: 'name', headerName: 'Name', minWidth: 160 },
    {
      field: 'config.emitterType',
      headerName: 'Type',
      minWidth: 120,
      cellRenderer: (params: any) => {
        const type = params.data?.config?.emitterType;
        const isContinuous = type === 'continuous';
        return (
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
              isContinuous
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
            }`}
          >
            {type || 'burst'}
          </span>
        );
      },
    },
    {
      field: 'config.shape',
      headerName: 'Shape',
      minWidth: 100,
      valueGetter: (params: any) => params.data?.config?.shape || 'circle',
    },
    {
      field: 'colors',
      headerName: 'Colors',
      minWidth: 130,
      cellRenderer: (params: any) => {
        const config = params.data?.config;
        if (!config?.color) return <span>-</span>;
        return (
          <div className="flex items-center gap-1.5 h-full">
            {config.color.start && (
              <span
                className="particle-color-chip"
                style={{ backgroundColor: String(config.color.start) }}
                title={`Start: ${config.color.start}`}
              />
            )}
            <span className="text-slate-400 text-xs">➔</span>
            {config.color.end && (
              <span
                className="particle-color-chip"
                style={{ backgroundColor: String(config.color.end) }}
                title={`End: ${config.color.end}`}
              />
            )}
          </div>
        );
      },
    },
    {
      field: 'description',
      headerName: 'Description',
      minWidth: 200,
      flex: 2,
    },
  ];

  return (
    <div className="space-y-6 particle-effects-container">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">PARTICLE EFFECTS</h2>
          <p className="text-slate-500 font-medium">
            Configure visual particle fx (torches, block damage, magic auras).
          </p>
        </div>
        <button
          onClick={() => navigate('/particle-effects/new')}
          className="cursor-pointer px-4 py-2 bg-slate-900 text-white font-bold rounded shadow hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <span>+</span>
          <span>Add Particle Effect</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? (
          <LoadingSpinner size={60} />
        ) : (
          <DataGrid
            rowData={effects}
            columnDefs={columnDefs}
            entityName="particle-effects"
          />
        )}
      </div>
    </div>
  );
}
