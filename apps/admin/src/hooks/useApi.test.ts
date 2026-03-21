import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useApi } from './useApi';

// Mock useAuth
vi.mock('./useAuth', () => ({
  useAuth: vi.fn(() => ({ token: 'mock-token' }))
}));

// Mock global fetch
globalThis.fetch = vi.fn();

describe('useApi Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchWithAuth appends token to headers and calls fetch', async () => {
    (globalThis.fetch as any).mockResolvedValue({ status: 200, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useApi());
    await result.current.fetchWithAuth('/test-endpoint');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    
    // Check if the URL was constructed properly
    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    const calledOptions = (globalThis.fetch as any).mock.calls[0][1];
    
    expect(calledUrl).toContain('/test-endpoint');
    expect(calledOptions.headers).toHaveProperty('Authorization', 'Bearer mock-token');
    expect(calledOptions.headers).toHaveProperty('Content-Type', 'application/json');
  });
});
