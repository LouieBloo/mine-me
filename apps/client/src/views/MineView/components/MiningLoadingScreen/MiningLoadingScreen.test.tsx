import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { MiningLoadingScreen } from './MiningLoadingScreen';

describe('MiningLoadingScreen', () => {
  it('renders loading message and tips when isLoading is true', () => {
    render(
      <MiningLoadingScreen
        isLoading={true}
        message="Entering Dungeon Mine..."
        subMessage="Preparing equipment..."
      />
    );

    expect(screen.getByTestId('mining-loading-screen')).toBeInTheDocument();
    expect(screen.getByText('Entering Dungeon Mine...')).toBeInTheDocument();
    expect(screen.getByText('Preparing equipment...')).toBeInTheDocument();
    expect(screen.getByText(/WASD/)).toBeInTheDocument();
  });

  it('adds fade-out class and unmounts after delay when isLoading becomes false', () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <MiningLoadingScreen
        isLoading={true}
        message="Loading..."
      />
    );

    expect(screen.getByTestId('mining-loading-screen')).not.toHaveClass('fade-out');

    rerender(
      <MiningLoadingScreen
        isLoading={false}
        message="Loading..."
      />
    );

    expect(screen.getByTestId('mining-loading-screen')).toHaveClass('fade-out');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByTestId('mining-loading-screen')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  describe('progress bar', () => {
    it('is hidden when no progress is given', () => {
      render(<MiningLoadingScreen isLoading={true} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('shows the percentage, as a bar width and for screen readers', () => {
      render(<MiningLoadingScreen isLoading={true} progress={0.426} />);
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '43');
      expect(screen.getByTestId('mining-loading-bar')).toHaveStyle({ width: '43%' });
      expect(screen.getByText('43%')).toBeInTheDocument();
    });

    it('clamps out-of-range progress to 0..100%', () => {
      const { rerender } = render(<MiningLoadingScreen isLoading={true} progress={-2} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
      rerender(<MiningLoadingScreen isLoading={true} progress={7} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    });
  });
});
