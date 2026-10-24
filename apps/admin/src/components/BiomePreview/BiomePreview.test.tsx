import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import BiomePreview from './BiomePreview';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const RESULT = {
  width: 2, height: 1,
  biomes: [{ index: 0, key: 'default', name: 'Default', ambient: {} }, { index: 1, key: 'frozen', name: 'Frozen', ambient: {} }],
  tiles: [1, 1], biomeIndex: [0, 1], fluidCells: [], gasCells: [],
};
const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
};

describe('BiomePreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchWithAuth.mockReset();
    mockFetchWithAuth.mockImplementation(() => ok(RESULT));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '', globalAlpha: 1 })) as any;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const draft = [{ key: 'frozen', name: 'Frozen', minDepth: 0, weight: 1, noiseScale: 40 }];

  it('asks the server for a strip once edits settle, with the biomes, seed and blend', async () => {
    render(<BiomePreview biomes={draft} blendWidth={0.2} />);
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
    await settle();
    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/biomes/preview');
    expect(JSON.parse(options.body)).toMatchObject({ biomes: draft, seed: 1, blendWidth: 0.2 });
    expect(screen.getByLabelText('Biome preview')).toBeInTheDocument();
  });

  it('asks only once for a burst of edits', async () => {
    const { rerender } = render(<BiomePreview biomes={draft} />);
    rerender(<BiomePreview biomes={[{ ...draft[0], weight: 2 }]} />);
    rerender(<BiomePreview biomes={[{ ...draft[0], weight: 3 }]} />);
    await settle();
    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockFetchWithAuth.mock.calls[0][1].body).biomes[0].weight).toBe(3);
  });

  it('asks again for a new seed and for a different blend', async () => {
    render(<BiomePreview biomes={draft} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /New Seed/ }));
    await settle();
    expect(JSON.parse(mockFetchWithAuth.mock.calls[1][1].body).seed).toBe(2);
    fireEvent.change(screen.getByLabelText(/Border Softness/), { target: { value: '0.4' } });
    await settle();
    expect(JSON.parse(mockFetchWithAuth.mock.calls[2][1].body).blendWidth).toBe(0.4);
  });

  it('lists how much of the strip each biome covers', async () => {
    render(<BiomePreview biomes={draft} />);
    await settle();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Default50%', 'Frozen50%']);
  });

  it('switches between blocks and regions', async () => {
    render(<BiomePreview biomes={draft} />);
    await settle();
    expect(screen.getByRole('button', { name: 'Blocks' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Regions' }));
    expect(screen.getByRole('button', { name: 'Regions' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the server\'s complaint when the preview cannot be made', async () => {
    mockFetchWithAuth.mockImplementation(() => ok({ error: 'frozen: weight must be greater than 0' }, 400));
    render(<BiomePreview biomes={draft} />);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('weight must be greater than 0');
  });

  it('shows a network failure instead of hanging', async () => {
    mockFetchWithAuth.mockImplementation(() => Promise.reject(new Error('Network down')));
    render(<BiomePreview biomes={draft} />);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
  });
});
