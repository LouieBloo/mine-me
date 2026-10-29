type FetchWithAuth = (url: string, init?: RequestInit) => Promise<Response>;

const MAX_BYTES = 10 * 1024 * 1024;

/** Why a picked file cannot be used as a surface picture, or null. */
export function surfaceFileProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') return 'Only PNG or JPG images are allowed.';
  if (file.size > MAX_BYTES) return 'Pictures can be at most 10 MB.';
  return null;
}

/** A picture name the server accepts: lower case letters, digits and underscores. */
export const pictureName = (text: string): string => text.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'picture';

/**
 * Uploads a picture for a saved environment and returns the url to put on a layer or in the cloud list. The server keeps the
 * file name, so the url carries a version that changes on every upload (the new picture shows at once).
 */
export async function uploadSurfaceImage(fetchWithAuth: FetchWithAuth, environmentId: string, name: string, file: File): Promise<string> {
  const problem = surfaceFileProblem(file);
  if (problem) throw new Error(problem);
  const form = new FormData();
  form.append('texture', file);
  const res = await fetchWithAuth(`/api/admin/surface-environments/${environmentId}/images/${pictureName(name)}`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload the picture');
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}
