import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { useNavigate } from 'react-router-dom';
import './DataGrid.css';

// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule]);

interface Props<T> {
  rowData: T[];
  columnDefs: any[];
  entityName: string; // e.g., 'cities', 'items'
  paginationPageSize?: number;
  paginationPageSizeSelector?: number[] | boolean;
}

export const DataGrid = <T extends { id: string | number }>({
  rowData,
  columnDefs,
  entityName,
  paginationPageSize = 100,
  paginationPageSizeSelector = [25, 50, 100, 200],
}: Props<T>) => {
  const navigate = useNavigate();

  const actionColumn = {
    headerName: 'Actions',
    field: 'id',
    cellRenderer: (params: any) => (
      <button
        onClick={() => navigate(`/${entityName}/${params.value}`)}
        className="cursor-pointer px-4 py-1.5 bg-slate-900 hover:bg-slate-700 text-white text-[11px] font-black uppercase tracking-wider rounded-md shadow-sm transition-all active:scale-95"
      >
        View / Edit
      </button>
    ),
    width: 120,
    pinned: 'right',
    filter: false,
    sortable: false
  };

  const finalColumnDefs = [...columnDefs, actionColumn];

  return (
    <div className="nvg-admin-grid flex-1 w-full" style={{ height: '100%', width: '100%' }}>
      <AgGridReact
        theme={themeQuartz}
        rowData={rowData}
        columnDefs={finalColumnDefs}
        defaultColDef={{
          flex: 1,
          minWidth: 100,
          filter: true,
          sortable: true,
          resizable: true,
        }}
        pagination={true}
        paginationPageSize={paginationPageSize}
        paginationPageSizeSelector={paginationPageSizeSelector}
      />
    </div>
  );
};
