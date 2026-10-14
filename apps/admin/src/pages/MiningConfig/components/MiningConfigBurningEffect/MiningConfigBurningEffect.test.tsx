import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_MINING_MAP_CONFIG } from '@mine-me/shared';
import MiningConfigBurningEffect from './MiningConfigBurningEffect';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetch = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetch }) }));

const EFFECTS = [{ id: 'pe1', name: 'Burning' }, { id: 'pe2', name: 'Flame' }];

const renderCard = (config = {}, onFieldChange = vi.fn()) => {
  render(
    <ToastProvider>
      <MiningConfigBurningEffect config={{ ...DEFAULT_MINING_MAP_CONFIG, ...config }} onFieldChange={onFieldChange} />
    </ToastProvider>
  );
  return onFieldChange;
};

describe('MiningConfigBurningEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => EFFECTS });
  });

  it('shows a spinner while the library loads, then every effect and "none"', async () => {
    renderCard();
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Burning' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['None (nothing drawn)', 'Burning', 'Flame']);
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/particle-effects');
  });

  it('shows the saved effect as selected', async () => {
    renderCard({ burningEffectId: 'pe2' });
    await screen.findByRole('option', { name: 'Flame' });
    expect(screen.getByLabelText('Burning Effect')).toHaveValue('pe2');
  });

  it('reports a pick, and "none" as null', async () => {
    const onChange = renderCard({ burningEffectId: 'pe1' });
    await screen.findByRole('option', { name: 'Flame' });
    fireEvent.change(screen.getByLabelText('Burning Effect'), { target: { value: 'pe2' } });
    expect(onChange).toHaveBeenCalledWith('burningEffectId', 'pe2');
    fireEvent.change(screen.getByLabelText('Burning Effect'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('burningEffectId', null);
  });

  it('still shows a saved effect that has been deleted from the library', async () => {
    renderCard({ burningEffectId: 'gone' });
    await screen.findByRole('option', { name: 'Burning' });
    expect(screen.getByRole('option', { name: 'Missing effect (gone)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Burning Effect')).toHaveValue('gone');
  });

  it('shows the error and a usable (empty) list when the library cannot be loaded', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderCard();
    expect(await screen.findByText('Failed to load particle effects')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.loading-spinner-container')).not.toBeInTheDocument());
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});
