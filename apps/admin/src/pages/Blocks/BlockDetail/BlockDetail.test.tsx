import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BlockDetail from './BlockDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: mockFetchWithAuth,
  }),
}));

describe('BlockDetail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMockData = (blockOverride = {}, particleEffectsOverride?: any[]) => {
    const blockData = {
      id: 'block_copperium',
      typeKey: 'COPPERIUM',
      name: 'Copperium Ore',
      description: 'Dense rock with copper deposits',
      textureUrl: '/assets/mining/block_copperium-block.png',
      mineTimeMs: 1200,
      staminaCost: 1,
      idleParticleEffectId: 'pe_fairy_sparkle',
      idleParticleEffect: { id: 'pe_fairy_sparkle', name: 'fairy_sparkle' },
      ...blockOverride,
    };

    const particleEffectsData = particleEffectsOverride || [
      {
        id: 'pe_fairy_sparkle',
        name: 'fairy_sparkle',
        type: 'CONTINUOUS',
        config: { emitterType: 'continuous', rate: 3.5 },
      },
      {
        id: 'pe_torch_flame',
        name: 'torch_flame',
        type: 'CONTINUOUS',
        config: { emitterType: 'continuous', rate: 15 },
      },
    ];

    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url.includes('/api/admin/blocks/block_copperium') && (!opts || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => blockData,
        });
      }
      if (url.includes('/api/admin/particle-effects')) {
        return Promise.resolve({
          ok: true,
          json: async () => particleEffectsData,
        });
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...blockData, ...JSON.parse(opts.body) }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
  };

  it('renders block properties and idle particle effect dropdown', async () => {
    setupMockData();

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/blocks/block_copperium']}>
          <Routes>
            <Route path="/blocks/:id" element={<BlockDetail />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Copperium Ore')).toBeInTheDocument();
    });

    // Check Idle Particle Effect dropdown
    const select = screen.getByLabelText(/idle particle effect/i);
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('pe_fairy_sparkle');

    // Check "View FX ↗" button
    expect(screen.getByText('View FX ↗')).toBeInTheDocument();
  });

  it('allows changing the idle particle effect and saving', async () => {
    setupMockData();

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/blocks/block_copperium']}>
          <Routes>
            <Route path="/blocks/:id" element={<BlockDetail />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Copperium Ore')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('fairy_sparkle (continuous)');
    fireEvent.change(select, { target: { value: 'pe_torch_flame' } });

    const saveButton = screen.getByRole('button', { name: /save block properties/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/admin/blocks/block_copperium',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"idleParticleEffectId":"pe_torch_flame"'),
        })
      );
    });
  });

  it('allows setting idle particle effect to None', async () => {
    setupMockData();

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/blocks/block_copperium']}>
          <Routes>
            <Route path="/blocks/:id" element={<BlockDetail />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Copperium Ore')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('fairy_sparkle (continuous)');
    fireEvent.change(select, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: /save block properties/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/admin/blocks/block_copperium',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"idleParticleEffectId":null'),
        })
      );
    });
  });
});
