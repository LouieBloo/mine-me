import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExtractorSoundEffects from './ExtractorSoundEffects';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const library = [
  { id: 's1', name: 'Thud', url: '/assets/sounds/thud.mp3', type: 'SFX', category: 'EXTRACTOR', isActive: true },
  { id: 's2', name: 'Growl', url: '/assets/sounds/growl.mp3', type: 'SFX', category: 'MOB', isActive: true },
];
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });
const routes = (saved: unknown = { id: 'e1', soundEffects: { landing: { soundId: 's1' } } }) => (url: string) => (url === '/api/admin/sounds' ? json(library) : json(saved));

const renderIt = (extractor = { id: 'e1', soundEffects: null as any }, onSaved = vi.fn()) => {
  render(
    <ToastProvider>
      <ExtractorSoundEffects extractor={extractor} onSaved={onSaved} />
    </ToastProvider>
  );
  return onSaved;
};

describe('ExtractorSoundEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation(routes());
  });

  it('shows the four extractor slots and no others', async () => {
    renderIt();
    for (const label of ['Landing', 'Running', 'Item onto belt', 'Belt breaks']) {
      expect(await screen.findByLabelText(`${label} sound`)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText('Digging sound')).not.toBeInTheDocument();
  });

  it('assigns a library sound through the extractor\'s sound endpoint and reports the saved extractor', async () => {
    const onSaved = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Thud' }).length).toBe(4), { timeout: 4000 });
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(routes());
    fireEvent.change(screen.getByLabelText('Landing sound'), { target: { value: 's1' } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(url).toBe('/api/admin/extractors/e1/sound-effects/landing');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
  });

  it('shows the saved sound for a slot, with its volume', async () => {
    renderIt({ id: 'e1', soundEffects: { loop: { soundId: 's1', volume: 0.4 } } });
    expect(await screen.findByTestId('extractor-sound-preview-loop')).toHaveAttribute('src', expect.stringContaining('/assets/sounds/thud.mp3'));
    expect(screen.getByTestId('extractor-sound-volume-value-loop')).toHaveTextContent('40%');
  });
});
