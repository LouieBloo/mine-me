import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { MissionResultView } from '@mine-me/shared';
import { MissionSummary } from './MissionSummary';

const result = (over: Partial<MissionResultView> = {}): MissionResultView => ({
  name: 'Copper Run', tier: 2, outcome: 'paid',
  objectives: [
    { type: 'MINE_ITEM', label: 'Collect 10 Copperium', target: 10, progress: 10, done: true, unit: 'count' },
    { type: 'KILL_MOB', label: 'Kill 3 mobs', target: 3, progress: 3, done: true, unit: 'count' },
  ],
  reward: { sol: 120, xp: 80, items: [{ itemId: 'i1', itemName: 'Copperium', quantity: 4 }] },
  contributions: [{ characterId: 'a', characterName: 'Ann', amounts: [10, 3] }],
  ...over,
});

describe('MissionSummary', () => {
  it('shows a paid mission: every objective ticked and the reward received', () => {
    render(<MissionSummary result={result()} />);
    expect(screen.getByText(/Mission Complete/)).toBeInTheDocument();
    expect(screen.getByText('Copper Run')).toBeInTheDocument();
    expect(screen.getByText('✔ Collect 10 Copperium')).toBeInTheDocument();
    expect(screen.getByTestId('mission-reward')).toHaveTextContent('120 Sol, 80 XP, Copperium x4');
    expect(screen.queryByLabelText('Contributions')).not.toBeInTheDocument(); // alone: nothing to compare
  });

  it('shows an unfinished mission: what was missed and why nothing was paid', () => {
    render(<MissionSummary result={result({ outcome: 'unfinished', reward: undefined, reason: 'You left before the mission was complete, so nothing was paid.', objectives: [{ type: 'KILL_MOB', label: 'Kill 3 mobs', target: 3, progress: 1, done: false, unit: 'count' }] })} />);
    expect(screen.getByText(/Mission Unfinished/)).toBeInTheDocument();
    expect(screen.getByText('✘ Kill 3 mobs')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByTestId('mission-no-reward')).toHaveTextContent('nothing was paid');
    expect(screen.queryByTestId('mission-reward')).not.toBeInTheDocument();
  });

  it('shows a failed mission after a death or a timeout', () => {
    render(<MissionSummary result={result({ outcome: 'failed', reward: undefined, reason: 'You were knocked out before you reached the exit.' })} />);
    expect(screen.getByText(/Mission Failed/)).toBeInTheDocument();
    expect(screen.getByTestId('mission-no-reward')).toHaveTextContent('knocked out');
  });

  it('shows who did how much of each objective in a team', () => {
    render(<MissionSummary result={result({ contributions: [{ characterId: 'a', characterName: 'Ann', amounts: [6, 1] }, { characterId: 'b', characterName: 'Bo', amounts: [4, 2] }] })} />);
    const table = screen.getByLabelText('Contributions');
    expect(table).toHaveTextContent('Ann');
    expect(table).toHaveTextContent('Bo');
    expect(table).toHaveTextContent('#2');
  });

  it('shows nothing without a result', () => {
    render(<MissionSummary result={null} />);
    expect(screen.queryByTestId('mission-summary')).not.toBeInTheDocument();
  });
});
