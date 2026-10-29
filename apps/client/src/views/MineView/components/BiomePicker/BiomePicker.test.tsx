import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BiomePicker, toggleBiomeKey } from './BiomePicker';

// (a plain function behind the mock: a vi.fn that returns a rejected promise reports it as an unhandled error)
const fetchWithAuth = vi.fn();
let failWith: Error | null = null;
const fetchStable = (...args: unknown[]) => (failWith ? Promise.reject(failWith) : fetchWithAuth(...args));
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: fetchStable }) }));

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const BIOMES = [
  { key: 'clay_pits', name: 'Clay Pits', description: 'Soft and red' },
  { key: 'frozen_caves', name: 'Frozen Caves', description: null },
];

describe('toggleBiomeKey', () => {
  it('adds a key at the end and removes one that is there', () => {
    expect(toggleBiomeKey(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleBiomeKey(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('does not change the list it was given', () => {
    const list = ['a'];
    toggleBiomeKey(list, 'b');
    expect(list).toEqual(['a']);
  });
});

describe('BiomePicker', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset();
    failWith = null;
  });

  it('shows a spinner while the biomes load, then the biomes by name', async () => {
    fetchWithAuth.mockReturnValue(ok(BIOMES));
    render(<BiomePicker selected={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('Clay Pits')).toBeInTheDocument();
    expect(screen.getByText('Soft and red')).toBeInTheDocument();
    expect(screen.getByText('Frozen Caves')).toBeInTheDocument();
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/game/biomes');
  });

  it('has "All biomes (normal)" selected when nothing is picked, and picking one clears it', async () => {
    fetchWithAuth.mockReturnValue(ok(BIOMES));
    const onChange = vi.fn();
    const { rerender } = render(<BiomePicker selected={[]} onChange={onChange} />);
    await screen.findByText('Clay Pits');
    expect(screen.getByRole('button', { name: /All biomes/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByLabelText('Frozen Caves'));
    expect(onChange).toHaveBeenCalledWith(['frozen_caves']);
    rerender(<BiomePicker selected={['frozen_caves']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /All biomes/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Frozen Caves')).toBeChecked();
  });

  it('picks several biomes and goes back to all with the first option', async () => {
    fetchWithAuth.mockReturnValue(ok(BIOMES));
    const onChange = vi.fn();
    render(<BiomePicker selected={['clay_pits']} onChange={onChange} />);
    await screen.findByText('Clay Pits');
    fireEvent.click(screen.getByLabelText('Frozen Caves'));
    expect(onChange).toHaveBeenLastCalledWith(['clay_pits', 'frozen_caves']);
    fireEvent.click(screen.getByRole('button', { name: /All biomes/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('shows the server error and loads again on Retry', async () => {
    fetchWithAuth
      .mockReturnValueOnce(Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Server down' }) }))
      .mockReturnValueOnce(ok(BIOMES));
    render(<BiomePicker selected={[]} onChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Clay Pits')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a network failure too', async () => {
    failWith = new Error('offline');
    render(<BiomePicker selected={[]} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('offline'));
  });

  it('says so when no biomes are defined', async () => {
    fetchWithAuth.mockReturnValue(ok([]));
    render(<BiomePicker selected={[]} onChange={vi.fn()} />);
    expect(await screen.findByText(/No biomes are defined/)).toBeInTheDocument();
  });
});
