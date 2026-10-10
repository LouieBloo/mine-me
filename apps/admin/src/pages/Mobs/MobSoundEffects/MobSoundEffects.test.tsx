import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobSoundEffects from './MobSoundEffects';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

const library = [
  { id: 's1', name: 'Mole Growl', url: '/assets/sounds/growl.mp3', type: 'SFX', category: 'MOB', isActive: true },
  { id: 's2', name: 'Pistol', url: '/assets/sounds/items/pistol.wav', type: 'SFX', category: 'ITEM', isActive: true },
  { id: 's3', name: 'Retired', url: '/assets/sounds/old.mp3', type: 'SFX', category: 'GENERAL', isActive: false },
];

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });

const renderIt = (props: Partial<React.ComponentProps<typeof MobSoundEffects>> = {}) => {
  const onChange = vi.fn();
  render(
    <ToastProvider>
      <MobSoundEffects mobId="mob1" soundEffects={null} onChange={onChange} {...props} />
    </ToastProvider>
  );
  return { onChange };
};

describe('MobSoundEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/sounds' ? json(library) : json({ id: 'mob1' })));
  });

  it('shows all five slots', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByLabelText('Death sound')).toBeInTheDocument());
    for (const label of ['Digging', 'Idle / Ambient', 'Take Damage', 'Attack', 'Death']) {
      expect(screen.getByLabelText(`${label} sound`)).toBeInTheDocument();
    }
  });

  it('asks to save a new mob first and loads nothing', () => {
    renderIt({ mobId: null });
    expect(screen.getByText(/save the mob first/i)).toBeInTheDocument();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it('offers active library sounds grouped by category, not inactive ones', async () => {
    renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Mole Growl' }).length).toBe(5));
    expect(screen.queryByRole('option', { name: 'Retired' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Item sounds' }).length).toBe(5);
  });

  it('assigns a library sound to a slot and reports the saved mob', async () => {
    const { onChange } = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Mole Growl' }).length).toBe(5));
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ id: 'mob1', soundEffects: { attack: { soundId: 's1' } } }));

    fireEvent.change(screen.getByLabelText('Attack sound'), { target: { value: 's1' } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ id: 'mob1', soundEffects: { attack: { soundId: 's1' } } }));
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/mobs/mob1/sound-effects/attack');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
  });

  it('shows the chosen sound with a preview, and clears it', async () => {
    const { onChange } = renderIt({ soundEffects: { death: { soundId: 's1' } } });
    const preview = await screen.findByTestId('mob-sound-preview-death');
    expect(preview).toHaveAttribute('src', expect.stringContaining('/assets/sounds/growl.mp3'));
    expect(screen.queryByTestId('mob-sound-preview-dig')).not.toBeInTheDocument();

    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ id: 'mob1', soundEffects: {} }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(JSON.parse(mockFetchWithAuth.mock.calls[0][1].body)).toEqual({ soundId: null });
  });

  it('uploads through the sound library (keeping the file name), then assigns it and refreshes the library', async () => {
    const { onChange } = renderIt();
    await waitFor(() => expect(screen.getByLabelText('Death sound')).toBeInTheDocument());
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url === '/api/admin/sounds' && opts?.method === 'POST') return json({ id: 's9', name: 'roar' });
      if (url === '/api/admin/sounds') return json(library);
      return json({ id: 'mob1', soundEffects: { death: { soundId: 's9' } } });
    });

    const file = new File(['ID3'], 'roar.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Upload Death sound'), { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const upload = mockFetchWithAuth.mock.calls.find((c) => c[0] === '/api/admin/sounds' && c[1]?.method === 'POST')!;
    const form = upload[1].body as FormData;
    expect(form.get('file')).toBe(file);
    expect(form.get('category')).toBe('MOB');
    const assign = mockFetchWithAuth.mock.calls.find((c) => String(c[0]).includes('/mobs/mob1/sound-effects/death'))!;
    expect(assign[1].method).toBe('PATCH');
    expect(JSON.parse(assign[1].body)).toEqual({ soundId: 's9' });
    await waitFor(() => expect(mockFetchWithAuth.mock.calls.filter((c) => c[0] === '/api/admin/sounds' && !c[1]?.method).length).toBeGreaterThan(0));
  });

  it('surfaces the server error and does not report a change', async () => {
    const { onChange } = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Mole Growl' }).length).toBe(5));
    mockFetchWithAuth.mockImplementation(() => json({ error: 'Sound not found in the library' }, false));

    fireEvent.change(screen.getByLabelText('Attack sound'), { target: { value: 's1' } });

    expect(await screen.findByText('Sound not found in the library')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('flags a slot whose sound was deleted', async () => {
    renderIt({ soundEffects: { idle: { soundId: 'gone' } } });
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Missing sound/ })).toBeInTheDocument();
  });

  it('reports a library load failure', async () => {
    mockFetchWithAuth.mockImplementation(() => json({}, false));
    renderIt();
    expect(await screen.findByText('Failed to load the sound library')).toBeInTheDocument();
  });
});
