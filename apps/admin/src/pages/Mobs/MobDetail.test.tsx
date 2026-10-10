import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
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
    mockFetchWithAuth.mockImplementation((url: string) =>
      Promise.resolve({ ok: true, json: async () => (url.includes('/effects') ? [] : {}) })
    );
  });

  it('defaults a new mob to 250 ms stun and 500 ms immunity', () => {
    renderAt('/mobs/new');
    expect((screen.getByLabelText(/hit stun/i) as HTMLInputElement).value).toBe('250');
    expect((screen.getByLabelText(/stun immunity/i) as HTMLInputElement).value).toBe('500');
  });

  it('loads an existing mob\'s values and saves edits', async () => {
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url.includes('/effects')) return Promise.resolve({ ok: true, json: async () => [] });
      if (opts?.method === 'PUT') return Promise.resolve({ ok: true, json: async () => ({}) });
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'mob_1', name: 'Boss', level: 5, health: 500, defense: 5,
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

describe('MobDetail combat effects', () => {
  const effects = [
    { id: 'e_spd', name: 'Mining Speed', description: 'Swing rate', miningSpeedModifier: true },
    { id: 'e_dmg', name: 'Damage', description: 'Hit size', damageModifier: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no longer has Attack or Mining Speed number fields (they are effects now)', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => effects });
    renderAt('/mobs/new');
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/admin/effects'));
    expect(screen.queryAllByText(/^(attack|mining speed)$/i, { selector: 'label' })).toHaveLength(0);
  });

  it('loads a mob\'s effects, lets you add one, and saves only effectId and value', async () => {
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url.includes('/effects')) return Promise.resolve({ ok: true, json: async () => effects });
      if (opts?.method === 'PUT') return Promise.resolve({ ok: true, json: async () => ({}) });
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'mob_1', name: 'Boss', level: 5, health: 500, defense: 5, aiType: 'CHASE_AND_MINE', dropTable: null,
          mobEffects: [{ id: 'oe1', mobId: 'mob_1', effectId: 'e_spd', value: 25, effect: effects[0] }],
        }),
      });
    });
    renderAt('/mobs/mob_1');

    await waitFor(() => expect(screen.getByLabelText('Mining Speed value')).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('option', { name: /^Damage/ })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Select Effect'), { target: { value: 'e_dmg' } });
    fireEvent.change(screen.getByLabelText('Value', { selector: '#effects-editor-value' }), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const put = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(put![1].body).mobEffects).toEqual([
        { effectId: 'e_spd', value: 25 },
        { effectId: 'e_dmg', value: 6 },
      ]);
    });
  });

  it('surfaces a failure to load the effect list', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderAt('/mobs/new');
    await waitFor(() => expect(screen.getByText('Failed to load effects')).toBeTruthy());
  });
});

describe('MobDetail sound effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url.includes('/effects')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url === '/api/admin/sounds') {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 's1', name: 'Growl', url: '/assets/sounds/growl.mp3', type: 'SFX', category: 'MOB', isActive: true }],
        });
      }
      if (opts?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'mob_1', soundEffects: { attack: { soundId: 's1' } } }) });
      }
      if (opts?.method === 'PUT') return Promise.resolve({ ok: true, json: async () => ({}) });
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'mob_1', name: 'Boss', level: 5, health: 500, defense: 5, aiType: 'CHASE_AND_MINE', dropTable: null, soundEffects: { death: { soundId: 's1' } } }),
      });
    });
  });

  it('lets a new mob know sounds come after saving', () => {
    renderAt('/mobs/new');
    expect(screen.getByText(/save the mob first, then you can choose its sounds/i)).toBeInTheDocument();
  });

  it('shows the mob\'s sound slots and its current sounds', async () => {
    renderAt('/mobs/mob_1');
    expect(await screen.findByLabelText('Attack sound')).toBeInTheDocument();
    expect(await screen.findByTestId('mob-sound-preview-death')).toBeInTheDocument();
  });

  it('keeps a sound picked here when the mob form is saved afterwards', async () => {
    renderAt('/mobs/mob_1');
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Growl' }).length).toBe(5));
    fireEvent.change(screen.getByLabelText('Attack sound'), { target: { value: 's1' } });
    await waitFor(() => expect(mockFetchWithAuth.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: /save base information/i }));

    await waitFor(() => {
      const put = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PUT');
      expect(JSON.parse(put![1].body).soundEffects).toEqual({ attack: { soundId: 's1' } });
    });
  });
});
