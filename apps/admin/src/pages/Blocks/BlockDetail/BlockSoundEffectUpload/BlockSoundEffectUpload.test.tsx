import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BlockSoundEffectUpload from './BlockSoundEffectUpload';
import '@testing-library/jest-dom';

const mockFetchWithAuth = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('../../../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: mockFetchWithAuth,
  }),
}));

vi.mock('../../../../contexts/ToastContext', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

describe('BlockSoundEffectUpload Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-preview');
    window.URL.revokeObjectURL = vi.fn();
  });

  it('renders upload area when soundEffectUrl is missing', () => {
    const onUploadSuccess = vi.fn();
    render(
      <BlockSoundEffectUpload
        blockId="block_dirt"
        blockName="Dirt Block"
        soundEffectUrl={null}
        onUploadSuccess={onUploadSuccess}
      />
    );

    expect(screen.getByRole('heading', { name: /Damage Sound Effect/i })).toBeInTheDocument();
    expect(screen.getByText(/Select Block Damage Audio File/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload Block Damage Sound Effect/i })).toBeInTheDocument();
  });

  it('renders audio player and remove button when soundEffectUrl is present', () => {
    const onUploadSuccess = vi.fn();
    render(
      <BlockSoundEffectUpload
        blockId="block_dirt"
        blockName="Dirt Block"
        soundEffectUrl="/assets/sounds/blocks/dirt_sfx.wav"
        onUploadSuccess={onUploadSuccess}
      />
    );

    expect(screen.getByText(/Active Sound Effect/i)).toBeInTheDocument();
    expect(screen.getByText(/dirt_sfx\.wav/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Replace/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove/i })).toBeInTheDocument();
  });

  it('calls delete endpoint and notifies success when Remove is clicked', async () => {
    const onUploadSuccess = vi.fn();
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'block_dirt', soundEffectUrl: null }),
    });

    render(
      <BlockSoundEffectUpload
        blockId="block_dirt"
        blockName="Dirt Block"
        soundEffectUrl="/assets/sounds/blocks/dirt_sfx.wav"
        onUploadSuccess={onUploadSuccess}
      />
    );

    const removeBtn = screen.getByRole('button', { name: /Remove/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/admin/blocks/block_dirt/sound-effect', {
        method: 'DELETE',
      });
      expect(onUploadSuccess).toHaveBeenCalledWith({ id: 'block_dirt', soundEffectUrl: null });
      expect(mockToastSuccess).toHaveBeenCalledWith('Block sound effect removed successfully!');
    });
  });

  it('switches to upload view when Replace is clicked and cancels back', () => {
    const onUploadSuccess = vi.fn();
    render(
      <BlockSoundEffectUpload
        blockId="block_dirt"
        blockName="Dirt Block"
        soundEffectUrl="/assets/sounds/blocks/dirt_sfx.wav"
        onUploadSuccess={onUploadSuccess}
      />
    );

    const replaceBtn = screen.getByRole('button', { name: /Replace/i });
    fireEvent.click(replaceBtn);

    expect(screen.getByText(/Select Block Damage Audio File/i)).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.getByText(/Active Sound Effect/i)).toBeInTheDocument();
  });

  it('uploads a file successfully', async () => {
    const onUploadSuccess = vi.fn();
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'block_dirt', soundEffectUrl: '/assets/sounds/blocks/block_dirt_sfx.wav' }),
    });

    const { container } = render(
      <BlockSoundEffectUpload
        blockId="block_dirt"
        blockName="Dirt Block"
        soundEffectUrl={null}
        onUploadSuccess={onUploadSuccess}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(['audio-content'], 'dirt_sfx.wav', { type: 'audio/wav' });

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(screen.getAllByText(/dirt_sfx\.wav/i).length).toBeGreaterThanOrEqual(1);

    const uploadBtn = screen.getByRole('button', { name: /Upload Block Damage Sound Effect/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/admin/blocks/block_dirt/sound-effect',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockToastSuccess).toHaveBeenCalledWith('Block damage sound effect updated successfully!');
      expect(onUploadSuccess).toHaveBeenCalled();
    });
  });
});
