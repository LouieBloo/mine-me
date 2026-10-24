import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Biomes, { depthText } from './Biomes';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const DEFAULT = { id: 'b_default', key: 'default', name: 'Default', isDefault: true, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 45 };
const FROZEN = { id: 'b_frozen', key: 'frozen_caves', name: 'Frozen Caves', isDefault: false, minDepth: 90, maxDepth: 270, weight: 1.5, noiseScale: 60, ambient: { tint: '#99bbff' } };

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/biomes']}>
        <Routes>
          <Route path="/biomes" element={<Biomes />} />
          <Route path="/biomes/new" element={<div>NEW PAGE</div>} />
          <Route path="/biomes/:id" element={<div>DETAIL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('depthText', () => {
  it('counts in original blocks and says bottom when there is no limit', () => {
    expect(depthText({ minDepth: 90, maxDepth: 270 })).toBe('30 - 90');
    expect(depthText({ minDepth: 0, maxDepth: null })).toBe('0 - bottom');
  });
});

describe('Biomes list page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while loading, then each biome with its depth, weight and role', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [DEFAULT, FROZEN] });
    renderPage();
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByText('Frozen Caves')).toBeInTheDocument();
    expect(screen.getByText('frozen_caves')).toBeInTheDocument();
    expect(screen.getByText('30 - 90')).toBeInTheDocument();
    expect(screen.getByText('0 - bottom')).toBeInTheDocument();
    expect(screen.getByText('Default', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByLabelText('Frozen Caves tint #99bbff')).toBeInTheDocument();
    expect(screen.getByLabelText('Default has no tint')).toBeInTheDocument();
  });

  it('says so when there are no biomes', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    expect(await screen.findByText('No biomes yet.')).toBeInTheDocument();
  });

  it('shows an error when the list cannot be loaded', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();
    expect(await screen.findByText('Failed to fetch biomes')).toBeInTheDocument();
  });

  it('opens the editor for a biome and for a new one', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [FROZEN] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Biome' }));
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument();
  });

  it('opens the new biome page', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '+ New Biome' }));
    expect(await screen.findByText('NEW PAGE')).toBeInTheDocument();
  });
});
