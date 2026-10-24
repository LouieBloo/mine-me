import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { BiomeBlockSwap } from '@mine-me/shared';
import BlockSwapsEditor from './BlockSwapsEditor';

const BLOCKS = [
  { key: 'DIRT', label: 'Dirt' },
  { key: 'LAVAROCK', label: 'Lavarock' },
  { key: 'ROCK', label: 'Rock' },
];

const renderEditor = (value: BiomeBlockSwap[] | undefined, onChange = vi.fn()) => {
  render(<BlockSwapsEditor value={value} blocks={BLOCKS} onChange={onChange} />);
  return onChange;
};

describe('BlockSwapsEditor', () => {
  afterEach(cleanup);

  it('says there are no swaps when empty', () => {
    renderEditor(undefined);
    expect(screen.getByText(/No swaps/)).toBeInTheDocument();
  });

  it('adds a swap from the chosen blocks, swapping all of them', () => {
    const onChange = renderEditor(undefined);
    fireEvent.change(screen.getByLabelText('Swap to'), { target: { value: 'ROCK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Swap' }));
    expect(onChange).toHaveBeenCalledWith([{ from: 'DIRT', to: 'ROCK' }]);
  });

  it('will not swap a block for itself, nor swap one block twice', () => {
    renderEditor([{ from: 'DIRT', to: 'ROCK' }]);
    fireEvent.change(screen.getByLabelText('Swap to'), { target: { value: 'DIRT' } });
    expect(screen.getByRole('button', { name: 'Add Swap' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Swap to'), { target: { value: 'LAVAROCK' } });
    expect(screen.getByRole('button', { name: 'Add Swap' })).toBeDisabled(); // DIRT already has a swap
    fireEvent.change(screen.getByLabelText('Swap from'), { target: { value: 'ROCK' } });
    expect(screen.getByRole('button', { name: 'Add Swap' })).toBeEnabled();
  });

  it('shows the share as a percentage and changes it', () => {
    const onChange = renderEditor([{ from: 'DIRT', to: 'ROCK', chance: 0.5 }]);
    const input = screen.getByLabelText('Share of Dirt swapped (%)') as HTMLInputElement;
    expect(input.value).toBe('50');
    fireEvent.change(input, { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith([{ from: 'DIRT', to: 'ROCK', chance: 0.25 }]);
  });

  it('shows 100% when no share is set', () => {
    renderEditor([{ from: 'DIRT', to: 'ROCK' }]);
    expect((screen.getByLabelText('Share of Dirt swapped (%)') as HTMLInputElement).value).toBe('100');
  });

  it('removes a swap, and reports undefined once the last one goes', () => {
    const onChange = renderEditor([{ from: 'DIRT', to: 'ROCK' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove swap of Dirt' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
