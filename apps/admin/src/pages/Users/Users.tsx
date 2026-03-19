import { useEffect, useState } from 'react';
import { DataGrid } from '../../components/DataGrid/DataGrid';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import './Users.css';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    fetch('http://localhost:4000/api/admin/users')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch users');
        return res.json();
      })
      .then(data => {
        setUsers(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message);
        setLoading(false);
      });
  }, []);

  const columnDefs = [
    { field: 'id', headerName: 'ID', minWidth: 200 },
    { field: 'phoneNumber', headerName: 'Phone Number' },
    { field: 'familyName', headerName: 'Family Name' },
    { 
      field: 'createdAt', 
      headerName: 'Created At',
      valueFormatter: (params: any) => new Date(params.value).toLocaleString()
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">USERS</h2>
          <p className="text-slate-500 font-medium">Manage player accounts and details.</p>
        </div>
        <button className="cursor-pointer px-4 py-2 bg-slate-900 text-white font-bold rounded shadow hover:bg-slate-800 transition-all">
          + Add User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? <LoadingSpinner size={60} /> : <DataGrid rowData={users} columnDefs={columnDefs} entityName="users" />}
      </div>
    </div>
  );
}
