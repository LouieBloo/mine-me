import { useEffect, useState } from 'react';
import { DataGrid } from '../../components/DataGrid/DataGrid';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import './Inventory.css';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWithAuth('/api/admin/inventory-items')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch inventory items');
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
    { field: 'id', headerName: 'ID', minWidth: 200 },
    { 
      field: 'character.name', 
      headerName: 'Character',
      valueGetter: (params: any) => params.data.character?.name || 'N/A'
    },
    { field: 'itemId', headerName: 'Item ID' },
    { field: 'quantity', headerName: 'Quantity' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight text-center uppercase">INVENTORY</h2>
          <p className="text-slate-500 font-medium">Manage and review player inventory items.</p>
        </div>
        <button 
          onClick={() => navigate('/inventory-items/new')}
          className="cursor-pointer px-4 py-2 bg-slate-900 text-white font-bold rounded shadow hover:bg-slate-800 transition-all">
          + Manually Add Item
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? <LoadingSpinner size={60} /> : <DataGrid rowData={items} columnDefs={columnDefs} entityName="inventory-items" />}
      </div>
    </div>
  );
}
