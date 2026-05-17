import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropTableEditor } from './DropTableEditor';
import '@testing-library/jest-dom';

vi.mock('../EntityPicker/EntityPicker', () => ({
  EntityPicker: ({ value, onChange, placeholder }: any) => (
    <div data-testid="entity-picker">
      <input 
        data-testid="entity-picker-input"
        placeholder={placeholder}
        value={value || ''} 
        onChange={(e) => onChange(e.target.value)} 
      />
    </div>
  )
}));

describe('DropTableEditor Component', () => {
  it('renders default values with empty items', () => {
    const onChangeMock = vi.fn();
    render(<DropTableEditor value={null} onChange={onChangeMock} title="Test Title" />);
    
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('No item drops configured.')).toBeInTheDocument();
    
    const minSolInput = screen.getAllByRole('spinbutton')[0] as HTMLInputElement;
    expect(minSolInput.value).toBe('0');
  });

  it('calls onChange when Sol fields are modified', () => {
    const onChangeMock = vi.fn();
    const initialValue = { solMin: 0, solMax: 0, experience: 0, items: [] };
    render(<DropTableEditor value={initialValue} onChange={onChangeMock} />);
    
    const inputs = screen.getAllByRole('spinbutton');
    const minSolInput = inputs[0];
    
    fireEvent.change(minSolInput, { target: { value: '50' } });
    
    expect(onChangeMock).toHaveBeenCalledWith({
      solMin: 50,
      solMax: 0,
      experience: 0,
      items: []
    });
  });

  it('can add an item row and modify properties', () => {
    const onChangeMock = vi.fn();
    const initialValue = { solMin: 0, solMax: 0, experience: 0, items: [] };
    const { rerender } = render(<DropTableEditor value={initialValue} onChange={onChangeMock} />);
    
    const addButton = screen.getByText('+ Add Item');
    fireEvent.click(addButton);
    
    expect(onChangeMock).toHaveBeenCalledWith({
      solMin: 0,
      solMax: 0,
      experience: 0,
      items: [{ itemId: '', chance: 10, minQuantity: 1, maxQuantity: 1 }]
    });

    // Rerender with the new item to test inputs
    rerender(<DropTableEditor value={{
      solMin: 0,
      solMax: 0,
      experience: 0,
      items: [{ itemId: '', chance: 10, minQuantity: 1, maxQuantity: 1 }]
    }} onChange={onChangeMock} />);
    
    const itemIdInput = screen.getByTestId('entity-picker-input');
    fireEvent.change(itemIdInput, { target: { value: 'item_xyz' } });
    
    expect(onChangeMock).toHaveBeenCalledWith({
      solMin: 0,
      solMax: 0,
      experience: 0,
      items: [{ itemId: 'item_xyz', chance: 10, minQuantity: 1, maxQuantity: 1 }]
    });
  });
});
