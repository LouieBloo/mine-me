import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DoodadDetail from './DoodadDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
// The preview and the sound picker have their own tests; here they only need to show what they are given
vi.mock('../../../components/DoodadPreview/DoodadPreview', () => ({
  default: ({ doodad, particleConfig, ambientSound, onChange }: any) => (
    <div data-testid="preview">
      {`${doodad.key}|${doodad.anchor}|${doodad.width}x${doodad.height}|${doodad.particleOffsetX}|${particleConfig ? 'effect' : 'no-effect'}|${ambientSound?.url ?? 'no-sound'}`}
      <button onClick={() => onChange({ particleOffsetX: 7 })}>move particles</button>
    </div>
  ),
}));
vi.mock('./DoodadSoundEffects/DoodadSoundEffects', () => ({
  default: ({ doodad, onSaved }: any) => (
    <div data-testid="sounds">
      sounds for {doodad.id}
      <button onClick={() => onSaved({ ...doodad, soundEffects: { ambient: { soundId: 's1' } }, sounds: { ambient: { url: '/assets/sounds/drip.mp3' } } })}>assign sound</button>
    </div>
  ),
}));

const MUSHROOM = {
  id: 'd1', key: 'glow_mushroom', name: 'Glow Mushroom', description: 'It glows', anchor: 'FLOOR', width: 3, height: 3, zOffset: 0, textureUrl: '/assets/sprites/doodads/glow.png',
  motion: { preset: 'sway' }, particleEffectId: 'p1', particleOffsetX: 2, particleOffsetY: 0,
  spawn: { minDepth: 9, blocks: ['STONE'] }, biomes: [{ biomeId: 'b1', biomeKey: 'frozen_caves', weight: 2, density: 1 }],
};
const BIOMES = [{ id: 'b1', key: 'frozen_caves', name: 'Frozen Caves' }, { id: 'b2', key: 'clay_pits', name: 'Clay Pits' }];
const BLOCKS = [{ typeKey: 'STONE', name: 'Stone' }, { typeKey: 'CLAY', name: 'Clay' }];
const EFFECTS = [{ id: 'p1', name: 'Spores', config: { emitterType: 'continuous' } }];

const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/doodads" element={<div>LIST PAGE</div>} />
          <Route path="/doodads/:id" element={<DoodadDetail />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const lastCall = (method: string) => mockFetchWithAuth.mock.calls.filter(([, o]) => o?.method === method).pop();

const serve = (doodad: unknown = MUSHROOM, overrides: Record<string, () => Promise<unknown>> = {}) => {
  mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
    if (overrides[url]) return overrides[url]();
    if (opts?.method === 'PUT') return ok({ ...(doodad as object), ...JSON.parse(opts.body) });
    if (opts?.method === 'POST') return ok({ ...JSON.parse(opts.body), id: 'd_new' }, 201);
    if (opts?.method === 'DELETE') return ok({ success: true });
    if (url === '/api/admin/biomes') return ok(BIOMES);
    if (url === '/api/admin/blocks') return ok(BLOCKS);
    if (url === '/api/admin/fluids') return ok([{ typeKey: 'WATER', name: 'Water' }]);
    if (url === '/api/admin/gases') return ok([{ typeKey: 'HYDROGEN', name: 'Hydrogen' }]);
    if (url === '/api/admin/particle-effects') return ok(EFFECTS);
    return ok(doodad);
  });
};

