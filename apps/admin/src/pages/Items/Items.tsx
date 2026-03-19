import { useEffect, useState } from 'react';
import { DataGrid } from '../../components/DataGrid/DataGrid';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import './Items.css';

export default function Items() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    fetch('http://localhost:4000/api/admin/items')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch items');
        return res.json();
      })
      .then(data => {
        setItems(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message);
        setLoading(false);
      });
  }, []);

  const columnDefs = [
    { field: 'id', headerName: 'ID', minWidth: 150 },
    { field: 'name', headerName: 'Name' },
    { field: 'type', headerName: 'Type' },
    { field: 'priceSol', headerName: 'Price (Sol)' },
    { field: 'rarity', headerName: 'Rarity' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">ITEMS</h2>
          <p className="text-slate-500 font-medium">Manage game items, gear, and materials.</p>
        </div>
        <button className="cursor-pointer px-4 py-2 bg-slate-900 text-white font-bold rounded shadow hover:bg-slate-800 transition-all">
          + Add Item
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? <LoadingSpinner size={60} /> : <DataGrid rowData={items} columnDefs={columnDefs} entityName="items" />}
      </div>
    </div>
  );
}
