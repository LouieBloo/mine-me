import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ItemSoundEffectUpload from './ItemSoundEffectUpload';
import { DynamiteSoundProfile, WeaponSoundProfile } from '@mine-me/shared';
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

describe('ItemSoundEffectUpload Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-preview');
    window.URL.revokeObjectURL = vi.fn();
  });

  describe('Weapon Sound Profile', () => {
    it('renders single weapon swing slot when soundEffectUrl is missing', () => {
      const onUploadSuccess = vi.fn();
      render(
        <ItemSoundEffectUpload
          itemId="item-1"
          profile={new WeaponSoundProfile()}
          soundEffectUrl={null}
          onUploadSuccess={onUploadSuccess}
        />
      );

      expect(screen.getByRole('heading', { name: /Weapon Sound Effect/i })).toBeInTheDocument();
      expect(screen.getByText(/1\. Weapon Swing \/ Use/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Upload Weapon Swing \/ Use/i })).toBeInTheDocument();
    });

    it('renders audio player and remove button when soundEffectUrl is present', () => {
      const onUploadSuccess = vi.fn();
      render(
        <ItemSoundEffectUpload
          itemId="item-1"
          profile={new WeaponSoundProfile()}
          soundEffectUrl="/assets/sounds/items/item-1_sfx.wav"
          onUploadSuccess={onUploadSuccess}
        />
      );

      expect(screen.getByText(/Active Audio Cue/i)).toBeInTheDocument();
      expect(screen.getByText(/item-1_sfx\.wav/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Replace/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Remove/i })).toBeInTheDocument();
    });
  });

  describe('Dynamite Multi-Slot Sound Profile', () => {
    const dynamiteProfile = new DynamiteSoundProfile();

    it('renders all 3 sound slots: Throw, In-Game Effect (Fuse), and Explosion', () => {
      const onUploadSuccess = vi.fn();
      render(
        <ItemSoundEffectUpload
          itemId="dynamite-1"
          profile={dynamiteProfile}
          soundEffects={null}
          onUploadSuccess={onUploadSuccess}
        />
      );

      expect(screen.getByRole('heading', { name: /Dynamite Sound Effects/i })).toBeInTheDocument();
      expect(screen.getByTestId('sound-slot-throw')).toBeInTheDocument();
      expect(screen.getByTestId('sound-slot-inGameEffect')).toBeInTheDocument();
      expect(screen.getByTestId('sound-slot-explosion')).toBeInTheDocument();

      expect(screen.getByText(/1\. Throw Sound/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. In-Game Effect \(Fuse\)/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. Explosion Sound/i)).toBeInTheDocument();

      // Verify Looping Sound toggle appears specifically on inGameEffect
      expect(screen.getByText(/Looping Sound/i)).toBeInTheDocument();
      expect(screen.getByText(/Loop: ON/i)).toBeInTheDocument();
    });

    it('toggles loop on inGameEffect and calls PATCH endpoint', async () => {
      const onUploadSuccess = vi.fn();
      mockFetchWithAuth.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'dynamite-1',
            soundEffects: { inGameEffect: { url: null, loop: false } },
          }),
      });

      render(
        <ItemSoundEffectUpload
          itemId="dynamite-1"
          profile={dynamiteProfile}
          soundEffects={{
            inGameEffect: { url: null, loop: true },
          }}
          onUploadSuccess={onUploadSuccess}
        />
      );

      const loopCheckbox = screen.getByRole('checkbox', { name: /Looping Sound/i });
      expect(loopCheckbox).toBeChecked();

      fireEvent.click(loopCheckbox);

      await waitFor(() => {
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
          '/api/admin/items/dynamite-1/sound-effects/inGameEffect',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loop: false }),
          }
        );
        expect(mockToastSuccess).toHaveBeenCalledWith(
          expect.stringContaining('In-Game Effect (Fuse) looping set to OFF')
        );
      });
    });

    it('calls upload endpoint with slotKey and FormData', async () => {
      const onUploadSuccess = vi.fn();
      mockFetchWithAuth.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'dynamite-1',
            soundEffects: {
              explosion: { url: '/assets/sounds/items/dynamite-1_explosion_sfx.wav', loop: false },
            },
          }),
      });

      render(
        <ItemSoundEffectUpload
          itemId="dynamite-1"
          profile={dynamiteProfile}
          soundEffects={null}
          onUploadSuccess={onUploadSuccess}
        />
      );

      const file = new File(['fake-sound'], 'boom.wav', { type: 'audio/wav' });
      const explosionSlot = screen.getByTestId('sound-slot-explosion');
      const input = explosionSlot.querySelector('input[type="file"]') as HTMLInputElement;

      fireEvent.change(input, { target: { files: [file] } });

      const uploadBtn = screen.getByRole('button', { name: /Upload Explosion Sound/i });
      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
          '/api/admin/items/dynamite-1/sound-effects/explosion',
          expect.objectContaining({
            method: 'POST',
          })
        );
        expect(mockToastSuccess).toHaveBeenCalledWith('Explosion Sound updated successfully!');
      });
    });

    it('calls delete endpoint when removing a slot sound effect', async () => {
      const onUploadSuccess = vi.fn();
      mockFetchWithAuth.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'dynamite-1',
            soundEffects: {
              throw: { url: null, loop: false },
            },
          }),
      });

      render(
        <ItemSoundEffectUpload
          itemId="dynamite-1"
          profile={dynamiteProfile}
          soundEffects={{
            throw: { url: '/assets/sounds/items/dynamite-1_throw_sfx.wav', loop: false },
          }}
          onUploadSuccess={onUploadSuccess}
        />
      );

      const throwSlot = screen.getByTestId('sound-slot-throw');
      const removeBtn = throwSlot.querySelector('button:last-child')!;
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
          '/api/admin/items/dynamite-1/sound-effects/throw',
          {
            method: 'DELETE',
          }
        );
        expect(mockToastSuccess).toHaveBeenCalledWith('Throw Sound removed successfully!');
      });
    });
  });
});
