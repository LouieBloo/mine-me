import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UploadSoundModal } from './UploadSoundModal';
import { ToastProvider } from '../../../contexts/ToastContext';

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: vi.fn() }),
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
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['GENERAL', 'MOB', 'ITEM', 'BLOCK']);
  });
});
