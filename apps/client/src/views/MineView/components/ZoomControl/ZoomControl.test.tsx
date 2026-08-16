import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
