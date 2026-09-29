import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataGrid } from './DataGrid';

const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

// Mock AgGridReact so we can directly inspect the props passed to it
vi.mock('ag-grid-react', () => {
  return {
    AgGridReact: (props: any) => {
      return (
        <div
          data-testid="ag-grid-react"
          data-pagination={String(props.pagination)}
          data-pagesize={String(props.paginationPageSize)}
          data-pagesizeselector={JSON.stringify(props.paginationPageSizeSelector)}
        >
          {props.columnDefs?.map((col: any) => (
            <div key={col.field || col.headerName} data-testid={`col-${col.field || col.headerName}`}>
              {col.headerName}
              {col.cellRenderer && (
                <div data-testid={`cell-renderer-${col.field}`}>
                  {col.cellRenderer({ value: 'item_123', data: { id: 'item_123' } })}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
  };
});

describe('DataGrid Component', () => {
  const sampleData = [
    { id: 'item_1', name: 'Iron Pickaxe', type: 'Weapon' },
    { id: 'item_2', name: 'Copper Ore', type: 'Material' },
  ];

  const columnDefs = [
    { field: 'name', headerName: 'Name' },
    { field: 'type', headerName: 'Type' },
  ];

  it('renders with default 100 items per page and full height styles', () => {
    const { container } = render(
      <MemoryRouter>
        <DataGrid rowData={sampleData} columnDefs={columnDefs} entityName="items" />
      </MemoryRouter>
    );

    const gridContainer = container.querySelector('.nvg-admin-grid');
    expect(gridContainer).toBeInTheDocument();
    expect(gridContainer).toHaveClass('flex-1');
    expect(gridContainer).toHaveClass('w-full');
    expect(gridContainer).toHaveStyle({ height: '100%', width: '100%' });

    const grid = screen.getByTestId('ag-grid-react');
    expect(grid.getAttribute('data-pagination')).toBe('true');
    expect(grid.getAttribute('data-pagesize')).toBe('100');
    expect(JSON.parse(grid.getAttribute('data-pagesizeselector') || '[]')).toEqual([25, 50, 100, 200]);
  });

  it('allows overriding paginationPageSize', () => {
    render(
      <MemoryRouter>
        <DataGrid
          rowData={sampleData}
          columnDefs={columnDefs}
          entityName="items"
          paginationPageSize={50}
        />
      </MemoryRouter>
    );

    const grid = screen.getByTestId('ag-grid-react');
    expect(grid.getAttribute('data-pagesize')).toBe('50');
  });

  it('renders actions column and handles view/edit click', () => {
    render(
      <MemoryRouter>
        <DataGrid rowData={sampleData} columnDefs={columnDefs} entityName="items" />
      </MemoryRouter>
    );

    expect(screen.getByTestId('col-id')).toBeInTheDocument();
    const editBtn = screen.getByRole('button', { name: /view \/ edit/i });
    expect(editBtn).toBeInTheDocument();

    fireEvent.click(editBtn);
    expect(mockedNavigate).toHaveBeenCalledWith('/items/item_123');
  });
});
