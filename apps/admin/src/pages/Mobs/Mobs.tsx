import { useEffect, useState } from 'react';
import { DataGrid } from '../../components/DataGrid/DataGrid';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import './Mobs.css';

export default function Mobs() {
  const [mobs, setMobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    fetch('http://localhost:4000/api/admin/mobs')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch mobs');
        return res.json();
      })
      .then(data => {
        setMobs(data);
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
    { field: 'level', headerName: 'Level' },
    { field: 'health', headerName: 'Health' },
    { field: 'attack', headerName: 'Atk' },
    { field: 'defense', headerName: 'Def' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">MOBS</h2>
          <p className="text-slate-500 font-medium">Manage enemy NPCs and mob types.</p>
        </div>
        <button className="cursor-pointer px-4 py-2 bg-slate-900 text-white font-bold rounded shadow hover:bg-slate-800 transition-all">
          + Add Mob
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? <LoadingSpinner size={60} /> : <DataGrid rowData={mobs} columnDefs={columnDefs} entityName="mobs" />}
      </div>
    </div>
  );
}
