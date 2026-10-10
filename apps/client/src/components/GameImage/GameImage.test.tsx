import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { getAssetUrl } from '@mine-me/shared';
import { GameImage, GAME_IMAGE_MAX_RETRIES, withRetryParam } from './GameImage';

describe('withRetryParam', () => {
  it('leaves the first attempt untouched and cache-busts retries', () => {
    expect(withRetryParam('/assets/a.png', 0)).toBe('/assets/a.png');
    expect(withRetryParam('/assets/a.png', 2)).toBe('/assets/a.png?retry=2');
    expect(withRetryParam('/assets/a.png?v=1', 1)).toBe('/assets/a.png?v=1&retry=1');
  });
});

describe('GameImage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the fallback when there is no src', () => {
    render(<GameImage src={null} alt="x" fallback={<span>fallback</span>} />);
    expect(screen.getByText('fallback')).toBeTruthy();
  });

  it('retries a failed load with a cache-busting url', () => {
    render(<GameImage src="/assets/a.png" alt="icon" />);
    expect(screen.getByAltText('icon').getAttribute('src')).toBe(getAssetUrl('/assets/a.png'));

    fireEvent.error(screen.getByAltText('icon'));
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByAltText('icon').getAttribute('src')).toBe(`${getAssetUrl('/assets/a.png')}?retry=1`);
  });

  it('gives up and shows the fallback after the max retries', () => {
    render(<GameImage src="/assets/a.png" alt="icon" fallback={<span>fallback</span>} />);
    for (let i = 0; i <= GAME_IMAGE_MAX_RETRIES; i++) {
      fireEvent.error(screen.getByAltText('icon'));
      act(() => { vi.advanceTimersByTime(5000); });
    }
    expect(screen.queryByAltText('icon')).toBeNull();
    expect(screen.getByText('fallback')).toBeTruthy();
  });

  it('starts over when the src changes', () => {
    const { rerender } = render(<GameImage src="/assets/a.png" alt="icon" />);
    fireEvent.error(screen.getByAltText('icon'));
    act(() => { vi.advanceTimersByTime(600); });
    rerender(<GameImage src="/assets/b.png" alt="icon" />);
    expect(screen.getByAltText('icon').getAttribute('src')).toBe(getAssetUrl('/assets/b.png'));
  });
});
