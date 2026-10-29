import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MissionResultView } from '@mine-me/shared';
import { MissionResults } from './MissionResults';

const result = (over: Partial<MissionResultView> = {}): MissionResultView => ({
  name: 'Copper Run', tier: 2, outcome: 'paid',
  objectives: [
    { type: 'MINE_ITEM', label: 'Collect 10 Copperium', target: 10, progress: 10, done: true, unit: 'count' },
    { type: 'KILL_MOB', label: 'Kill 3 mobs', target: 3, progress: 3, done: true, unit: 'count' },
  ],
  reward: { coins: 120, xp: 80, items: [{ itemId: 'i1', itemName: 'Copperium', quantity: 4 }] },
  contributions: [{ characterId: 'a', characterName: 'Ann', amounts: [10, 3] }],
  ...over,
});

describe('MissionResults', () => {
  it('shows a paid mission: every objective ticked and the reward received', () => {
    render(<MissionResults isOpen result={result()} onClose={vi.fn()} />);
    expect(screen.getByText(/Mission Complete/)).toBeInTheDocument();
    expect(screen.getByText('Copper Run')).toBeInTheDocument();
    expect(screen.getByText('✔ Collect 10 Copperium')).toBeInTheDocument();
    expect(screen.getByTestId('mission-reward')).toHaveTextContent('120 coins, 80 XP');
    expect(screen.getByTestId('mission-reward')).toHaveTextContent('Copperium x4');
    expect(screen.queryByLabelText('Contributions')).not.toBeInTheDocument(); // alone: nothing to compare
  });

  it('shows an unfinished mission: what was missed and why nothing was paid', () => {
    render(<MissionResults isOpen result={result({ outcome: 'unfinished', reward: undefined, reason: 'You left before the mission was complete, so nothing was paid.', objectives: [{ type: 'KILL_MOB', label: 'Kill 3 mobs', target: 3, progress: 1, done: false, unit: 'count' }] })} onClose={vi.fn()} />);
    expect(screen.getByText(/Mission Unfinished/)).toBeInTheDocument();
    expect(screen.getByText('✘ Kill 3 mobs')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByTestId('mission-no-reward')).toHaveTextContent('nothing was paid');
    expect(screen.queryByTestId('mission-reward')).not.toBeInTheDocument();
  });

  it('shows a failed mission after a death or a timeout', () => {
    render(<MissionResults isOpen result={result({ outcome: 'failed', reward: undefined, reason: 'You were knocked out before you reached the exit.' })} onClose={vi.fn()} />);
    expect(screen.getByText(/Mission Failed/)).toBeInTheDocument();
    expect(screen.getByTestId('mission-no-reward')).toHaveTextContent('knocked out');
  });

  it('shows who did how much of each objective in a team', () => {
    render(<MissionResults isOpen result={result({ contributions: [{ characterId: 'a', characterName: 'Ann', amounts: [6, 1] }, { characterId: 'b', characterName: 'Bo', amounts: [4, 2] }] })} onClose={vi.fn()} />);
    const table = screen.getByLabelText('Contributions');
    expect(table).toHaveTextContent('Ann');
    expect(table).toHaveTextContent('Bo');
    expect(table).toHaveTextContent('#2');
  });

  it('closes with Continue, and shows nothing without a result', () => {
    const onClose = vi.fn();
    const { rerender } = render(<MissionResults isOpen result={result()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onClose).toHaveBeenCalled();
    rerender(<MissionResults isOpen result={null} onClose={onClose} />);
    expect(screen.queryByTestId('mission-results')).not.toBeInTheDocument();
  });
});
