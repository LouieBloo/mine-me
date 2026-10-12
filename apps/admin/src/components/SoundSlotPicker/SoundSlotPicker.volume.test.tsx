import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SoundSlotPicker, { VOLUME_SAVE_DELAY_MS, type SoundSlotAction } from './SoundSlotPicker';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

const library = [{ id: 's1', name: 'Ouch', url: '/assets/sounds/ouch.mp3', type: 'SFX', category: 'MOB', isActive: true }];
const SLOTS = [{ slotKey: 'attack', label: 'Attack', description: 'd', icon: 'x' }];
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });

const setup = (selection: any, buildRequest = vi.fn(async (_a: SoundSlotAction) => ({ ok: true, json: async () => ({ saved: true }) }) as any)) => {
  const onChange = vi.fn();
  const { unmount } = render(
    <ToastProvider>
      <SoundSlotPicker
        slots={SLOTS}
        selections={{ attack: selection }}
        buildRequest={buildRequest}
        onChange={onChange}
        entityLabel="mob"
        uploadCategory="MOB"
        testIdPrefix="t"
      />
    </ToastProvider>
  );
  return { buildRequest, onChange, unmount };
};

const flushLibrary = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('SoundSlotPicker volume', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchWithAuth.mockReset();
    mockFetchWithAuth.mockImplementation(() => json(library));
  });
  afterEach(() => vi.useRealTimers());

  it('shows the saved volume as a percentage, full when none is set', async () => {
    setup({ soundId: 's1', volume: 0.35 });
    await flushLibrary();
    expect((screen.getByLabelText('Attack volume') as HTMLInputElement).value).toBe('35');
    expect(screen.getByTestId('t-volume-value-attack')).toHaveTextContent('35%');
  });

  it('defaults to 100%', async () => {
    setup({ soundId: 's1' });
    await flushLibrary();
    expect(screen.getByTestId('t-volume-value-attack')).toHaveTextContent('100%');
  });

  it('is disabled until a sound is chosen', async () => {
    setup(undefined);
    await flushLibrary();
    expect(screen.getByLabelText('Attack volume')).toBeDisabled();
  });

  it('saves the volume once, a moment after the last move, as a 0-1 value', async () => {
    const { buildRequest, onChange } = setup({ soundId: 's1' });
    await flushLibrary();
    const slider = screen.getByLabelText('Attack volume');

    fireEvent.change(slider, { target: { value: '60' } });
    fireEvent.change(slider, { target: { value: '45' } });
    expect(screen.getByTestId('t-volume-value-attack')).toHaveTextContent('45%'); // follows the drag at once
    expect(buildRequest).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOLUME_SAVE_DELAY_MS);
    });
    expect(buildRequest).toHaveBeenCalledTimes(1);
    expect(buildRequest).toHaveBeenCalledWith({ kind: 'volume', slotKey: 'attack', volume: 0.45 });
    expect(onChange).toHaveBeenCalledWith({ saved: true });
  });

  it('plays the preview at the slot volume', async () => {
    setup({ soundId: 's1', volume: 0.4 });
    await flushLibrary();
    expect((screen.getByTestId('t-preview-attack') as HTMLAudioElement).volume).toBeCloseTo(0.4);

    fireEvent.change(screen.getByLabelText('Attack volume'), { target: { value: '10' } });
    expect((screen.getByTestId('t-preview-attack') as HTMLAudioElement).volume).toBeCloseTo(0.1);
  });

  it('goes back to the stored volume and tells the admin when the save fails', async () => {
    const buildRequest = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'volume must be a number from 0 to 1' }) }) as any);
    setup({ soundId: 's1', volume: 0.8 }, buildRequest);
    await flushLibrary();

    fireEvent.change(screen.getByLabelText('Attack volume'), { target: { value: '20' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOLUME_SAVE_DELAY_MS);
    });
    expect(screen.getByText(/volume must be a number from 0 to 1/)).toBeInTheDocument();
    expect(screen.getByTestId('t-volume-value-attack')).toHaveTextContent('80%');
  });

  it('does not save a pending change after the picker is gone', async () => {
    const { buildRequest, unmount } = setup({ soundId: 's1' });
    await flushLibrary();
    fireEvent.change(screen.getByLabelText('Attack volume'), { target: { value: '30' } });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOLUME_SAVE_DELAY_MS * 2);
    });
    expect(buildRequest).not.toHaveBeenCalled();
  });
});
