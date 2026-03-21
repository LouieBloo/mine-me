import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Mobs from './Mobs';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'mob_1', name: 'Slime', level: 1 }])
    })
  })
}));

describe('Mobs Page', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
           <Mobs />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(document.body).toBeDefined();
  });
});
