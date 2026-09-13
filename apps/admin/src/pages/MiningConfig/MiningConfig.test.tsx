import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MiningConfig from './MiningConfig';
import { ToastProvider } from '../../contexts/ToastContext';
import { DEFAULT_MINING_MAP_CONFIG } from '@mine-me/shared';

const mockFetchWithAuth = vi.fn();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: mockFetchWithAuth,
  }),
}));

describe('MiningConfig Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFetchWithAuth.mockImplementation((url: string, options?: any) => {
      if (url === '/api/admin/mining-config' && (!options || options.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => DEFAULT_MINING_MAP_CONFIG,
        });
      }
      if (url === '/api/admin/mining-config/preview') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            seed: 12345,
            stats: {
              width: 45,
              height: 45,
              totalTiles: 2025,
              emptyCount: 450,
              solidCount: 1575,
              mineralCount: 150,
              rockCount: 180,
              chestCount: 4,
              voidPercentage: 22.7,
              solidPercentage: 77.3,
            },
            tiles: Array.from({ length: 45 }, () => Array.from({ length: 45 }, () => 1)),
          }),
        });
      }
      if (url === '/api/admin/mining-config' && options?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => JSON.parse(options.body),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });
  });

  it('renders header, form controls, and live preview components', async () => {
    render(
      <ToastProvider>
        <BrowserRouter>
          <MiningConfig />
        </BrowserRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('MINE GENERATOR CONFIG')).toBeInTheDocument();
    });

    expect(screen.getByText(/Cavern Generation/i)).toBeInTheDocument();
    expect(screen.getByText(/Tunnel Generation/i)).toBeInTheDocument();
    expect(screen.getByText(/Resources & Hazards/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Mini-Map Preview/i)).toBeInTheDocument();
    expect(screen.getByText('Save Configuration')).toBeInTheDocument();
  });

  it('allows changing sliders and triggering preview generation', async () => {
    render(
      <ToastProvider>
        <BrowserRouter>
          <MiningConfig />
        </BrowserRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('MINE GENERATOR CONFIG')).toBeInTheDocument();
    });

    const cavernSlider = screen.getByLabelText(/Cavern Density/i);
    await act(async () => {
      fireEvent.change(cavernSlider, { target: { value: '60' } });
    });
    expect(screen.getByText('60%')).toBeInTheDocument();

    const updatePreviewBtn = screen.getByRole('button', { name: /Update Preview/i });
    await act(async () => {
      fireEvent.click(updatePreviewBtn);
    });

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/admin/mining-config/preview', expect.any(Object));
    });
  });

  it('applies quick presets when clicked', async () => {
    render(
      <ToastProvider>
        <BrowserRouter>
          <MiningConfig />
        </BrowserRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('MINE GENERATOR CONFIG')).toBeInTheDocument();
    });

    const sprawlingBtn = screen.getByRole('button', { name: 'Sprawling Caverns' });
    await act(async () => {
      fireEvent.click(sprawlingBtn);
    });

    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('renders ore vein inputs and displays ore stats in metrics', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => {
      if (url === '/api/admin/mining-config') {
        return Promise.resolve({
          ok: true,
          json: async () => DEFAULT_MINING_MAP_CONFIG,
        });
      }
      if (url === '/api/admin/mining-config/preview') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            seed: 12345,
            stats: {
              width: 45,
              height: 45,
              totalTiles: 2025,
              emptyCount: 450,
              solidCount: 1575,
              mineralCount: 150,
              rockCount: 180,
              chestCount: 4,
              copperiumCount: 42,
              silveriumCount: 18,
              voidPercentage: 22.7,
              solidPercentage: 77.3,
            },
            tiles: Array.from({ length: 45 }, () => Array.from({ length: 45 }, () => 1)),
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <ToastProvider>
        <BrowserRouter>
          <MiningConfig />
        </BrowserRouter>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('MINE GENERATOR CONFIG')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Copperium Abundance/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Silverium Abundance/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Silverium Min Depth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ore Cluster Chance/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('18')).toBeInTheDocument();
    });
  });
});
