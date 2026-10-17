import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FluidReactionsPanel from './FluidReactionsPanel';

const fluids = [{ typeKey: 'WATER', name: 'Water' }, { typeKey: 'OIL', name: 'Oil' }];
const blocks = [{ typeKey: 'LAVAROCK', name: 'Lavarock' }, { typeKey: 'ROCK', name: 'Rock' }];
const REACTION = { with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 2 };

describe('FluidReactionsPanel', () => {
  it('shows an empty state and adds a reaction with the first choices', () => {
    const onChange = vi.fn();
    render(<FluidReactionsPanel value={null} onChange={onChange} fluids={fluids} blocks={blocks} />);
    expect(screen.getByText('No reactions')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add Reaction'));
    expect(onChange).toHaveBeenCalledWith([{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 1 }]);
  });

  it('cannot add when there are no fluids or blocks to choose from', () => {
    render(<FluidReactionsPanel value={null} onChange={vi.fn()} fluids={[]} blocks={blocks} />);
    expect(screen.getByText('Add Reaction')).toBeDisabled();
  });

  it('edits the fluid, the block and the cost', () => {
    const onChange = vi.fn();
    render(<FluidReactionsPanel value={[REACTION]} onChange={onChange} fluids={fluids} blocks={blocks} />);
    expect(screen.getByLabelText('Touched By')).toHaveValue('WATER');
    fireEvent.change(screen.getByLabelText('Touched By'), { target: { value: 'OIL' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...REACTION, with: 'OIL' }]);
    fireEvent.change(screen.getByLabelText('Turns Into'), { target: { value: 'ROCK' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...REACTION, becomes: 'ROCK' }]);
    fireEvent.change(screen.getByLabelText('Cost Per Level'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...REACTION, costPerLevel: 3 }]);
  });

  it('removing the last reaction saves null', () => {
    const onChange = vi.fn();
    render(<FluidReactionsPanel value={[REACTION]} onChange={onChange} fluids={fluids} blocks={blocks} />);
    fireEvent.click(screen.getByLabelText('Remove reaction 1'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('keeps showing a reaction whose fluid or block is no longer in the lists', () => {
    render(<FluidReactionsPanel value={[{ with: 'ACID', becomes: 'GONE', costPerLevel: 1 }]} onChange={vi.fn()} fluids={fluids} blocks={blocks} />);
    expect(screen.getByLabelText('Touched By')).toHaveValue('ACID');
    expect(screen.getByLabelText('Turns Into')).toHaveValue('GONE');
  });

  it('sets how fast it hardens, and an emptied field goes back to the default', () => {
    const onChange = vi.fn();
    render(<FluidReactionsPanel value={[REACTION]} onChange={onChange} fluids={fluids} blocks={blocks} />);
    expect(screen.getByLabelText('Speed Per Step')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Speed Per Step'), { target: { value: '0.5' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...REACTION, ratePerStep: 0.5 }]);
  });

  it('shows a rate that was set, and clearing it removes it', () => {
    const onChange = vi.fn();
    render(<FluidReactionsPanel value={[{ ...REACTION, ratePerStep: 0.5 }]} onChange={onChange} fluids={fluids} blocks={blocks} />);
    expect(screen.getByLabelText('Speed Per Step')).toHaveValue(0.5);
    fireEvent.change(screen.getByLabelText('Speed Per Step'), { target: { value: '' } });
    expect(onChange.mock.calls.at(-1)![0][0].ratePerStep).toBeUndefined();
  });
});
