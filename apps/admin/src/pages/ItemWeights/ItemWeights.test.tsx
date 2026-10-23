import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ItemWeights, { isValidWeight } from './ItemWeights';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const items = [
  { id: 'i2', name: 'Silverium', type: 'MATERIAL', subType: 'MINERAL', weight: 4 },
  { id: 'i1', name: 'Copperium', type: 'MATERIAL', subType: 'MINERAL', weight: 0 },
  { id: 'i3', name: 'Torch', type: 'CONSUMABLE', subType: 'TORCH', weight: 1 },
];
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });
const renderIt = () => render(<ToastProvider><ItemWeights /></ToastProvider>);

describe('isValidWeight', () => {
  it('accepts 0 and positive numbers, and nothing else', () => {
    for (const ok of ['0', '2.5', ' 3 ']) expect(isValidWeight(ok)).toBe(true);
    for (const bad of ['', ' ', '-1', 'abc', 'NaN']) expect(isValidWeight(bad)).toBe(false);
  });
});

describe('ItemWeights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation(() => json(items));
  });

  it('lists every item with its weight, grouped by type', async () => {
    renderIt();
    expect(await screen.findByLabelText('Copperium weight')).toHaveValue(0);
    expect(screen.getByLabelText('Silverium weight')).toHaveValue(4);
    const names = screen.getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(names[0]).toContain('Torch'); // CONSUMABLE sorts before MATERIAL
  });

  it('filters by name or type', async () => {
    renderIt();
    await screen.findByLabelText('Copperium weight');
    fireEvent.change(screen.getByLabelText('Filter items'), { target: { value: 'silver' } });
    expect(screen.queryByLabelText('Copperium weight')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Silverium weight')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter items'), { target: { value: 'zzz' } });
    expect(screen.getByText('No items match.')).toBeInTheDocument();
  });

  it('only enables Save for a changed, valid weight, and saves just that weight', async () => {
    renderIt();
    const input = await screen.findByLabelText('Copperium weight');
    const row = input.closest('tr')!;
    const save = row.querySelector('button')!;
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: '-3' } });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: '3' } });
    expect(save).toBeEnabled();
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ id: 'i1', name: 'Copperium', weight: 3 }));
    fireEvent.click(save);
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/items/i1/weight');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ weight: 3 });
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByLabelText('Copperium weight')).toHaveValue(3);
  });

  it('shows why a save failed and keeps the typed value', async () => {
    renderIt();
    const input = await screen.findByLabelText('Copperium weight');
    fireEvent.change(input, { target: { value: '3' } });
    mockFetchWithAuth.mockImplementation(() => json({ error: 'weight must be a number of 0 or more' }, false));
    fireEvent.click(input.closest('tr')!.querySelector('button')!);
    expect(await screen.findByText('weight must be a number of 0 or more')).toBeInTheDocument();
    expect(screen.getByLabelText('Copperium weight')).toHaveValue(3);
  });

  it('shows a failed load', async () => {
    mockFetchWithAuth.mockImplementation(() => json({}, false));
    renderIt();
    expect(await screen.findByText('Failed to fetch items')).toBeInTheDocument();
  });
});
