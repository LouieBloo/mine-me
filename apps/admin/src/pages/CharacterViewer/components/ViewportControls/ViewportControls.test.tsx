import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewportControls } from './ViewportControls';

describe('ViewportControls', () => {
  const defaultProps = {
    animState: 'idle' as const,
    setAnimState: vi.fn(),
    speedMultiplier: 1.0,
    setSpeedMultiplier: vi.fn(),
    isPlaying: true,
    setIsPlaying: vi.fn(),
    isFlipped: false,
    setIsFlipped: vi.fn(),
    scale: 1.0,
    setScale: vi.fn(),
    rootOffsetY: 0,
    setRootOffsetY: vi.fn(),
    showJoints: true,
    setShowJoints: vi.fn(),
    showBones: true,
    setShowBones: vi.fn(),
    showBbox: false,
    setShowBbox: vi.fn(),
  };

  it('renders animation buttons and triggers state change', () => {
    render(<ViewportControls {...defaultProps} />);
    const walkButton = screen.getByText('walk');
    fireEvent.click(walkButton);
    expect(defaultProps.setAnimState).toHaveBeenCalledWith('walk');
  });

  it('toggles pause / play when play button is clicked', () => {
    render(<ViewportControls {...defaultProps} />);
    const pauseButton = screen.getByText('⏸ Pause');
    fireEvent.click(pauseButton);
    expect(defaultProps.setIsPlaying).toHaveBeenCalledWith(false);
  });

  it('toggles flip direction when flip button is clicked', () => {
    render(<ViewportControls {...defaultProps} />);
    const flipButton = screen.getByText(/Flip:/i);
    fireEvent.click(flipButton);
    expect(defaultProps.setIsFlipped).toHaveBeenCalledWith(true);
  });
});
