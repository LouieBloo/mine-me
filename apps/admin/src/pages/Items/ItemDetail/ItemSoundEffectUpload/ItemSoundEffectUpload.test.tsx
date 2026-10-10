import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ItemSoundEffectUpload from './ItemSoundEffectUpload';
import { ToastProvider } from '../../../../contexts/ToastContext';
import { DynamiteSoundProfile } from '@mine-me/shared';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

const library = [
  { id: 's1', name: 'Pistol', url: '/assets/sounds/items/pistol.wav', type: 'SFX', category: 'ITEM', isActive: true },
  { id: 's2', name: 'Boom', url: '/assets/sounds/items/boom.mp3', type: 'SFX', category: 'ITEM', isActive: true },
];

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });

const renderIt = (props: Partial<React.ComponentProps<typeof ItemSoundEffectUpload>> = {}) => {
  const onUploadSuccess = vi.fn();
  render(
    <ToastProvider>
      <ItemSoundEffectUpload itemId="item1" soundEffects={null} onUploadSuccess={onUploadSuccess} {...props} />
    </ToastProvider>
  );
  return { onUploadSuccess };
};

describe('ItemSoundEffectUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/sounds' ? json(library) : json({ id: 'item1' })));
  });

  it('shows every slot of the weapon profile with the library to choose from', async () => {
    renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Pistol' }).length).toBe(3));
    for (const label of ['Weapon Swing / Use', 'Gunshot / Firing Sound', 'Reload Sound']) {
      expect(screen.getByLabelText(`${label} sound`)).toBeInTheDocument();
    }
  });

  it('assigns an already-uploaded sound to a slot', async () => {
    const { onUploadSuccess } = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Pistol' }).length).toBe(3));
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ id: 'item1', soundEffects: { reload: { url: '/assets/sounds/items/pistol.wav' } } }));

    fireEvent.change(screen.getByLabelText('Reload Sound sound'), { target: { value: 's1' } });

    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/items/item1/sound-effects/reload');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
  });

  it('shows the library sound a slot already uses (matched by url) with a preview, and clears it', async () => {
    const { onUploadSuccess } = renderIt({ soundEffects: { reload: { url: '/assets/sounds/items/pistol.wav', loop: false } } });
    const preview = await screen.findByTestId('item-sound-preview-reload');
    expect(preview).toHaveAttribute('src', expect.stringContaining('/assets/sounds/items/pistol.wav'));
    expect(screen.getByLabelText('Reload Sound sound')).toHaveValue('s1');

    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ id: 'item1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalled());
    expect(JSON.parse(mockFetchWithAuth.mock.calls[0][1].body)).toEqual({ soundId: null });
  });

  it('uses the legacy soundEffectUrl for the throw slot', async () => {
    renderIt({ soundEffectUrl: '/assets/sounds/items/boom.mp3' });
    await waitFor(() => expect(screen.getByLabelText('Weapon Swing / Use sound')).toHaveValue('s2'));
  });

  it('uploads through the sound library (keeping the file name), then assigns it to the slot', async () => {
    const { onUploadSuccess } = renderIt();
    await waitFor(() => expect(screen.getByLabelText('Reload Sound sound')).toBeInTheDocument());
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url === '/api/admin/sounds' && opts?.method === 'POST') return json({ id: 's9', name: 'click' });
      if (url === '/api/admin/sounds') return json(library);
      return json({ id: 'item1' });
    });

    const file = new File(['ID3'], 'click.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Upload Reload Sound sound'), { target: { files: [file] } });

    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalled());
    const upload = mockFetchWithAuth.mock.calls.find((c) => c[0] === '/api/admin/sounds' && c[1]?.method === 'POST')!;
    const form = upload[1].body as FormData;
    expect(form.get('file')).toBe(file);
    expect(form.get('category')).toBe('ITEM');
    expect(form.get('name')).toBeNull(); // the server names it after the file
    const assign = mockFetchWithAuth.mock.calls.find((c) => c[0] === '/api/admin/items/item1/sound-effects/reload')!;
    expect(assign[1].method).toBe('PATCH');
    expect(JSON.parse(assign[1].body)).toEqual({ soundId: 's9' });
    // no per-item upload endpoint is ever used
    expect(mockFetchWithAuth.mock.calls.some((c) => c[1]?.body instanceof FormData && c[0] !== '/api/admin/sounds')).toBe(false);
  });

  it('shows the server message and assigns nothing if the library upload fails', async () => {
    const { onUploadSuccess } = renderIt();
    await waitFor(() => expect(screen.getByLabelText('Reload Sound sound')).toBeInTheDocument());
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) =>
      url === '/api/admin/sounds' && opts?.method === 'POST' ? json({ error: 'File too large' }, false) : json(library)
    );
    fireEvent.change(screen.getByLabelText('Upload Reload Sound sound'), { target: { files: [new File(['x'], 'big.mp3', { type: 'audio/mpeg' })] } });
    expect(await screen.findByText('File too large')).toBeInTheDocument();
    expect(onUploadSuccess).not.toHaveBeenCalled();
    expect(mockFetchWithAuth.mock.calls.some((c) => String(c[0]).includes('sound-effects'))).toBe(false);
  });

  it('rejects a non-audio file without calling the server', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByLabelText('Reload Sound sound')).toBeInTheDocument());
    mockFetchWithAuth.mockClear();
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Upload Reload Sound sound'), { target: { files: [file] } });
    expect(await screen.findByText(/only audio files/i)).toBeInTheDocument();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it('surfaces the server error and does not report a change', async () => {
    const { onUploadSuccess } = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Pistol' }).length).toBe(3));
    mockFetchWithAuth.mockImplementation(() => json({ error: 'Sound not found in the library' }, false));
    fireEvent.change(screen.getByLabelText('Reload Sound sound'), { target: { value: 's1' } });
    expect(await screen.findByText('Sound not found in the library')).toBeInTheDocument();
    expect(onUploadSuccess).not.toHaveBeenCalled();
  });

  it('flags a slot whose file is not in the library yet', async () => {
    renderIt({ soundEffects: { reload: { url: '/assets/sounds/items/unregistered.wav' } } });
    expect(await screen.findByText(/not in the sound library yet/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Not in library \(unregistered\.wav\)/ })).toBeInTheDocument();
  });

  it('shows a loop toggle only for slots that allow looping, and sends the change', async () => {
    const { onUploadSuccess } = renderIt({
      profile: new DynamiteSoundProfile(),
      soundEffects: { inGameEffect: { url: '/assets/sounds/items/boom.mp3', loop: true } },
    });
    const checkbox = await screen.findByRole('checkbox', { name: /looping sound/i });
    expect(checkbox).toBeChecked();
    expect(screen.getAllByRole('checkbox').length).toBe(1);

    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ id: 'item1' }));
    fireEvent.click(checkbox);
    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalled());
    expect(JSON.parse(mockFetchWithAuth.mock.calls[0][1].body)).toEqual({ loop: false });
  });

  it('reports a library load failure', async () => {
    mockFetchWithAuth.mockImplementation(() => json({}, false));
    renderIt();
    expect(await screen.findByText('Failed to load the sound library')).toBeInTheDocument();
  });
});
