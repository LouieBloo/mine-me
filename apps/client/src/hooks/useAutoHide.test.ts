import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoHide } from './useAutoHide';

describe('useAutoHide', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is hidden until poked', () => {
    const { result } = renderHook(() => useAutoHide(5000));
    expect(result.current.visible).toBe(false);
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.visible).toBe(false);
  });

  it('shows on poke and hides after the duration', () => {
    const { result } = renderHook(() => useAutoHide(5000));
    act(() => result.current.poke());
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(4999));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(false);
  });

  it('restarts the countdown on every poke', () => {
    const { result } = renderHook(() => useAutoHide(5000));
    act(() => result.current.poke());
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.poke());
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.visible).toBe(false);
  });

  it('stays visible while held and starts a fresh countdown on release', () => {
    const { result } = renderHook(() => useAutoHide(5000));
    act(() => result.current.poke());
    act(() => result.current.hold('hover'));
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.visible).toBe(true);
    act(() => result.current.release('hover'));
    act(() => vi.advanceTimersByTime(4999));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(false);
  });

  it('waits for every hold to be released', () => {
    const { result } = renderHook(() => useAutoHide(5000));
    act(() => result.current.poke());
    act(() => {
      result.current.hold('hover');
      result.current.hold('drag');
    });
    act(() => result.current.release('hover'));
    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.visible).toBe(true);
    act(() => result.current.release('drag'));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(false);
  });

  it('a poke while held does not start the countdown', () => {
    const { result } = renderHook(() => useAutoHide(5000));
    act(() => result.current.hold('hover'));
    act(() => result.current.poke());
    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.visible).toBe(true);
  });

  it('clears its timer on unmount', () => {
    const { result, unmount } = renderHook(() => useAutoHide(5000));
    act(() => result.current.poke());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
