import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SurfaceSoundEffects from './SurfaceSoundEffects';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const library = [{ id: 's1', name: 'Rain loop', url: '/assets/sounds/rain.mp3', type: 'SFX', category: 'GENERAL', isActive: true }];
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });
const routes = (saved: unknown = { id: 'e1', soundEffects: { rain: { soundId: 's1' } } }) => (url: string) => (url === '/api/admin/sounds' ? json(library) : json(saved));

const renderIt = (environment = { id: 'e1', soundEffects: null as any }, onSaved = vi.fn()) => {
  render(
    <ToastProvider>
      <SurfaceSoundEffects environment={environment} onSaved={onSaved} />
    </ToastProvider>
  );
  return onSaved;
};

describe('SurfaceSoundEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation(routes());
  });

  it('shows the rain, wind and thunder slots and no others', async () => {
    renderIt();
    for (const label of ['Rain', 'Wind', 'Thunder']) expect(await screen.findByLabelText(`${label} sound`)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ambient sound')).not.toBeInTheDocument();
  });

  it('shows the saved sound for a slot, with its own volume', async () => {
    renderIt({ id: 'e1', soundEffects: { rain: { soundId: 's1', volume: 0.4 } } });
    expect(await screen.findByTestId('surface-sound-preview-rain')).toHaveAttribute('src', expect.stringContaining('/assets/sounds/rain.mp3'));
    expect(screen.getByTestId('surface-sound-volume-value-rain')).toHaveTextContent('40%');
  });

  it('assigns a library sound through the environment\'s sound endpoint and reports the saved environment', async () => {
    const onSaved = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Rain loop' }).length).toBe(3), { timeout: 4000 });
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(routes());
    fireEvent.change(screen.getByLabelText('Rain sound'), { target: { value: 's1' } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(url).toBe('/api/admin/surface-environments/e1/sound-effects/rain');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
  });
});
