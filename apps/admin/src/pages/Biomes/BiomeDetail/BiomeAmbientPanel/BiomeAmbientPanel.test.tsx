import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { BiomeAmbient } from '@mine-me/shared';
import BiomeAmbientPanel from './BiomeAmbientPanel';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const renderPanel = (value: BiomeAmbient | null, onChange = vi.fn(), biomeId?: string) => {
  render(
    <ToastProvider>
      <BiomeAmbientPanel value={value} onChange={onChange} biomeId={biomeId} />
    </ToastProvider>
  );
  return onChange;
};

describe('BiomeAmbientPanel', () => {
  beforeEach(() => mockFetchWithAuth.mockReset());
  afterEach(cleanup);

  it('starts with nothing set: no tint, no wall texture', () => {
    renderPanel(null);
    expect((screen.getByLabelText('Wall Tint') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Wall Texture') as HTMLInputElement).value).toBe('');
  });

  it('sets a tint from the picker or by typing it', () => {
    const onChange = renderPanel(null);
    fireEvent.change(screen.getByLabelText('Wall tint picker'), { target: { value: '#99bbff' } });
    expect(onChange).toHaveBeenLastCalledWith({ tint: '#99bbff' });
    fireEvent.change(screen.getByLabelText('Wall Tint'), { target: { value: '#112233' } });
    expect(onChange).toHaveBeenLastCalledWith({ tint: '#112233' });
  });

  it('clears the tint, and reports null once nothing at all is set', () => {
    const onChange = renderPanel({ tint: '#99bbff' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear tint' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('keeps the other settings when one is cleared', () => {
    const onChange = renderPanel({ tint: '#99bbff', wallTextureUrl: '/assets/a.png' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear tint' }));
    expect(onChange).toHaveBeenCalledWith({ wallTextureUrl: '/assets/a.png' });
  });

  it('uploads a wall picture for a saved biome and uses the url the server returns', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ ambient: { wallTextureUrl: '/assets/sprites/biomes/ice-wall.png' } }) });
    const onChange = renderPanel({ tint: '#99bbff' }, vi.fn(), 'b1');
    const file = new File(['x'], 'ice.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload wall texture'), { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ tint: '#99bbff', wallTextureUrl: '/assets/sprites/biomes/ice-wall.png' }));
    expect(mockFetchWithAuth.mock.calls[0][0]).toBe('/api/admin/biomes/b1/wall-texture');
  });

  it('cannot upload before the biome is saved, and refuses a non-image', async () => {
    renderPanel(null);
    expect(screen.getByRole('button', { name: 'Upload Image' })).toBeDisabled();
    cleanup();
    renderPanel(null, vi.fn(), 'b1');
    fireEvent.change(screen.getByLabelText('Upload wall texture'), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it('shows the error when the upload fails and changes nothing', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });
    const onChange = renderPanel(null, vi.fn(), 'b1');
    fireEvent.change(screen.getByLabelText('Upload wall texture'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByText('nope')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sets and blanks the wall texture', () => {
    const onChange = renderPanel({ wallTextureUrl: '/assets/mining/ice.png' });
    expect((screen.getByLabelText('Wall Texture') as HTMLInputElement).value).toBe('/assets/mining/ice.png');
    fireEvent.change(screen.getByLabelText('Wall Texture'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
