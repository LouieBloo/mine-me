import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BlockSoundEffectUpload from './BlockSoundEffectUpload';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

const library = [
  { id: 's1', name: 'Crunch', url: '/assets/sounds/Crunch.mp3', type: 'SFX', category: 'GENERAL', isActive: true },
  { id: 's2', name: 'Thud', url: '/assets/sounds/blocks/thud.mp3', type: 'SFX', category: 'BLOCK', isActive: true },
];
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });

const renderIt = (props: Partial<React.ComponentProps<typeof BlockSoundEffectUpload>> = {}) => {
  const onUploadSuccess = vi.fn();
  render(
    <ToastProvider>
      <BlockSoundEffectUpload blockId="block_dirt" blockName="Dirt" soundEffectUrl={null} onUploadSuccess={onUploadSuccess} {...props} />
    </ToastProvider>
  );
  return { onUploadSuccess };
};

describe('BlockSoundEffectUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/sounds' ? json(library) : json({ id: 'block_dirt' })));
  });

  it('offers the whole sound library for the damage sound', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Crunch' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Thud' })).toBeInTheDocument();
  });

  it('assigns a library sound to the block', async () => {
    const { onUploadSuccess } = renderIt();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Crunch' })).toBeInTheDocument());
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ id: 'block_dirt', soundEffectUrl: '/assets/sounds/Crunch.mp3' }));

    fireEvent.change(screen.getByLabelText('Damage Sound sound'), { target: { value: 's1' } });

    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalledWith({ id: 'block_dirt', soundEffectUrl: '/assets/sounds/Crunch.mp3' }));
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/blocks/block_dirt/sound-effect');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
  });

  it('shows the block\'s current sound (matched by url) and clears it', async () => {
    const { onUploadSuccess } = renderIt({ soundEffectUrl: '/assets/sounds/blocks/thud.mp3' });
    await waitFor(() => expect(screen.getByLabelText('Damage Sound sound')).toHaveValue('s2'));
    expect(screen.getByTestId('block-sound-preview-damage')).toHaveAttribute('src', expect.stringContaining('thud.mp3'));

    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ id: 'block_dirt', soundEffectUrl: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalled());
    expect(JSON.parse(mockFetchWithAuth.mock.calls[0][1].body)).toEqual({ soundId: null });
  });

  it('uploads through the sound library under its own name, then assigns it', async () => {
    const { onUploadSuccess } = renderIt();
    await waitFor(() => expect(screen.getByLabelText('Damage Sound sound')).toBeInTheDocument());
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url === '/api/admin/sounds' && opts?.method === 'POST') return json({ id: 'new1', name: 'Rock Crack' });
      if (url === '/api/admin/sounds') return json(library);
      return json({ id: 'block_dirt', soundEffectUrl: '/assets/sounds/Rock_Crack.mp3' });
    });

    const file = new File(['ID3'], 'Rock Crack.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Upload Damage Sound sound'), { target: { files: [file] } });

    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalled());
    const upload = mockFetchWithAuth.mock.calls.find((c) => c[0] === '/api/admin/sounds' && c[1]?.method === 'POST')!;
    const form = upload[1].body as FormData;
    expect(form.get('file')).toBe(file);
    expect(form.get('category')).toBe('BLOCK');
    expect(form.get('name')).toBeNull(); // the server names it after the file
    const assign = mockFetchWithAuth.mock.calls.find((c) => c[0] === '/api/admin/blocks/block_dirt/sound-effect')!;
    expect(JSON.parse(assign[1].body)).toEqual({ soundId: 'new1' });
  });
});
