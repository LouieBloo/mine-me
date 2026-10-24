import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DoodadSoundEffects from './DoodadSoundEffects';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const library = [{ id: 's1', name: 'Drip', url: '/assets/sounds/drip.mp3', type: 'SFX', category: 'GENERAL', isActive: true }];
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });
const routes = (saved: unknown = { id: 'd1', soundEffects: { ambient: { soundId: 's1' } } }) => (url: string) => (url === '/api/admin/sounds' ? json(library) : json(saved));

const renderIt = (doodad = { id: 'd1', soundEffects: null as any }, onSaved = vi.fn()) => {
  render(
    <ToastProvider>
      <DoodadSoundEffects doodad={doodad} onSaved={onSaved} />
    </ToastProvider>
  );
  return onSaved;
};

describe('DoodadSoundEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation(routes());
  });

  it('shows the three doodad slots and no others', async () => {
    renderIt();
    for (const label of ['Ambient', 'React', 'Break']) expect(await screen.findByLabelText(`${label} sound`)).toBeInTheDocument();
    expect(screen.queryByLabelText('Digging sound')).not.toBeInTheDocument();
  });

  it('shows the saved sound for a slot, with its own volume', async () => {
    renderIt({ id: 'd1', soundEffects: { react: { soundId: 's1', volume: 0.3 } } });
    expect(await screen.findByTestId('doodad-sound-preview-react')).toHaveAttribute('src', expect.stringContaining('/assets/sounds/drip.mp3'));
    expect(screen.getByTestId('doodad-sound-volume-value-react')).toHaveTextContent('30%');
  });

  it('assigns a library sound through the doodad\'s sound endpoint and reports the saved doodad', async () => {
    const onSaved = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Drip' }).length).toBe(3), { timeout: 4000 });
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(routes());
    fireEvent.change(screen.getByLabelText('Ambient sound'), { target: { value: 's1' } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(url).toBe('/api/admin/doodads/d1/sound-effects/ambient');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
  });
});
