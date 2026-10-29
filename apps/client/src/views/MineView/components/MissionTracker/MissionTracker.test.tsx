import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { MissionClientState } from '@mine-me/shared';
import { MissionTracker } from './MissionTracker';

const mission = (over: Partial<MissionClientState> = {}): MissionClientState => ({
  id: 'm1', name: 'Deep Silver', tier: 3, completed: false, reward: { sol: 1, xp: 1, items: [] },
  objectives: [
    { type: 'MINE_ITEM', label: 'Collect 15 Silverium', target: 15, progress: 6, done: false, unit: 'count' },
    { type: 'CLEAR_GAS', label: 'Clear 50% of the Hydrogen', target: 50, progress: 22.4, done: false, unit: 'percent' },
    { type: 'REACH_DEPTH', label: 'Reach depth 90', target: 90, progress: 90, done: true, unit: 'depth' },
  ], ...over,
});

describe('MissionTracker', () => {
  it('shows the mission, each objective with its progress in its own unit, and how many are done', () => {
    render(<MissionTracker mission={mission()} />);
    expect(screen.getByText('Mission · Tier 3')).toBeInTheDocument();
    expect(screen.getByText('Deep Silver')).toBeInTheDocument();
    expect(screen.getByText('1/3', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('6 / 15')).toBeInTheDocument(); // a count
    expect(screen.getByText('22%')).toBeInTheDocument(); // a percent
    expect(screen.getByText('90 / 90')).toBeInTheDocument(); // a depth
  });

  it('draws a bar for each objective at its share, full and green when done', () => {
    render(<MissionTracker mission={mission()} />);
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(3);
    expect(bars[0]).toHaveAttribute('aria-valuenow', '40');
    expect(bars[2]).toHaveAttribute('aria-valuenow', '100');
    expect(bars[2].className).toMatch(/emerald/);
    expect(bars[0].className).toMatch(/amber/);
    expect(within(screen.getByTestId('mission-objective-2')).getByText(/✔/)).toBeInTheDocument();
  });

  it('can be folded away to its summary and opened again', () => {
    render(<MissionTracker mission={mission()} />);
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(screen.queryByText('Collect 15 Silverium')).not.toBeInTheDocument();
    expect(screen.getByText('Deep Silver')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Collect 15 Silverium')).toBeInTheDocument();
  });

  it('says to leave the mine safely once the whole mission is done', () => {
    const { rerender } = render(<MissionTracker mission={mission()} />);
    expect(screen.queryByText(/claim the reward/)).not.toBeInTheDocument();
    rerender(<MissionTracker mission={mission({ completed: true })} />);
    expect(screen.getByText('Mission Complete')).toBeInTheDocument();
    expect(screen.getByText(/Leave the mine safely to claim the reward/)).toBeInTheDocument();
  });
});
