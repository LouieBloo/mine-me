import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Missions, { objectiveSummary } from './Missions';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
vi.mock('./MissionSimulator/MissionSimulator', () => ({ default: () => <div>SIMULATOR</div> }));

const COPPER = { id: 'm1', key: 'copper_run', name: 'Copper Run', tier: 1, minLevel: 1, maxLevel: 3, weight: 1, objectives: [{ type: 'MINE_ITEM', targetId: 'i1', amount: 10 }], rewardSol: 30, rewardXp: 20, rewardItems: [] };
const DEEP = { id: 'm2', key: 'deep', name: 'Deep Silver', tier: 3, minLevel: 3, maxLevel: 4, weight: 1, objectives: [{ type: 'MINE_ITEM', targetId: 'i2', amount: 15 }, { type: 'REACH_DEPTH', amount: 90 }], rewardSol: 300, rewardXp: 200, rewardItems: [{ itemId: 'i2', chance: 100, minQuantity: 1, maxQuantity: 2 }] };

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/missions']}>
        <Routes>
          <Route path="/missions" element={<Missions />} />
          <Route path="/missions/new" element={<div>NEW PAGE</div>} />
          <Route path="/missions/:id" element={<div>DETAIL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('objectiveSummary', () => {
  it('lists the kinds of goal in order', () => {
    expect(objectiveSummary(DEEP as any)).toBe('Collect an item + Reach a depth');
  });
});

describe('Missions list page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while loading, then each mission with its tier, levels, goals and reward', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [COPPER, DEEP] });
    renderPage();
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByText('Copper Run')).toBeInTheDocument();
    expect(screen.getByText('Tier 1 (easy)')).toBeInTheDocument();
    expect(screen.getByText('Tier 3 (hard)')).toBeInTheDocument();
    expect(screen.getByText('3-4')).toBeInTheDocument();
    expect(screen.getByText('30 Sol, 20 XP')).toBeInTheDocument();
    expect(screen.getByText('300 Sol, 200 XP, 1 item')).toBeInTheDocument();
    expect(screen.getByText('SIMULATOR')).toBeInTheDocument();
  });

  it('says so when there are no missions', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    expect(await screen.findByText('No missions yet.')).toBeInTheDocument();
  });

  it('shows an error when the list cannot be loaded', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();
    expect(await screen.findByText('Failed to fetch missions')).toBeInTheDocument();
  });

  it('opens the editor for a mission and a new one', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [COPPER] });
    renderPage();
    fireEvent.click(await screen.findByText('Edit Mission'));
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument();
  });

  it('opens a new mission', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderPage();
    fireEvent.click(await screen.findByText('+ New Mission'));
    expect(await screen.findByText('NEW PAGE')).toBeInTheDocument();
  });
});
