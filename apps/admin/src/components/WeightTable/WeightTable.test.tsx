import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import WeightTable from './WeightTable';

const OPTIONS = [
  { key: 'OIL', label: 'Oil' },
  { key: 'WATER', label: 'Water' },
];

const renderTable = (value: Record<string, number> | null, onChange = vi.fn()) => {
  render(<WeightTable id="fluids" title="Fluids" hint="How many pockets" value={value} options={OPTIONS} onChange={onChange} />);
  return onChange;
};

describe('WeightTable', () => {
  afterEach(cleanup);

  it('says nothing is set when it is empty', () => {
    renderTable(null);
    expect(screen.getByText('Nothing set: the usual amounts.')).toBeInTheDocument();
  });

  it('shows a row per entry with its label and number', () => {
    renderTable({ OIL: 2 });
    expect((screen.getByLabelText('Fluids: Oil') as HTMLInputElement).value).toBe('2');
  });

  it('adds the chosen option with the default weight, and does not offer used ones again', () => {
    const onChange = renderTable({ OIL: 2 });
    const select = screen.getByLabelText('Add to Fluids') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['WATER']);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith({ OIL: 2, WATER: 1 });
  });

  it('lets a different option be picked before adding', () => {
    const onChange = renderTable(null);
    fireEvent.change(screen.getByLabelText('Add to Fluids'), { target: { value: 'WATER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith({ WATER: 1 });
  });

  it('changes a number', () => {
    const onChange = renderTable({ OIL: 2 });
    fireEvent.change(screen.getByLabelText('Fluids: Oil'), { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith({ OIL: 0 });
  });

  it('removes a row, and reports null once the last one goes', () => {
    const onChange = renderTable({ OIL: 2, WATER: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Oil from Fluids' }));
    expect(onChange).toHaveBeenLastCalledWith({ WATER: 3 });
    cleanup();
    const again = renderTable({ OIL: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Oil from Fluids' }));
    expect(again).toHaveBeenCalledWith(null);
  });

  it('hides the add controls when everything is already in', () => {
    renderTable({ OIL: 1, WATER: 1 });
    expect(screen.queryByLabelText('Add to Fluids')).toBeNull();
  });

  it('shows a key it has no label for as the key itself', () => {
    renderTable({ GONE: 1 });
    expect(screen.getByText('GONE')).toBeInTheDocument();
  });
});
