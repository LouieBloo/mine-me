import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Doodads, { sizeText } from './Doodads';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const MUSHROOM = {
  id: 'd_mushroom', key: 'glow_mushroom', name: 'Glow Mushroom', anchor: 'FLOOR', width: 3, height: 3, zOffset: 0, textureUrl: '/assets/sprites/doodads/glow.png',
  spawn: { minDepth: 9, maxDepth: 90 }, biomes: [{ biomeId: 'b1', biomeKey: 'frozen_caves', weight: 1, density: 1 }],
};
const DRIP = { id: 'd_drip', key: 'drip', name: 'Drip', anchor: 'CEILING', width: 3, height: 6, zOffset: 0, biomes: [] };

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/doodads']}>
        <Routes>
          <Route path="/doodads" element={<Doodads />} />
          <Route path="/doodads/new" element={<div>NEW PAGE</div>} />
          <Route path="/doodads/:id" element={<div>DETAIL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('sizeText', () => {
  it('counts in original blocks, with a decimal for part of one', () => {
    expect(sizeText({ width: 3, height: 6 })).toBe('1 x 2');
    expect(sizeText({ width: 1, height: 4 })).toBe('0.3 x 1.3');
  });
});

describe('Doodads list page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while loading, then each doodad with its anchor, size, depth and biomes', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [MUSHROOM, DRIP] });
    renderPage();
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByText('Glow Mushroom')).toBeInTheDocument();
    expect(screen.getByText('glow_mushroom')).toBeInTheDocument();
    expect(screen.getByText('FLOOR')).toBeInTheDocument();
    expect(screen.getByText('CEILING')).toBeInTheDocument();
    expect(screen.getByText('3 - 30')).toBeInTheDocument();
    expect(screen.getByText('any depth')).toBeInTheDocument();
    expect(screen.getByText('frozen_caves')).toBeInTheDocument();
    expect(screen.getByText('none')).toBeInTheDocument();
    expect(screen.getByAltText('Glow Mushroom picture')).toBeInTheDocument();
    expect(screen.getByText('No art')).toBeInTheDocument();
  });

  it('says so when there are no doodads', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    expect(await screen.findByText('No doodads yet.')).toBeInTheDocument();
  });

  it('shows an error when the list cannot be loaded', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();
    expect(await screen.findByText('Failed to fetch doodads')).toBeInTheDocument();
  });

  it('opens the editor for a doodad and a new one', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [MUSHROOM] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Doodad' }));
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument();
  });

  it('opens the new doodad page', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '+ New Doodad' }));
    expect(await screen.findByText('NEW PAGE')).toBeInTheDocument();
  });
});
