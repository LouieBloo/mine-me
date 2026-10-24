import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoodadSpawnPanel from './DoodadSpawnPanel';

const blocks = [{ key: 'STONE', label: 'Stone' }, { key: 'CLAY', label: 'Clay' }];
const fluids = [{ key: 'WATER', label: 'Water' }];
const gases = [{ key: 'HYDROGEN', label: 'Hydrogen' }];
const renderIt = (value: any = {}, onChange = vi.fn()) => {
  render(<DoodadSpawnPanel value={value} onChange={onChange} blocks={blocks} fluids={fluids} gases={gases} />);
  return onChange;
};

describe('DoodadSpawnPanel', () => {
  it('sets a depth window, and an emptied box means no limit', () => {
    const onChange = renderIt({ minDepth: 9 });
    fireEvent.change(screen.getByLabelText('Deepest Row'), { target: { value: '60' } });
    expect(onChange).toHaveBeenLastCalledWith({ minDepth: 9, maxDepth: 60 });
    fireEvent.change(screen.getByLabelText('Shallowest Row'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ minDepth: null });
  });

  it('shows the depth in original blocks', () => {
    renderIt({ minDepth: 9, maxDepth: 30 });
    expect(screen.getByText(/3\.0 original blocks/)).toBeInTheDocument();
    expect(screen.getByText(/10\.0 original blocks/)).toBeInTheDocument();
  });

  it('picks the blocks, fluids and gases it needs', () => {
    const onChange = renderIt({});
    fireEvent.click(screen.getByRole('button', { name: 'Stone' }));
    expect(onChange).toHaveBeenLastCalledWith({ blocks: ['STONE'] });
    fireEvent.click(screen.getByRole('button', { name: 'Water' }));
    expect(onChange).toHaveBeenLastCalledWith({ nearFluids: ['WATER'] });
    fireEvent.click(screen.getByRole('button', { name: 'Hydrogen' }));
    expect(onChange).toHaveBeenLastCalledWith({ nearGases: ['HYDROGEN'] });
  });

  it('asks how near "near" is only once a fluid or gas is needed', () => {
    const { rerender } = render(<DoodadSpawnPanel value={{}} onChange={vi.fn()} blocks={blocks} fluids={fluids} gases={gases} />);
    expect(screen.queryByLabelText('Near Means Within')).not.toBeInTheDocument();
    rerender(<DoodadSpawnPanel value={{ nearFluids: ['WATER'] }} onChange={vi.fn()} blocks={blocks} fluids={fluids} gases={gases} />);
    expect(screen.getByLabelText('Near Means Within')).toBeInTheDocument();
  });

  it('sets the spacing and the dark-only flag', () => {
    const onChange = renderIt({});
    fireEvent.change(screen.getByLabelText('Minimum Spacing'), { target: { value: '9' } });
    expect(onChange).toHaveBeenLastCalledWith({ minSpacing: 9 });
    fireEvent.click(screen.getByLabelText('Dark places only'));
    expect(onChange).toHaveBeenLastCalledWith({ darkOnly: true });
  });
});
