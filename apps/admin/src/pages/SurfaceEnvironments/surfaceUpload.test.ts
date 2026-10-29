import { describe, it, expect, vi } from 'vitest';
import { pictureName, surfaceFileProblem, uploadSurfaceImage } from './surfaceUpload';

const png = (over: Partial<File> = {}) => new File(['x'], 'a.png', { type: 'image/png', ...over });

describe('surfaceFileProblem', () => {
  it('accepts a PNG or a JPG and refuses anything else, or a file over 10 MB', () => {
    expect(surfaceFileProblem({ type: 'image/png', size: 100 })).toBeNull();
    expect(surfaceFileProblem({ type: 'image/jpeg', size: 100 })).toBeNull();
    expect(surfaceFileProblem({ type: 'image/gif', size: 100 })).toMatch(/PNG or JPG/);
    expect(surfaceFileProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });
});

describe('pictureName', () => {
  it('makes a name the server accepts', () => {
    expect(pictureName('Far Mountains')).toBe('far_mountains');
    expect(pictureName('  cloud-1!  ')).toBe('cloud_1');
    expect(pictureName('')).toBe('picture');
    expect(pictureName('___')).toBe('picture');
  });
});

describe('uploadSurfaceImage', () => {
  it('posts the file under the picture name and returns the url', async () => {
    const fetchWithAuth = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: '/assets/sprites/surface/e1-far.png?v=5' }) });
    const url = await uploadSurfaceImage(fetchWithAuth, 'e1', 'Far', png());
    expect(url).toBe('/assets/sprites/surface/e1-far.png?v=5');
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/admin/surface-environments/e1/images/far', expect.objectContaining({ method: 'POST' }));
    expect((fetchWithAuth.mock.calls[0][1].body as FormData).get('texture')).toBeInstanceOf(File);
  });

  it('refuses a bad file before sending anything', async () => {
    const fetchWithAuth = vi.fn();
    await expect(uploadSurfaceImage(fetchWithAuth, 'e1', 'far', new File(['x'], 'a.txt', { type: 'text/plain' }))).rejects.toThrow(/PNG or JPG/);
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('reports the server\'s reason when the upload fails', async () => {
    const fetchWithAuth = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'Surface environment not found' }) });
    await expect(uploadSurfaceImage(fetchWithAuth, 'e1', 'far', png())).rejects.toThrow('Surface environment not found');
    const noBody = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('no body')) });
    await expect(uploadSurfaceImage(noBody, 'e1', 'far', png())).rejects.toThrow('Failed to upload the picture');
  });
});
