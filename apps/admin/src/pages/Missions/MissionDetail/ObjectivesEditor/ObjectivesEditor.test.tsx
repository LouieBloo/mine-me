import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ObjectivesEditor, { type TargetOptions } from './ObjectivesEditor';

const targets: TargetOptions = {
  item: [{ id: 'i1', name: 'Copperium' }],
  mob: [{ id: 'm1', name: 'Mole Person' }],
  fluid: [{ id: 'f1', name: 'Water' }],
  gas: [{ id: 'g1', name: 'Hydrogen' }],
};

const renderIt = (value: any[], onChange = vi.fn()) => {
  render(<ObjectivesEditor value={value} targets={targets} onChange={onChange} />);
  return onChange;
};

describe('ObjectivesEditor', () => {
  it('lists the right table for each type: items, mobs, fluids, gases', () => {
    renderIt([
      { type: 'MINE_ITEM', targetId: null, amount: 5 },
      { type: 'KILL_MOB', targetId: null, amount: 2 },
      { type: 'CLEAR_FLUID', targetId: null, amount: 90 },
      { type: 'CLEAR_GAS', targetId: null, amount: 50 },
    ]);
    const options = (n: number) => within(screen.getByLabelText(`Objective ${n} target`)).getAllByRole('option').map((o) => o.textContent);
    expect(options(1)).toEqual(['Choose a item…', 'Copperium']);
    expect(options(2)).toEqual(['Any mob', 'Mole Person']);
    expect(options(3)).toEqual(['Choose a fluid…', 'Water']);
    expect(options(4)).toEqual(['Choose a gas…', 'Hydrogen']);
  });

  it('offers only the types that can be used (not pumping yet)', () => {
    renderIt([{ type: 'MINE_ITEM', targetId: null, amount: 5 }]);
    const labels = within(screen.getByLabelText('Objective 1 type')).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toHaveLength(5);
    expect(labels.join(' ')).not.toMatch(/Pump/);
  });

  it('shows no target picker for a depth goal', () => {
    renderIt([{ type: 'REACH_DEPTH', amount: 40 }]);
    expect(screen.queryByLabelText('Objective 1 target')).not.toBeInTheDocument();
    expect(screen.getByText('This objective takes no target.')).toBeInTheDocument();
  });

  it('changing the type resets the target and amount to that type\'s defaults', () => {
    const onChange = renderIt([{ type: 'MINE_ITEM', targetId: 'i1', amount: 5 }]);
    fireEvent.change(screen.getByLabelText('Objective 1 type'), { target: { value: 'CLEAR_GAS' } });
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'CLEAR_GAS', targetId: null, amount: 30 }]);
  });

  it('sets a target and an amount', () => {
    const onChange = renderIt([{ type: 'KILL_MOB', targetId: null, amount: 2 }]);
    fireEvent.change(screen.getByLabelText('Objective 1 target'), { target: { value: 'm1' } });
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'KILL_MOB', targetId: 'm1', amount: 2 }]);
    fireEvent.change(screen.getByLabelText('Objective 1 amount'), { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'KILL_MOB', targetId: null, amount: 7 }]);
  });

  it('adds and removes objectives, and stops adding at the limit', () => {
    const onChange = renderIt([{ type: 'REACH_DEPTH', amount: 40 }, { type: 'KILL_MOB', amount: 2 }]);
    fireEvent.click(screen.getByLabelText('Remove objective 1'));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'KILL_MOB', amount: 2 }]);
    fireEvent.click(screen.getByText('+ Add Objective'));
    expect(onChange.mock.calls.at(-1)![0]).toHaveLength(3);
  });

  it('disables adding at five objectives', () => {
    renderIt(Array.from({ length: 5 }, () => ({ type: 'REACH_DEPTH', amount: 10 })));
    expect(screen.getByText('+ Add Objective')).toBeDisabled();
  });

  it('says so when there are none', () => {
    renderIt([]);
    expect(screen.getByText(/a mission needs at least one/i)).toBeInTheDocument();
  });
});
