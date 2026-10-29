import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MissionSimulator, { sharePercent } from './MissionSimulator';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const renderIt = () => render(<ToastProvider><MissionSimulator /></ToastProvider>);

describe('sharePercent', () => {
  it('writes a share as a percent to one decimal', () => {
    expect(sharePercent(0.4567)).toBe('45.7%');
    expect(sharePercent(1)).toBe('100%');
    expect(sharePercent(0)).toBe('0%');
  });
});

describe('MissionSimulator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for a level and lists the missions it would be offered, leaving out the ones that do not fit', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ missions: [
      { id: 'a', key: 'a', name: 'Alpha', tier: 1, share: 0.75, eligible: true },
      { id: 'b', key: 'b', name: 'Beta', tier: 2, share: 0, eligible: false },
    ] }) });
    renderIt();
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('Simulate'));
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/missions/simulate-offers');
    expect(JSON.parse(opts.body)).toEqual({ level: 3, rolls: 2000 });
  });

  it('says so when no mission fits the level', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ missions: [{ id: 'b', key: 'b', name: 'Beta', tier: 2, share: 0, eligible: false }] }) });
    renderIt();
    fireEvent.click(screen.getByText('Simulate'));
    expect(await screen.findByText(/No mission fits level 1/)).toBeInTheDocument();
  });

  it('shows an error when the simulation fails, and refuses a bad level without asking', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({ error: 'Boom' }) });
    renderIt();
    fireEvent.click(screen.getByText('Simulate'));
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    mockFetchWithAuth.mockClear();
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Simulate'));
    expect(await screen.findByText('Enter a level of at least 1.')).toBeInTheDocument();
    await waitFor(() => expect(mockFetchWithAuth).not.toHaveBeenCalled());
  });
});
