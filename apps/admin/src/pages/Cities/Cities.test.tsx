import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Cities from './Cities';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'city_1', name: 'Start', description: 'Start' }])
    })
  })
}));

describe('Cities Page', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
           <Cities />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(document.body).toBeDefined();
  });
});
