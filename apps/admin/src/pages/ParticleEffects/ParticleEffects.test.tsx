import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ParticleEffects from './ParticleEffects';
import { ToastProvider } from '../../contexts/ToastContext';

const mockEffects = [
  {
    id: 'eff_torch',
    name: 'Torch Flame',
    type: 'CONTINUOUS',
    description: 'Fire embers',
    config: {
      emitterType: 'continuous',
      shape: 'circle',
      color: { start: '#ffcc00', end: '#ff2200' },
      lifetime: { min: 0.5, max: 1.0 },
      speed: { min: 20, max: 50 },
      angle: { min: -105, max: -75 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
    },
  },
];

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEffects),
    }),
  }),
}));

describe('ParticleEffects Page', () => {
  it('renders header and add button', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <ParticleEffects />
        </ToastProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('PARTICLE EFFECTS')).toBeDefined();
    expect(screen.getByText('Add Particle Effect')).toBeDefined();
  });
});
