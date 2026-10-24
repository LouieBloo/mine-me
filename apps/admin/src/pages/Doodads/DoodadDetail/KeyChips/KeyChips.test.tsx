import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KeyChips from './KeyChips';

const options = [{ key: 'STONE', label: 'Stone' }, { key: 'CLAY', label: 'Clay' }];
const renderIt = (value: string[] | null, onChange = vi.fn(), opts = options) => {
  render(<KeyChips id="blocks" title="Blocks" hint="Where it may sit" options={opts} value={value} onChange={onChange} />);
  return onChange;
};

describe('KeyChips', () => {
  it('shows a chip per option, pressed when chosen', () => {
    renderIt(['CLAY']);
    expect(screen.getByRole('button', { name: 'Stone' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Clay' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds a key when an unpressed chip is clicked, and removes it when a pressed one is', () => {
    const onChange = renderIt(['CLAY']);
    fireEvent.click(screen.getByRole('button', { name: 'Stone' }));
    expect(onChange).toHaveBeenLastCalledWith(['CLAY', 'STONE']);
    fireEvent.click(screen.getByRole('button', { name: 'Clay' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('keeps a chosen key that no option names, so it can be taken off', () => {
    const onChange = renderIt(['GONE']);
    fireEvent.click(screen.getByRole('button', { name: 'GONE (unknown)' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('says so when there is nothing to pick from', () => {
    renderIt(null, vi.fn(), []);
    expect(screen.getByText('Nothing to pick from yet.')).toBeInTheDocument();
  });
});
