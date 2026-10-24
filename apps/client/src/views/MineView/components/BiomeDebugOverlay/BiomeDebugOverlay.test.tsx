import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BiomeDebugOverlay } from './BiomeDebugOverlay';
import { biomeDebug } from '../MiningGrid/utils/biomeDebug';

describe('BiomeDebugOverlay', () => {
  afterEach(() => {
    cleanup();
    biomeDebug.setEnabled(false);
    biomeDebug.publish(null);
    vi.useRealTimers();
  });

  it('is hidden until F4 is pressed, then toggles with F4', () => {
    render(<BiomeDebugOverlay />);
    expect(screen.queryByRole('status', { name: 'Biome debug' })).toBeNull();
    fireEvent.keyDown(window, { key: 'F4' });
    expect(screen.getByRole('status', { name: 'Biome debug' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'F4' });
    expect(screen.queryByRole('status', { name: 'Biome debug' })).toBeNull();
  });

  it('ignores other keys', () => {
    render(<BiomeDebugOverlay />);
    fireEvent.keyDown(window, { key: 'F3' });
    expect(screen.queryByRole('status', { name: 'Biome debug' })).toBeNull();
  });

  it('says so when the mine has one biome', () => {
    biomeDebug.setEnabled(true);
    render(<BiomeDebugOverlay />);
    expect(screen.getByText('This mine has one biome.')).toBeInTheDocument();
  });

  it('shows the blend and the biome under the cursor', () => {
    vi.useFakeTimers();
    biomeDebug.setEnabled(true);
    biomeDebug.publish({ names: ['Default', 'Frozen'], shares: [0.25, 0.75], cursor: { x: 3, y: 4, biome: 'Frozen' } });
    render(<BiomeDebugOverlay />);
    expect(screen.getAllByTestId('biome-share').map((el) => el.textContent)).toEqual(['Default25%', 'Frozen75%']);
    expect(screen.getByTestId('biome-cursor')).toHaveTextContent('Frozen');
    // Later numbers arrive on the refresh
    biomeDebug.publish({ names: ['Default', 'Frozen'], shares: [1, 0], cursor: { x: 3, y: 4, biome: null } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getAllByTestId('biome-share')[0]).toHaveTextContent('100%');
    expect(screen.getByTestId('biome-cursor')).toHaveTextContent('unknown (hidden)');
  });
});
