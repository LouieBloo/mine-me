/**
 * Resolves an asset path to a full URL using VITE_API_URL if configured,
 * or relative path (which works via Vite proxy in dev and origin host in prod).
 */
export function getAssetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // Safely extract VITE_API_URL from import.meta.env or process.env
  let baseUrl = '';
  try {
    const globalObj = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;
    baseUrl = globalObj.VITE_API_URL || globalObj.process?.env?.VITE_API_URL || '';
  } catch {
    baseUrl = '';
  }

  // Remove trailing slash from baseUrl if present
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;
}
