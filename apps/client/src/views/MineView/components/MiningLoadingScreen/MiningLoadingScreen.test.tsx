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
});
