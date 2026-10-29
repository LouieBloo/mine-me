import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoodadGroupsPanel, { groupSummary } from './DoodadGroupsPanel';

const renderIt = (value: any = {}, onChange = vi.fn()) => {
  render(<DoodadGroupsPanel value={value} onChange={onChange} />);
  return onChange;
};

describe('groupSummary', () => {
  it('says scattered with no group share', () => {
    expect(groupSummary({})).toMatch(/^Scattered/);
    expect(groupSummary({ groupChance: 0, groupSizeMin: 9 })).toMatch(/^Scattered/);
  });
  it('says what a group is', () => {
    expect(groupSummary({ groupChance: 0.8, groupSizeMin: 3, groupSizeMax: 8, groupSpread: 6, groupFill: 0.5 })).toBe(
      '80% stand in groups of 3 to 8, spread up to 6 blocks along a surface, filling about 50% of the free spots; the other 20% stand alone.'
    );
    expect(groupSummary({ groupChance: 1, groupSizeMin: 5, groupSizeMax: 5 })).not.toMatch(/stand alone/);
  });
});

describe('DoodadGroupsPanel', () => {
  it('shows only the share and the limit until it groups', () => {
    renderIt({});
    expect(screen.getByLabelText('In Groups (%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Most On The Map')).toBeInTheDocument();
    expect(screen.queryByLabelText('Spread')).not.toBeInTheDocument();
    expect(screen.getByTestId('group-summary')).toHaveTextContent('Scattered');
  });

  it('types the share as a percentage and stores it as a share of 1', () => {
    const onChange = renderIt({});
    fireEvent.change(screen.getByLabelText('In Groups (%)'), { target: { value: '80' } });
    expect(onChange).toHaveBeenLastCalledWith({ groupChance: 0.8 });
  });

  it('clears the share when the box is emptied', () => {
    const onChange = renderIt({ groupChance: 0.8 });
    fireEvent.change(screen.getByLabelText('In Groups (%)'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ groupChance: null });
  });

  it('shows a stored share as a percentage', () => {
    renderIt({ groupChance: 0.8, groupFill: 0.7 });
    expect(screen.getByLabelText('In Groups (%)')).toHaveValue(80);
    expect(screen.getByLabelText('Fill (%)')).toHaveValue(70);
  });

  it('edits the size, spread, fill and gap once it groups', () => {
    const onChange = renderIt({ groupChance: 1 });
    fireEvent.change(screen.getByLabelText('Smallest Group'), { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith({ groupChance: 1, groupSizeMin: 10 });
    fireEvent.change(screen.getByLabelText('Largest Group'), { target: { value: '40' } });
    expect(onChange).toHaveBeenLastCalledWith({ groupChance: 1, groupSizeMax: 40 });
    fireEvent.change(screen.getByLabelText('Spread'), { target: { value: '14' } });
    expect(onChange).toHaveBeenLastCalledWith({ groupChance: 1, groupSpread: 14 });
    fireEvent.change(screen.getByLabelText('Fill (%)'), { target: { value: '70' } });
    expect(onChange).toHaveBeenLastCalledWith({ groupChance: 1, groupFill: 0.7 });
    fireEvent.change(screen.getByLabelText('Gap Inside A Group'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({ groupChance: 1, memberSpacing: 1 });
  });

  it('sets and clears the limit for the doodad', () => {
    const onChange = renderIt({ minDepth: 3 });
    fireEvent.change(screen.getByLabelText('Most On The Map'), { target: { value: '120' } });
    expect(onChange).toHaveBeenLastCalledWith({ minDepth: 3, maxCount: 120 });
  });

  it('clears the limit when the box is emptied', () => {
    const onChange = renderIt({ minDepth: 3, maxCount: 120 });
    fireEvent.change(screen.getByLabelText('Most On The Map'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ minDepth: 3, maxCount: null });
  });
});
