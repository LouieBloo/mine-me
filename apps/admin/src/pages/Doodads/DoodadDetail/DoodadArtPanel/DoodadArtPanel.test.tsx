import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DoodadArtPanel from './DoodadArtPanel';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
vi.mock('./imageSize', () => ({ readImageSize: vi.fn().mockResolvedValue({ width: 40, height: 80 }) }));

const PART = { name: 'cap', file: '/assets/sprites/doodads/cap.png', width: 16, height: 8, pivot_anchor: [8, 8] as [number, number], offset_from_anchor: [0, -20] as [number, number], z_index: 1 };
const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' });

const renderIt = (props: Partial<React.ComponentProps<typeof DoodadArtPanel>> = {}) => {
  const onTextureChange = vi.fn();
  const onPartsChange = vi.fn();
  render(
    <ToastProvider>
      <DoodadArtPanel doodadId="d1" textureUrl={null} parts={[]} onTextureChange={onTextureChange} onPartsChange={onPartsChange} {...props} />
    </ToastProvider>
  );
  return { onTextureChange, onPartsChange };
};

describe('DoodadArtPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a placeholder note until there is a picture', () => {
    renderIt();
    expect(screen.getByText('Placeholder')).toBeInTheDocument();
    renderIt({ textureUrl: '/assets/sprites/doodads/a.png' });
    expect(screen.getByAltText('Doodad picture')).toBeInTheDocument();
  });

  it('uploads the main picture to the doodad\'s texture route and uses the saved url', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ id: 'd1', textureUrl: '/assets/sprites/doodads/new.png' }) });
    const { onTextureChange } = renderIt();
    fireEvent.change(screen.getByLabelText('Upload doodad picture'), { target: { files: [png()] } });
    await waitFor(() => expect(onTextureChange).toHaveBeenCalledWith('/assets/sprites/doodads/new.png'));
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/doodads/d1/texture');
    expect(opts.method).toBe('POST');
    expect((opts.body as FormData).get('texture')).toBeInstanceOf(File);
  });

  it('shows the server\'s reason when an upload fails, and keeps the picture', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({ error: 'Disk full' }) });
    const { onTextureChange } = renderIt({ textureUrl: '/assets/old.png' });
    fireEvent.change(screen.getByLabelText('Upload doodad picture'), { target: { files: [png()] } });
    expect(await screen.findByText('Disk full')).toBeInTheDocument();
    expect(onTextureChange).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a PNG or JPG without calling the server', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Upload doodad picture'), { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(await screen.findByText('Only PNG or JPG images are allowed.')).toBeInTheDocument();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it('cannot upload before the doodad is saved', () => {
    renderIt({ doodadId: undefined });
    expect(screen.getByRole('button', { name: 'Upload Picture' })).toBeDisabled();
    expect(screen.getByText('Save the doodad first, then upload its pictures.')).toBeInTheDocument();
  });

  it('clears the picture', () => {
    const { onTextureChange } = renderIt({ textureUrl: '/assets/a.png' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear picture' }));
    expect(onTextureChange).toHaveBeenCalledWith(null);
  });

  it('adds a part with a free name, and edits its pivot and offset', () => {
    const { onPartsChange } = renderIt({ parts: [PART] });
    fireEvent.click(screen.getByRole('button', { name: '+ Add Part' }));
    expect(onPartsChange).toHaveBeenLastCalledWith([PART, expect.objectContaining({ name: 'part2', z_index: 1 })]);
    fireEvent.change(screen.getByLabelText('Part 1 pivot y'), { target: { value: '4' } });
    expect(onPartsChange).toHaveBeenLastCalledWith([{ ...PART, pivot_anchor: [8, 4] }]);
    fireEvent.change(screen.getByLabelText('Part 1 offset x'), { target: { value: '3' } });
    expect(onPartsChange).toHaveBeenLastCalledWith([{ ...PART, offset_from_anchor: [3, -20] }]);
  });

  it('uploads a part picture under the part\'s name, and fills in its size and pivot from the file', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ url: '/assets/sprites/doodads/cap2.png' }) });
    const { onPartsChange } = renderIt({ parts: [PART] });
    fireEvent.change(screen.getByLabelText('Upload part 1 picture'), { target: { files: [png('cap.png')] } });
    await waitFor(() => expect(onPartsChange).toHaveBeenCalled());
    expect(mockFetchWithAuth.mock.calls[0][0]).toBe('/api/admin/doodads/d1/images/cap');
    expect(onPartsChange).toHaveBeenLastCalledWith([{ ...PART, file: '/assets/sprites/doodads/cap2.png', width: 40, height: 80, pivot_anchor: [20, 80] }]);
  });

  it('will not upload a part picture while the part has no valid name', async () => {
    renderIt({ parts: [{ ...PART, name: 'Bad Name' }] });
    fireEvent.change(screen.getByLabelText('Upload part 1 picture'), { target: { files: [png()] } });
    expect(await screen.findByText(/Name the part with lower case letters/)).toBeInTheDocument();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it('removes a part', () => {
    const { onPartsChange } = renderIt({ parts: [PART] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove part 1' }));
    expect(onPartsChange).toHaveBeenCalledWith([]);
  });
});
