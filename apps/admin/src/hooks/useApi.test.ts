import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useApi } from './useApi';

// Mock useAuth
vi.mock('./useAuth', () => ({
  useAuth: vi.fn(() => ({ 
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MjUzNDA2NTAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    logout: vi.fn()
  }))
}));

// Mock window.location
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true
});

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
    expect(calledOptions.headers).toHaveProperty('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MjUzNDA2NTAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(calledOptions.headers).toHaveProperty('Content-Type', 'application/json');
  });
});
