import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MissionSoundEffects from './MissionSoundEffects';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const library = [{ id: 's1', name: 'Chime', url: '/assets/sounds/chime.mp3', type: 'SFX', category: 'GENERAL', isActive: true }];
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });
const routes = (saved: unknown = { id: 'm1', soundEffects: { complete: { soundId: 's1' } } }) => (url: string) => (url === '/api/admin/sounds' ? json(library) : json(saved));

const renderIt = (mission = { id: 'm1', soundEffects: null as any }, onSaved = vi.fn()) => {
  render(
    <ToastProvider>
      <MissionSoundEffects mission={mission} onSaved={onSaved} />
    </ToastProvider>
  );
  return onSaved;
};

describe('MissionSoundEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation(routes());
  });

  it('shows the three mission slots and no others', async () => {
    renderIt();
    for (const label of ['Objective done', 'Mission complete', 'Mission failed']) expect(await screen.findByLabelText(`${label} sound`)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ambient sound')).not.toBeInTheDocument();
  });

  it('shows the saved sound for a slot, with its own volume', async () => {
    renderIt({ id: 'm1', soundEffects: { complete: { soundId: 's1', volume: 0.3 } } });
    expect(await screen.findByTestId('mission-sound-preview-complete')).toHaveAttribute('src', expect.stringContaining('/assets/sounds/chime.mp3'));
    expect(screen.getByTestId('mission-sound-volume-value-complete')).toHaveTextContent('30%');
  });

  it('assigns a library sound through the mission\'s sound endpoint and reports the saved mission', async () => {
    const onSaved = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Chime' }).length).toBe(3), { timeout: 4000 });
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(routes());
    fireEvent.change(screen.getByLabelText('Mission complete sound'), { target: { value: 's1' } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(url).toBe('/api/admin/missions/m1/sound-effects/complete');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
  });
});
