import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MissionRequirements from './MissionRequirements';
import { NEW_MISSION } from '../../missionForm';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body });
const form = { ...NEW_MISSION, objectives: [{ type: 'MINE_ITEM' as const, targetId: 'i1', amount: 10 }] };

describe('MissionRequirements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the server what the objectives need and lists the guarantees and the player\'s wording', async () => {
    mockFetchWithAuth.mockReturnValue(ok({ errors: [], labels: ['Collect 10 Copperium'], lines: ['At least 20 Copperium Ore blocks'], requirements: {} }));
    render(<MissionRequirements form={form} delayMs={0} />);
    expect(await screen.findByText('At least 20 Copperium Ore blocks')).toBeInTheDocument();
    expect(screen.getByText('Collect 10 Copperium')).toBeInTheDocument();
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/missions/preview');
    expect(JSON.parse(opts.body)).toEqual({ objectives: [{ type: 'MINE_ITEM', targetId: 'i1', amount: 10 }] });
  });

  it('says so when the objectives ask nothing special of the map', async () => {
    mockFetchWithAuth.mockReturnValue(ok({ errors: [], labels: ['Reach depth 40'], lines: [], requirements: {} }));
    render(<MissionRequirements form={{ ...form, objectives: [{ type: 'REACH_DEPTH', amount: 40 }] }} delayMs={0} />);
    expect(await screen.findByText(/ask nothing special of the map/)).toBeInTheDocument();
  });

  it('shows an error when the server cannot be asked', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({ error: 'Server down' }) });
    render(<MissionRequirements form={form} delayMs={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
  });

  it('asks again only when the objectives change', async () => {
    mockFetchWithAuth.mockReturnValue(ok({ errors: [], labels: [], lines: [], requirements: {} }));
    const { rerender } = render(<MissionRequirements form={form} delayMs={0} />);
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledTimes(1));
    rerender(<MissionRequirements form={{ ...form, name: 'Another name' }} delayMs={0} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1);
    rerender(<MissionRequirements form={{ ...form, objectives: [{ type: 'KILL_MOB', amount: 3 }] }} delayMs={0} />);
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledTimes(2));
  });
});
