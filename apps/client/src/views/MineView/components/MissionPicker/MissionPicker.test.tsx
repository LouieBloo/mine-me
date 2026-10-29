import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MissionPicker, rewardText } from './MissionPicker';

const offers = [
  { id: 'm1', name: 'Copper Run', description: 'Dig.', tier: 1, objectives: [{ type: 'MINE_ITEM' as const, label: 'Collect 10 Copperium', target: 10, unit: 'count' as const }], reward: { coins: 30, xp: 20, items: [] } },
  { id: 'm2', name: 'Deep Silver', description: null, tier: 3, objectives: [{ type: 'REACH_DEPTH' as const, label: 'Reach depth 90', target: 90, unit: 'depth' as const }, { type: 'KILL_MOB' as const, label: 'Kill 5 Mole Person', target: 5, unit: 'count' as const }], reward: { coins: 300, xp: 200, items: [{ itemId: 'i', itemName: 'Silverium', chance: 50, minQuantity: 1, maxQuantity: 3 }] } },
];

describe('rewardText', () => {
  it('lists coins, XP and items, with a chance when it is not certain', () => {
    expect(rewardText(offers[1].reward)).toBe('300 coins, 200 XP, Silverium x1-3 (50%)');
    expect(rewardText({ coins: 0, xp: 0, items: [{ itemId: 'i', itemName: 'Gem', chance: 100, minQuantity: 2, maxQuantity: 2 }] })).toBe('Gem x2');
    expect(rewardText({ coins: 0, xp: 0, items: [] })).toBe('No reward');
  });
});

describe('MissionPicker', () => {
  it('shows each offer with its tier, goals and reward', () => {
    render(<MissionPicker offers={offers} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Copper Run')).toBeInTheDocument();
    expect(screen.getByText('Tier 1')).toBeInTheDocument();
    expect(screen.getByText('Tier 3')).toBeInTheDocument();
    expect(screen.getByText('• Collect 10 Copperium')).toBeInTheDocument();
    expect(screen.getByText('• Reach depth 90')).toBeInTheDocument();
    expect(screen.getByText('• Kill 5 Mole Person')).toBeInTheDocument();
    expect(screen.getByText('Reward: 30 coins, 20 XP')).toBeInTheDocument();
    expect(screen.getByText('Dig.')).toBeInTheDocument();
  });

  it('reports a pick, and marks the chosen card', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<MissionPicker offers={offers} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Deep Silver'));
    expect(onSelect).toHaveBeenCalledWith('m2');
    rerender(<MissionPicker offers={offers} selected="m2" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Deep Silver/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Copper Run/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
