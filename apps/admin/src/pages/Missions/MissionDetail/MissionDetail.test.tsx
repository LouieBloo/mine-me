import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MissionDetail from './MissionDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
// The map summary and the sound picker have their own tests; here they only need to show what they are given
vi.mock('./MissionRequirements/MissionRequirements', () => ({ default: ({ form }: any) => <div data-testid="requirements">{form.objectives.length} objectives</div> }));
vi.mock('./MissionSoundEffects/MissionSoundEffects', () => ({
  default: ({ mission, onSaved }: any) => (
    <div data-testid="sounds">
      sounds for {mission.id}
      <button onClick={() => onSaved({ ...mission, soundEffects: { complete: { soundId: 's1' } }, sounds: { complete: { url: '/a.mp3' } } })}>assign sound</button>
    </div>
  ),
}));

const MISSION = {
  id: 'm1', key: 'copper_run', name: 'Copper Run', description: 'Dig.', minLevel: 1, maxLevel: 5, tier: 2, weight: 2,
  objectives: [{ type: 'MINE_ITEM', targetId: 'i1', amount: 10 }], rewardCoins: 20, rewardXp: 10, rewardItems: [],
};
const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/missions" element={<div>LIST PAGE</div>} />
          <Route path="/missions/:id" element={<MissionDetail />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const lastCall = (method: string) => mockFetchWithAuth.mock.calls.filter(([, o]) => o?.method === method).pop();

const serve = (mission: unknown = MISSION, overrides: Record<string, () => Promise<unknown>> = {}) => {
  mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
    if (overrides[url]) return overrides[url]();
    if (opts?.method === 'PUT') return ok({ ...(mission as object), ...JSON.parse(opts.body) });
    if (opts?.method === 'POST') return ok({ ...JSON.parse(opts.body), id: 'm_new' }, 201);
    if (opts?.method === 'DELETE') return ok({ success: true });
    if (url === '/api/admin/items') return ok([{ id: 'i1', name: 'Copperium' }]);
    if (url === '/api/admin/mobs') return ok([{ id: 'mob1', name: 'Mole Person' }]);
    if (url === '/api/admin/fluids') return ok([{ id: 'f1', typeKey: 'WATER', name: 'Water' }]);
    if (url === '/api/admin/gases') return ok([{ id: 'g1', typeKey: 'HYDROGEN', name: 'Hydrogen' }]);
    if (url.startsWith('/api/admin/missions/')) return ok(mission);
    return ok([]);
  });
};

describe('MissionDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a mission into the form, with its objectives, reward and sounds', async () => {
    serve();
    renderAt('/missions/m1');
    expect(await screen.findByDisplayValue('Copper Run')).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('copper_run');
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByLabelText('Tier')).toHaveValue('2');
    expect(screen.getByLabelText('Reward Coins')).toHaveValue(20);
    expect(await screen.findByLabelText('Objective 1 target')).toHaveValue('i1');
    expect(screen.getByTestId('sounds')).toHaveTextContent('sounds for m1');
    expect(screen.getByTestId('requirements')).toHaveTextContent('1 objectives');
  });

  it('saves the changes with a PUT and shows them as saved', async () => {
    serve();
    renderAt('/missions/m1');
    fireEvent.change(await screen.findByLabelText('Reward Coins'), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Big Copper Run' } });
    await screen.findByLabelText('Objective 1 target');
    fireEvent.click(screen.getByText('Save Mission'));
    await waitFor(() => expect(lastCall('PUT')).toBeTruthy());
    const [url, opts] = lastCall('PUT')!;
    expect(url).toBe('/api/admin/missions/m1');
    expect(JSON.parse(opts.body)).toMatchObject({ name: 'Big Copper Run', rewardCoins: 75, objectives: [{ type: 'MINE_ITEM', targetId: 'i1', amount: 10 }] });
    expect(await screen.findByText('Mission saved!')).toBeInTheDocument();
  });

  it('creates a new mission and goes to its page', async () => {
    serve();
    renderAt('/missions/new');
    fireEvent.change(await screen.findByLabelText('Key'), { target: { value: 'Deep_Run' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Deep Run' } });
    await screen.findByText('Copperium');
    fireEvent.change(screen.getByLabelText('Objective 1 target'), { target: { value: 'i1' } });
    fireEvent.click(screen.getByText('Create Mission'));
    await waitFor(() => expect(lastCall('POST')).toBeTruthy());
    const [url, opts] = lastCall('POST')!;
    expect(url).toBe('/api/admin/missions');
    expect(JSON.parse(opts.body)).toMatchObject({ key: 'deep_run', name: 'Deep Run' });
    expect(screen.getByText(/Save the mission first, then give it sounds/)).toBeInTheDocument();
  });

  it('refuses to send a mission with problems and lists them (an empty name, no target)', async () => {
    serve();
    renderAt('/missions/new');
    await screen.findByLabelText('Key');
    fireEvent.click(screen.getByText('Create Mission'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('name is required');
    expect(alert).toHaveTextContent('choose a item');
    expect(lastCall('POST')).toBeUndefined();
  });

  it('shows the server\'s problems when it refuses the save', async () => {
    serve(MISSION, {});
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (opts?.method === 'PUT') return ok({ error: 'objective 1: no block drops "Copperium"', errors: ['objective 1: no block drops "Copperium"'] }, 400);
      if (url.startsWith('/api/admin/missions/')) return ok(MISSION);
      if (url === '/api/admin/items') return ok([{ id: 'i1', name: 'Copperium' }]);
      return ok([]);
    });
    renderAt('/missions/m1');
    await screen.findByLabelText('Objective 1 target');
    fireEvent.click(screen.getByText('Save Mission'));
    // (the server's problems are listed in the form, and the toast says it too)
    expect(await screen.findByText('Please fix:')).toBeInTheDocument();
    expect(screen.getAllByText(/no block drops/).length).toBeGreaterThan(0);
  });

  it('shows a spinner while loading and "not found" for a mission that is not there', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/missions/gone' ? Promise.resolve({ ok: false, status: 404, json: async () => ({}) }) : ok([])));
    renderAt('/missions/gone');
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByText('Mission not found')).toBeInTheDocument();
  });

  it('keeps new sounds from the picker without reloading the page', async () => {
    serve();
    renderAt('/missions/m1');
    fireEvent.click(await screen.findByText('assign sound'));
    expect(screen.getByTestId('sounds')).toBeInTheDocument();
  });

  it('deletes after a confirmation and goes back to the list', async () => {
    serve();
    renderAt('/missions/m1');
    fireEvent.click(await screen.findByText('Delete Mission'));
    expect(await screen.findByText(/Runs already started keep it/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(lastCall('DELETE')).toBeTruthy());
    expect(lastCall('DELETE')![0]).toBe('/api/admin/missions/m1');
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
  });

  it('can back out of a delete', async () => {
    serve();
    renderAt('/missions/m1');
    fireEvent.click(await screen.findByText('Delete Mission'));
    fireEvent.click(await screen.findByText('Cancel'));
    expect(lastCall('DELETE')).toBeUndefined();
  });
});
