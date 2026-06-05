import { useEffect, useState } from 'react';
import { DataGrid } from '../../components/DataGrid/DataGrid';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';

export default function Effects() {
  const [effects, setEffects] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/effects')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch effects');
        return res.json();
      })
      .then(data => {
        setEffects(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message);
        setLoading(false);
      });
  }, []);

  const columnDefs = [
    { field: 'id', headerName: 'ID', minWidth: 200 },
    { field: 'name', headerName: 'Name' },
    { field: 'description', headerName: 'Description', flex: 2 },
    { 
      field: 'healthGain', 
      headerName: 'Health Gain',
      cellRenderer: (params: any) => params.value ? 'Yes' : 'No'
    },
    { 
      field: 'staminaGain', 
      headerName: 'Stamina Gain',
      cellRenderer: (params: any) => params.value ? 'Yes' : 'No'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">EFFECTS</h2>
          <p className="text-slate-500 font-medium">Manage item effects (buffs, stats restore, etc.).</p>
        </div>
        <button 
          onClick={() => navigate('/effects/new')}
          className="cursor-pointer px-4 py-2 bg-slate-900 text-white font-bold rounded shadow hover:bg-slate-800 transition-all">
          + Add Effect
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? <LoadingSpinner size={60} /> : <DataGrid rowData={effects} columnDefs={columnDefs} entityName="effects" />}
      </div>
    </div>
  );
}
