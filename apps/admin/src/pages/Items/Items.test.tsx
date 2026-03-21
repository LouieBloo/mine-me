import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Items from './Items';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'item_1', name: 'Sword', type: 'Weapon' }])
    })
  })
}));

describe('Items Page', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
           <Items />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(document.body).toBeDefined();
  });
});
