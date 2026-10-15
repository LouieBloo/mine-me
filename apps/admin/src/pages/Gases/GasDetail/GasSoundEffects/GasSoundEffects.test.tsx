import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GasSoundEffects from './GasSoundEffects';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const library = [
  { id: 's1', name: 'Boom', url: '/assets/sounds/boom.mp3', type: 'SFX', category: 'GAS', isActive: true },
  { id: 's2', name: 'Growl', url: '/assets/sounds/growl.mp3', type: 'SFX', category: 'MOB', isActive: true },
];
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });

const routes = (saved: unknown = { id: 'g1', soundEffects: { enter: { soundId: 's1' } } }) => (url: string) =>
  url === '/api/admin/sounds' ? json(library) : json(saved);

const renderIt = (gas = { id: 'g1', soundEffects: null as any }, onSaved = vi.fn()) => {
  render(
    <ToastProvider>
      <GasSoundEffects gas={gas} onSaved={onSaved} />
    </ToastProvider>
  );
  return onSaved;
};

describe('GasSoundEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation(routes());
  });

  it('shows the five gas slots and no others', async () => {
    renderIt();
    for (const label of ['Enter', 'Exit', 'Ignite', 'Explode', 'Vent']) {
      expect(await screen.findByLabelText(`${label} sound`)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText('Digging sound')).not.toBeInTheDocument();
  });

  it('shows the saved sound for a slot, with its volume', async () => {
    renderIt({ id: 'g1', soundEffects: { exit: { soundId: 's1', volume: 0.4 } } });
    const preview = await screen.findByTestId('gas-sound-preview-exit');
    expect(preview).toHaveAttribute('src', expect.stringContaining('/assets/sounds/boom.mp3'));
    expect(screen.getByTestId('gas-sound-volume-value-exit')).toHaveTextContent('40%');
    expect(screen.queryByTestId('gas-sound-preview-enter')).not.toBeInTheDocument();
  });

  it('assigns a library sound through the gas\'s sound endpoint, and reports the saved gas', async () => {
    const onSaved = renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Boom' }).length).toBe(5), { timeout: 4000 });
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(routes());
    fireEvent.change(screen.getByLabelText('Enter sound'), { target: { value: 's1' } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(url).toBe('/api/admin/gases/g1/sound-effects/enter');
    expect(JSON.parse(opts.body)).toEqual({ soundId: 's1' });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1', soundEffects: { enter: { soundId: 's1' } } }));
  });

  it('files an uploaded sound under the Gas category, then assigns it', async () => {
    renderIt();
    await screen.findByLabelText('Exit sound');
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) =>
      url === '/api/admin/sounds' && opts?.method === 'POST' ? json({ id: 's9', name: 'whoosh' }) : routes()(url)
    );
    fireEvent.change(screen.getByLabelText('Upload Exit sound'), { target: { files: [new File(['ID3'], 'whoosh.mp3', { type: 'audio/mpeg' })] } });
    await waitFor(() => expect(mockFetchWithAuth.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const upload = mockFetchWithAuth.mock.calls.find((c) => c[0] === '/api/admin/sounds' && c[1]?.method === 'POST')!;
    expect((upload[1].body as FormData).get('category')).toBe('GAS');
    expect(mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')![0]).toBe('/api/admin/gases/g1/sound-effects/exit');
  });

  it('sends only the volume when the volume changes', async () => {
    renderIt({ id: 'g1', soundEffects: { ignite: { soundId: 's1', volume: 0.5 } } });
    await screen.findByTestId('gas-sound-preview-ignite');
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(routes());
    fireEvent.change(screen.getByLabelText('Ignite volume'), { target: { value: '20' } });
    await waitFor(() => expect(mockFetchWithAuth.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const [url, opts] = mockFetchWithAuth.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(url).toBe('/api/admin/gases/g1/sound-effects/ignite');
    expect(JSON.parse(opts.body)).toEqual({ volume: 0.2 });
  });

  it('surfaces a failed save', async () => {
    renderIt();
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Boom' }).length).toBe(5), { timeout: 4000 });
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) =>
      opts?.method === 'PATCH' ? json({ error: 'Sound not found in the library' }, false) : routes()(url)
    );
    fireEvent.change(screen.getByLabelText('Vent sound'), { target: { value: 's1' } });
    await waitFor(() => expect(screen.getByText(/Sound not found in the library/)).toBeInTheDocument());
  });
});
