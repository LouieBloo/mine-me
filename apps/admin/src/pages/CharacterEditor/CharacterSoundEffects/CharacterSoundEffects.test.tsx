import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CharacterSoundEffects from './CharacterSoundEffects';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

const library = [
  { id: 's1', name: 'Ouch', url: '/assets/sounds/ouch.mp3', type: 'SFX', category: 'CHARACTER', isActive: true },
  { id: 's2', name: 'Growl', url: '/assets/sounds/growl.mp3', type: 'SFX', category: 'MOB', isActive: true },
];

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });

const routes = (saved: unknown = { soundEffects: {} }) => (url: string, opts?: any) => {
  if (url === '/api/admin/sounds') return json(library);
  if (url === '/api/admin/character-sounds' && !opts?.method) return json(saved);
  return json({ soundEffects: { hurt: { soundId: 's1' } } });
};

const renderIt = () =>
  render(
    <ToastProvider>
      <CharacterSoundEffects />
    </ToastProvider>
  );

describe('CharacterSoundEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation(routes());
  });

  it('shows the shared spinner while loading, then the four character slots', async () => {
    renderIt();
    expect(screen.getByTestId('character-sounds-loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Take Damage sound')).toBeInTheDocument());
    for (const label of ['Take Damage', 'Jump', 'Land', 'Death']) {
      expect(screen.getByLabelText(`${label} sound`)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText('Digging sound')).not.toBeInTheDocument();
  });

  it('shows the saved sound for a slot with a preview', async () => {
    mockFetchWithAuth.mockImplementation(routes({ soundEffects: { land: { soundId: 's1' } } }));
    renderIt();
    const preview = await screen.findByTestId('character-sound-preview-land');
    expect(preview).toHaveAttribute('src', expect.stringContaining('/assets/sounds/ouch.mp3'));
    expect(screen.queryByTestId('character-sound-preview-jump')).not.toBeInTheDocument();
  });

  it('assigns a library sound to a slot through the character sounds endpoint', async () => {
    renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Ouch' }).length).toBe(4), { timeout: 4000 });
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(routes());

    fireEvent.change(screen.getByLabelText('Take Damage sound'), { target: { value: 's1' } });

    await waitFor(() => expect(screen.getByTestId('character-sound-preview-hurt')).toBeInTheDocument());
    const [url, opts] = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(url).toBe('/api/admin/character-sounds/hurt');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
  });

  it('uploads through the sound library under the Character category, then assigns it', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByLabelText('Jump sound')).toBeInTheDocument());
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url === '/api/admin/sounds' && opts?.method === 'POST') return json({ id: 's9', name: 'boing' });
      return routes()(url, opts);
    });

    const file = new File(['ID3'], 'boing.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Upload Jump sound'), { target: { files: [file] } });

    await waitFor(() => expect(mockFetchWithAuth.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const upload = mockFetchWithAuth.mock.calls.find((c) => c[0] === '/api/admin/sounds' && c[1]?.method === 'POST')!;
    expect((upload[1].body as FormData).get('category')).toBe('CHARACTER');
    const assign = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(assign[0]).toBe('/api/admin/character-sounds/jump');
    expect(JSON.parse(assign[1].body)).toEqual({ soundId: 's9' });
  });

  it('shows an error with a retry when the sounds cannot be loaded', async () => {
    mockFetchWithAuth.mockImplementation((url: string) =>
      url === '/api/admin/character-sounds' ? json({ error: 'db down' }, false) : json(library)
    );
    renderIt();
    const panel = within(screen.getByTestId('character-sounds'));
    expect(await panel.findByRole('alert')).toHaveTextContent('db down');

    mockFetchWithAuth.mockImplementation(routes());
    fireEvent.click(panel.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByLabelText('Take Damage sound')).toBeInTheDocument());
  });

  it('surfaces a failed save and keeps the slot empty', async () => {
    renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Ouch' }).length).toBe(4), { timeout: 4000 });
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) =>
      opts?.method === 'PATCH' ? json({ error: 'Sound not found in the library' }, false) : routes()(url, opts)
    );
    fireEvent.change(screen.getByLabelText('Death sound'), { target: { value: 's1' } });
    await waitFor(() => expect(screen.getByText(/Sound not found in the library/)).toBeInTheDocument());
    expect(screen.queryByTestId('character-sound-preview-death')).not.toBeInTheDocument();
  });

  it('sets the volume of a character slot, sending only the volume', async () => {
    mockFetchWithAuth.mockImplementation(routes({ soundEffects: { jump: { soundId: 's1', volume: 0.5 } } }));
    renderIt();
    await screen.findByTestId('character-sound-preview-jump');
    expect(screen.getByTestId('character-sound-volume-value-jump')).toHaveTextContent('50%');
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation((url: string) =>
      url === '/api/admin/sounds' ? json(library) : json({ soundEffects: { jump: { soundId: 's1', volume: 0.2 } } })
    );

    fireEvent.change(screen.getByLabelText('Jump volume'), { target: { value: '20' } });

    await waitFor(() => expect(mockFetchWithAuth.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const [url, opts] = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(url).toBe('/api/admin/character-sounds/jump');
    expect(JSON.parse(opts.body)).toEqual({ volume: 0.2 });
  });
});
