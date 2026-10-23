import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExtractorArt from './ExtractorArt';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const renderIt = (extractor: any = { id: 'e1', textureUrl: null, beltTextureUrl: null }, onUploaded = vi.fn()) => {
  render(
    <ToastProvider>
      <ExtractorArt extractor={extractor} onUploaded={onUploaded} />
    </ToastProvider>
  );
  return onUploaded;
};
const png = () => new File(['x'], 'm.png', { type: 'image/png' });

describe('ExtractorArt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ id: 'e1', textureUrl: '/assets/sprites/extractors/e1-body.png', beltTextureUrl: null }) });
  });

  it('shows placeholders until there is art, and the file name once there is', () => {
    renderIt({ id: 'e1', textureUrl: null, beltTextureUrl: '/assets/sprites/extractors/e1-belt.png' });
    expect(screen.getAllByText('Placeholder')).toHaveLength(1);
    expect(screen.getByText('e1-belt.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('uploads the machine picture to the body endpoint and reports the saved extractor', async () => {
    const onUploaded = renderIt();
    fireEvent.change(screen.getByLabelText('Machine picture'), { target: { files: [png()] } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/extractors/e1/texture/body');
    expect(opts.method).toBe('POST');
    expect((opts.body as FormData).get('texture')).toBeInstanceOf(File);
  });

  it('uploads the belt picture to the belt endpoint', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Belt Segment picture'), { target: { files: [png()] } });
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalled());
    expect(mockFetchWithAuth.mock.calls[0][0]).toBe('/api/admin/extractors/e1/texture/belt');
  });

  it('refuses a file that is not a PNG or JPG without sending it, and shows a failed upload', async () => {
    const onUploaded = renderIt();
    fireEvent.change(screen.getByLabelText('Machine picture'), { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
    mockFetchWithAuth.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'disk full' }) });
    fireEvent.change(screen.getByLabelText('Machine picture'), { target: { files: [png()] } });
    expect(await screen.findByText('disk full')).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
