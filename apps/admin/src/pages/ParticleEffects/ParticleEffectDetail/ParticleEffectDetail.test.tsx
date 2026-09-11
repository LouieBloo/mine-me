import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ParticleEffectDetail from './ParticleEffectDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

vi.mock('../../../components/ParticleCanvas/ParticleCanvas', () => ({
  default: () => <div data-testid="particle-canvas-mock">Mock Particle Canvas</div>,
}));

const mockEffect = {
  id: 'eff_torch',
  name: 'Torch Flame',
  type: 'CONTINUOUS',
  description: 'Fire embers for torch',
  config: {
    emitterType: 'continuous',
    shape: 'circle',
    rate: 30,
    lifetime: { min: 0.5, max: 1.0 },
    speed: { min: 20, max: 50 },
    angle: { min: -105, max: -75 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    color: { start: '#ffcc00', end: '#ff2200' },
  },
};

const mockFetchWithAuth = vi.fn().mockImplementation((url: string, opts?: any) => {
  if (opts?.method === 'POST' || opts?.method === 'PUT') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: 'eff_torch', ...JSON.parse(opts.body) }),
    });
  }
  if (url.includes('/api/admin/particle-effects/eff_torch')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockEffect),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: mockFetchWithAuth,
  }),
}));

describe('ParticleEffectDetail Page', () => {
  const renderDetail = (id = 'eff_torch') => {
    return render(
      <MemoryRouter initialEntries={[`/particle-effects/${id}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/particle-effects/:id" element={<ParticleEffectDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );
  };

  it('renders existing effect details and preview viewport', async () => {
    renderDetail('eff_torch');

    expect(await screen.findByDisplayValue('Torch Flame')).toBeDefined();
    expect(screen.getByTestId('particle-canvas-mock')).toBeDefined();
    expect(screen.getByText('JSON Configuration')).toBeDefined();
  });

  it('loads presets and updates form fields on new effect', async () => {
    renderDetail('new');

    expect(await screen.findByText('NEW PARTICLE EFFECT')).toBeDefined();
    const dirtPresetBtn = screen.getByText('Block Dirt Hit');
    fireEvent.click(dirtPresetBtn);

    expect(screen.getByDisplayValue('Block Dirt Hit')).toBeDefined();
  });

  it('saves effect on save button click', async () => {
    renderDetail('new');

    const nameInput = await screen.findByPlaceholderText('e.g. Torch Flame');
    fireEvent.change(nameInput, { target: { value: 'New Custom Aura' } });

    const saveBtn = screen.getByText('Create Effect');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/admin/particle-effects',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });
});
