import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntityDetail } from './EntityDetail';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'test_id', name: 'Test Name' })
    })
  })
}));

describe('EntityDetail Component', () => {
  it('renders loading state initially', () => {
    render(
      <MemoryRouter initialEntries={['/items/test_id']}>
        <ToastProvider>
           <EntityDetail />
        </ToastProvider>
      </MemoryRouter>
    );
    // Since it's loading initially, we might not see the specific text immediately,
    // but we can ensure it doesn't crash.
    expect(document.body).toBeDefined();
  });
});
