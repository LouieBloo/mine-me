import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MobDetail from './MobDetail';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/mobs/:id" element={<MobDetail />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('MobDetail stun settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults a new mob to 250 ms stun and 500 ms immunity', () => {
    renderAt('/mobs/new');
    expect((screen.getByLabelText(/hit stun/i) as HTMLInputElement).value).toBe('250');
    expect((screen.getByLabelText(/stun immunity/i) as HTMLInputElement).value).toBe('500');
  });

  it('loads an existing mob\'s values and saves edits', async () => {
    mockFetchWithAuth.mockImplementation((_url: string, opts?: any) => {
      if (opts?.method === 'PUT') return Promise.resolve({ ok: true, json: async () => ({}) });
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'mob_1', name: 'Boss', level: 5, health: 500, attack: 10, defense: 5,
          hitStunMs: 0, stunImmunityMs: 1500, aiType: 'CHASE_AND_MINE', dropTable: null,
        }),
      });
    });
    renderAt('/mobs/mob_1');

    await waitFor(() => {
      expect((screen.getByLabelText(/hit stun/i) as HTMLInputElement).value).toBe('0');
    });
    expect((screen.getByLabelText(/stun immunity/i) as HTMLInputElement).value).toBe('1500');

    fireEvent.change(screen.getByLabelText(/hit stun/i), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const put = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(put![1].body)).toMatchObject({ hitStunMs: 120, stunImmunityMs: 1500 });
    });
  });
});
