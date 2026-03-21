import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dungeons from './Dungeons';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'dung_1', name: 'Cave', levels: [] }])
    })
  })
}));

describe('Dungeons Page', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
           <Dungeons />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(document.body).toBeDefined();
  });
});
