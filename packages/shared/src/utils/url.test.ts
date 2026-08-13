import { describe, it, expect } from 'vitest';
import { getAssetUrl } from './url';

describe('getAssetUrl', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(getAssetUrl(null)).toBe('');
    expect(getAssetUrl(undefined)).toBe('');
    expect(getAssetUrl('')).toBe('');
  });

  it('returns full HTTP/HTTPS URLs as-is', () => {
    expect(getAssetUrl('http://example.com/asset.png')).toBe('http://example.com/asset.png');
    expect(getAssetUrl('https://example.com/asset.png')).toBe('https://example.com/asset.png');
  });

  it('formats relative paths with leading slash', () => {
    expect(getAssetUrl('assets/gear/base-body.png')).toBe('/assets/gear/base-body.png');
    expect(getAssetUrl('/assets/gear/base-body.png')).toBe('/assets/gear/base-body.png');
  });
});
