import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ZoomControl } from './ZoomControl';

describe('ZoomControl', () => {
  it('renders current zoom percentage and presets', () => {
    const handleZoomChange = vi.fn();
    render(<ZoomControl zoom={1.0} onZoomChange={handleZoomChange} />);

    expect(screen.getByTestId('zoom-control')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('1x')).toBeInTheDocument();
    expect(screen.getByText('1.5x')).toBeInTheDocument();
    expect(screen.getByText('2x')).toBeInTheDocument();
  });

  it('calls onZoomChange when preset buttons are clicked', () => {
    const handleZoomChange = vi.fn();
    render(<ZoomControl zoom={1.0} onZoomChange={handleZoomChange} />);

    fireEvent.click(screen.getByText('1.5x'));
    expect(handleZoomChange).toHaveBeenCalledWith(1.5);

    fireEvent.click(screen.getByText('2x'));
    expect(handleZoomChange).toHaveBeenCalledWith(2.0);
  });

  it('steps zoom up and down with +/- buttons', () => {
    const handleZoomChange = vi.fn();
    render(<ZoomControl zoom={1.5} onZoomChange={handleZoomChange} step={0.1} />);

    fireEvent.click(screen.getByTestId('zoom-in-button'));
    expect(handleZoomChange).toHaveBeenCalledWith(1.6);

    fireEvent.click(screen.getByTestId('zoom-out-button'));
    expect(handleZoomChange).toHaveBeenCalledWith(1.4);
  });

  it('updates zoom when slider value changes', () => {
    const handleZoomChange = vi.fn();
    render(<ZoomControl zoom={1.0} onZoomChange={handleZoomChange} />);

    const slider = screen.getByTestId('zoom-slider-input');
    fireEvent.change(slider, { target: { value: '1.75' } });

    expect(handleZoomChange).toHaveBeenCalledWith(1.75);
  });

  describe('show on zoom, fade after a few seconds', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const panel = () => screen.getByTestId('zoom-control');
    const isShown = () => panel().getAttribute('data-visible') === 'true';

    it('is hidden and not clickable on mount', () => {
      render(<ZoomControl zoom={1.5} onZoomChange={vi.fn()} />);
      expect(isShown()).toBe(false);
      expect(panel().className).toContain('opacity-0');
      expect(panel().className).toContain('pointer-events-none');
      expect(panel().getAttribute('aria-hidden')).toBe('true');
    });

    it('appears when the zoom changes and hides after 5 seconds', () => {
      const { rerender } = render(<ZoomControl zoom={1.5} onZoomChange={vi.fn()} />);
      rerender(<ZoomControl zoom={1.55} onZoomChange={vi.fn()} />);
      expect(isShown()).toBe(true);
      expect(panel().className).toContain('pointer-events-auto');

      act(() => vi.advanceTimersByTime(4999));
      expect(isShown()).toBe(true);
      act(() => vi.advanceTimersByTime(1));
      expect(isShown()).toBe(false);
    });

    it('restarts the 5 second timer on each zoom change', () => {
      const { rerender } = render(<ZoomControl zoom={1.5} onZoomChange={vi.fn()} />);
      rerender(<ZoomControl zoom={1.55} onZoomChange={vi.fn()} />);
      act(() => vi.advanceTimersByTime(4000));
      rerender(<ZoomControl zoom={1.6} onZoomChange={vi.fn()} />);
      act(() => vi.advanceTimersByTime(4000));
      expect(isShown()).toBe(true);
      act(() => vi.advanceTimersByTime(1000));
      expect(isShown()).toBe(false);
    });

    it('stays open while hovered and hides 5 seconds after the pointer leaves', () => {
      const { rerender } = render(<ZoomControl zoom={1.5} onZoomChange={vi.fn()} />);
      rerender(<ZoomControl zoom={1.55} onZoomChange={vi.fn()} />);
      fireEvent.pointerEnter(panel());
      act(() => vi.advanceTimersByTime(30000));
      expect(isShown()).toBe(true);
      fireEvent.pointerLeave(panel());
      act(() => vi.advanceTimersByTime(4999));
      expect(isShown()).toBe(true);
      act(() => vi.advanceTimersByTime(1));
      expect(isShown()).toBe(false);
    });

    it('stays open while the slider is dragged, even if the pointer leaves the panel', () => {
      const { rerender } = render(<ZoomControl zoom={1.5} onZoomChange={vi.fn()} />);
      rerender(<ZoomControl zoom={1.55} onZoomChange={vi.fn()} />);
      fireEvent.pointerDown(screen.getByTestId('zoom-slider-input'));
      fireEvent.pointerLeave(panel());
      act(() => vi.advanceTimersByTime(30000));
      expect(isShown()).toBe(true);
      act(() => {
        window.dispatchEvent(new Event('pointerup'));
      });
      act(() => vi.advanceTimersByTime(5000));
      expect(isShown()).toBe(false);
    });

    it('honours a custom hideAfterMs', () => {
      const { rerender } = render(<ZoomControl zoom={1.5} onZoomChange={vi.fn()} hideAfterMs={1000} />);
      rerender(<ZoomControl zoom={1.55} onZoomChange={vi.fn()} hideAfterMs={1000} />);
      act(() => vi.advanceTimersByTime(1000));
      expect(isShown()).toBe(false);
    });
  });
});
