import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Gases from './Gases';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const HYDROGEN = {
  id: 'gas_h2', typeKey: 'HYDROGEN', name: 'Hydrogen', color: '#dff1ff', opacity: 0.35, density: 0.07,
  diffusionRate: 0.35, minConcentration: 0.02, ventLifetime: 6,
  flammability: { ignitionChance: 0.9, spreadChance: 1, burnDuration: 0.5, heat: 4, burnsInto: null },
  generation: { minDepth: 3, maxDepth: null, percentage: 3, minSize: 2, maxSize: 4, concentration: 1 },
};
const NITROGEN = { ...HYDROGEN, id: 'gas_n2', typeKey: 'NITROGEN', name: 'Nitrogen', density: 1.15, flammability: null, generation: null };

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/gases']}>
        <Routes>
          <Route path="/gases" element={<Gases />} />
          <Route path="/gases/new" element={<div>NEW PAGE</div>} />
          <Route path="/gases/:id" element={<div>DETAIL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('Gases list page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while loading, then each gas with whether it burns and is generated', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [HYDROGEN, NITROGEN] });
    renderPage();
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByText('Hydrogen')).toBeInTheDocument();
    expect(screen.getByText('Nitrogen')).toBeInTheDocument();
    expect(screen.getByText('HYDROGEN')).toBeInTheDocument();
    expect(screen.getByText('3%')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getAllByText('No')).toHaveLength(2);
    expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/admin/gases');
  });

  it('says so when there are no gases', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    expect(await screen.findByText('No gases yet.')).toBeInTheDocument();
  });

  it('shows the error when loading fails, and stops the spinner', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();
    expect(await screen.findByText('Failed to fetch gases')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.loading-spinner-container')).not.toBeInTheDocument());
  });

  it('shows the error when the request itself fails', async () => {
    mockFetchWithAuth.mockRejectedValue(new Error('Network down'));
    renderPage();
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('opens a gas to edit, and the new-gas page', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [HYDROGEN] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Gas' }));
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument();
  });

  it('goes to the new-gas page', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '+ New Gas' }));
    expect(await screen.findByText('NEW PAGE')).toBeInTheDocument();
  });
});
