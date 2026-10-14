import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UploadSoundModal } from './UploadSoundModal';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

const renderModal = () =>
  render(
    <ToastProvider>
      <UploadSoundModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
    </ToastProvider>
  );

describe('UploadSoundModal category', () => {
  it('only asks what a sound effect is used for, not music', () => {
    renderModal();
    expect(screen.queryByLabelText('Used For')).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Background Music (BGM)'), { target: { value: 'SFX' } });
    const select = screen.getByLabelText('Used For') as HTMLSelectElement;
    expect(select.value).toBe('GENERAL');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['GENERAL', 'MOB', 'ITEM', 'BLOCK', 'CHARACTER', 'FLUID']);
  });

  it("fills the name with the file's own name, unchanged, so it is found under that name later", () => {
    const { container } = renderModal();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['ID3'], 'Big_Boom-final (2).mp3', { type: 'audio/mpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByDisplayValue('Big_Boom-final (2)')).toBeInTheDocument();
  });
});

describe('UploadSoundModal volume', () => {
  const submit = async (type: 'BGM' | 'SFX') => {
    mockFetchWithAuth.mockReset();
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ id: 's1', name: 'x' }) });
    const { container } = renderModal();
    if (type === 'SFX') fireEvent.change(screen.getByDisplayValue('Background Music (BGM)'), { target: { value: 'SFX' } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['ID3'], 'a.mp3', { type: 'audio/mpeg' })] } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalled());
    return mockFetchWithAuth.mock.calls[0][1].body as FormData;
  };

  it('music has a preset volume and sends it', async () => {
    renderModal();
    expect(screen.getByText(/Preset Volume/)).toBeInTheDocument();
    cleanup();
    const form = await submit('BGM');
    expect(form.get('volume')).toBe('0.8'); // the preset the form starts with
  });

  it('a sound effect has no volume of its own: no slider, nothing sent, and a pointer to where it is set', async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue('Background Music (BGM)'), { target: { value: 'SFX' } });
    expect(screen.queryByText(/Preset Volume/)).not.toBeInTheDocument();
    expect(screen.getByText(/set it where the sound is used/i)).toBeInTheDocument();
    cleanup();
    const form = await submit('SFX');
    expect(form.has('volume')).toBe(false);
  });
});