describe('DoodadDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a doodad into the form and shows it in the preview with its effect', async () => {
    serve();
    renderAt('/doodads/d1');
    expect(await screen.findByDisplayValue('Glow Mushroom')).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByLabelText('Key')).toHaveValue('glow_mushroom');
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('glow_mushroom|FLOOR|3x3|2|effect|no-sound'));
    expect(screen.getByLabelText('Preset')).toHaveValue('sway');
    expect(screen.getByLabelText('Frozen Caves weight')).toHaveValue(2);
    expect(screen.getByTestId('sounds')).toHaveTextContent('sounds for d1');
  });

  it('shows a spinner while loading and "not found" for a missing doodad', async () => {
    serve(null, { '/api/admin/doodads/gone': () => ok({}, 404) });
    renderAt('/doodads/gone');
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByText('Doodad not found')).toBeInTheDocument();
  });

  it('reports a failed load', async () => {
    serve(null, { '/api/admin/doodads/d1': () => ok({}, 500) });
    renderAt('/doodads/d1');
    expect(await screen.findByText('Failed to fetch doodad')).toBeInTheDocument();
  });

  it('reports a picker list that cannot be loaded, and still lets the doodad be edited', async () => {
    serve(MUSHROOM, { '/api/admin/blocks': () => ok({}, 500) });
    renderAt('/doodads/d1');
    expect(await screen.findByText('Failed to fetch blocks')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Glow Mushroom')).toBeInTheDocument();
  });

  it('saves the edited doodad with PUT, in the shape the server stores, and shows it saved', async () => {
    serve();
    renderAt('/doodads/d1');
    const name = await screen.findByDisplayValue('Glow Mushroom');
    fireEvent.change(name, { target: { value: 'Big Glow Mushroom' } });
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Doodad' }));
    await waitFor(() => expect(lastCall('PUT')).toBeDefined());
    const [url, opts] = lastCall('PUT')!;
    expect(url).toBe('/api/admin/doodads/d1');
    expect(JSON.parse(opts.body)).toMatchObject({
      key: 'glow_mushroom', name: 'Big Glow Mushroom', width: 6, height: 3, anchor: 'FLOOR', motion: { preset: 'sway' }, particleEffectId: 'p1',
      spawn: { minDepth: 9, blocks: ['STONE'] }, biomes: [{ biomeId: 'b1', biomeKey: 'frozen_caves', weight: 2, density: 1 }],
    });
    expect(await screen.findByText('Doodad saved!')).toBeInTheDocument();
  });

  it('will not save a doodad the rules refuse, and says why', async () => {
    serve();
    renderAt('/doodads/d1');
    fireEvent.change(await screen.findByLabelText('Width'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Doodad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/width must be a whole number/);
    expect(lastCall('PUT')).toBeUndefined();
  });

  it('shows the server\'s reasons when a save is refused', async () => {
    serve(MUSHROOM, {});
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (opts?.method === 'PUT') return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: 'bad', errors: ['spawn.blocks names an unknown block: NOPE'] }) });
      if (url === '/api/admin/doodads/d1') return ok(MUSHROOM);
      return ok([]);
    });
    renderAt('/doodads/d1');
    fireEvent.click(await screen.findByRole('button', { name: 'Save Doodad' }));
    expect(await screen.findByText('spawn.blocks names an unknown block: NOPE')).toBeInTheDocument();
    expect(await screen.findByText('bad')).toBeInTheDocument();
  });

  it('creates a new doodad with POST and goes to its page', async () => {
    serve();
    renderAt('/doodads/new');
    expect(await screen.findByLabelText('Key')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'Moss' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Moss' } });
    fireEvent.change(screen.getByLabelText('Anchor'), { target: { value: 'WALL' } });
    expect(screen.getByText('Sounds can be added once the doodad is created.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Doodad' }));
    await waitFor(() => expect(lastCall('POST')).toBeDefined());
    expect(JSON.parse(lastCall('POST')![1].body)).toMatchObject({ key: 'moss', name: 'Moss', anchor: 'WALL', biomes: [] });
    expect(await screen.findByText('Doodad created!')).toBeInTheDocument();
  });

  it('turns a crawler into a flutterer when the doodad is moved into the air', async () => {
    serve({ ...MUSHROOM, wander: { mode: 'CRAWL', radius: 6, speed: 1, pauseMs: 1000 } });
    renderAt('/doodads/d1');
    await screen.findByDisplayValue('Glow Mushroom');
    expect(screen.getByLabelText('Mode')).toHaveValue('CRAWL');
    fireEvent.change(screen.getByLabelText('Anchor'), { target: { value: 'AIR' } });
    expect(screen.getByLabelText('Mode')).toHaveValue('FLUTTER');
  });

  it('lets the preview move the particle origin', async () => {
    serve();
    renderAt('/doodads/d1');
    await screen.findByDisplayValue('Glow Mushroom');
    fireEvent.click(screen.getByRole('button', { name: 'move particles' }));
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('|7|'));
  });

  it('gives the preview the ambient sound once a sound is assigned', async () => {
    serve();
    renderAt('/doodads/d1');
    await screen.findByDisplayValue('Glow Mushroom');
    fireEvent.click(screen.getByRole('button', { name: 'assign sound' }));
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('/assets/sounds/drip.mp3'));
  });

  it('keeps the preview safe while a number is half typed', async () => {
    serve();
    renderAt('/doodads/d1');
    fireEvent.change(await screen.findByLabelText('Height'), { target: { value: '' } });
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('3x3'));
  });

  it('deletes after confirmation, and offers to cancel', async () => {
    serve();
    renderAt('/doodads/d1');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Doodad' }));
    const dialog = await screen.findByText(/Mines that are already running keep it/);
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/Mines that are already running keep it/)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Doodad' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(lastCall('DELETE')).toBeDefined());
    expect(lastCall('DELETE')![0]).toBe('/api/admin/doodads/d1');
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
  });

  it('shows an error and stays when a delete fails', async () => {
    serve();
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (opts?.method === 'DELETE') return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Cannot delete' }) });
      if (url === '/api/admin/doodads/d1') return ok(MUSHROOM);
      return ok([]);
    });
    renderAt('/doodads/d1');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Doodad' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Cannot delete')).toBeInTheDocument();
    expect(screen.queryByText('LIST PAGE')).not.toBeInTheDocument();
  });
});
