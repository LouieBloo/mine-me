import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Fluids from './Fluids';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const OIL = {
  id: 'fluid_oil', typeKey: 'OIL', name: 'Oil', color: '#0b0b0d', opacity: 0.9, density: 0.8, viscosity: 0.6,
  flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02,
  flammability: { ignitionChance: 0.8, spreadChance: 0.5, burnDuration: 8, heat: 3, burnsInto: null },
  generation: { minDepth: 8, maxDepth: null, percentage: 1.5, minSize: 2, maxSize: 4 },
};
const WATER = { ...OIL, id: 'fluid_water', typeKey: 'WATER', name: 'Water', flammability: null, generation: null };

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/fluids']}>
        <Routes>
          <Route path="/fluids" element={<Fluids />} />
          <Route path="/fluids/new" element={<div>NEW PAGE</div>} />
          <Route path="/fluids/:id" element={<div>DETAIL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('Fluids list page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while loading, then each fluid with whether it burns and is generated', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [OIL, WATER] });
    renderPage();
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByText('Oil')).toBeInTheDocument();
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByText('OIL')).toBeInTheDocument();
    expect(screen.getByText('1.5%')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getAllByText('No')).toHaveLength(2);
    expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/admin/fluids');
  });

  it('says so when there are no fluids', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    expect(await screen.findByText('No fluids yet.')).toBeInTheDocument();
  });

  it('shows the error when loading fails, and stops the spinner', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();
    expect(await screen.findByText('Failed to fetch fluids')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.loading-spinner-container')).not.toBeInTheDocument());
  });

  it('shows the error when the request itself fails', async () => {
    mockFetchWithAuth.mockRejectedValue(new Error('Network down'));
    renderPage();
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('opens a fluid to edit, and the new-fluid page', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [OIL] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Fluid' }));
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument();
  });

  it('goes to the new-fluid page', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '+ New Fluid' }));
    expect(await screen.findByText('NEW PAGE')).toBeInTheDocument();
  });
});
