import { useEffect, useState } from 'react';
import { DataGrid } from '../../components/DataGrid/DataGrid';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import './Dungeons.css';

export default function Dungeons() {
  const [dungeons, setDungeons] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/dungeons')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch dungeons');
        return res.json();
      })
      .then(data => {
        setDungeons(data);
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
    { field: 'cityId', headerName: 'City ID' },
    { field: 'minLevel', headerName: 'Min Level' },
    { 
      headerName: 'Levels Configured', 
      valueGetter: (params: any) => params.data.levels?.length || 0 
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">DUNGEONS</h2>
          <p className="text-slate-500 font-medium">Manage game dungeons and their levels.</p>
        </div>
        <button 
          onClick={() => navigate('/dungeons/new')}
          className="cursor-pointer px-4 py-2 bg-slate-900 text-white font-bold rounded shadow hover:bg-slate-800 transition-all">
          + Add Dungeon
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? <LoadingSpinner size={60} /> : <DataGrid rowData={dungeons} columnDefs={columnDefs} entityName="dungeons" />}
      </div>
    </div>
  );
}
