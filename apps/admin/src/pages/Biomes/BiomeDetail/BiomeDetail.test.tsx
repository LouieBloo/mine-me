import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BiomeDetail, { formToBiome, NEW_BIOME, previewBiome } from './BiomeDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
// The preview has its own tests; here it only needs to show what it is given
vi.mock('../../../components/BiomePreview/BiomePreview', () => ({
  default: ({ biomes, blendWidth }: any) => <div data-testid="preview">{biomes.map((b: any) => `${b.key}:${b.weight}:${b.isDefault ? 'D' : '-'}`).join(',')}|{blendWidth}</div>,
}));

const DEFAULT = { id: 'b_default', key: 'default', name: 'Default', isDefault: true, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 45 };
const FROZEN = {
  id: 'b_frozen', key: 'frozen_caves', name: 'Frozen Caves', description: 'Cold', isDefault: false, minDepth: 90, maxDepth: 270, weight: 1.5, noiseScale: 60,
  blockPalette: { weights: { SILVERIUM: 2 }, swaps: [{ from: 'DIRT', to: 'LAVAROCK', chance: 0.5 }] },
  fluidWeights: { OIL: 0 }, gasWeights: null, mobSpawns: { mob_mole: 1 }, ambient: { tint: '#99bbff' },
};
const BLOCKS = [{ typeKey: 'DIRT', name: 'Dirt' }, { typeKey: 'SILVERIUM', name: 'Silverium' }, { typeKey: 'LAVAROCK', name: 'Lavarock' }];

const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/biomes" element={<div>LIST PAGE</div>} />
          <Route path="/biomes/:id" element={<BiomeDetail />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const lastCall = (method: string) => mockFetchWithAuth.mock.calls.filter(([, o]) => o?.method === method).pop();

/** The server, as these tests need it. `biome` is what GET /biomes/:id returns. */
const serve = (biome: unknown = FROZEN, overrides: Record<string, () => Promise<unknown>> = {}) => {
  mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
    if (overrides[url]) return overrides[url]();
    if (opts?.method === 'PUT') return ok({ ...(biome as object), ...JSON.parse(opts.body) });
    if (opts?.method === 'POST') return ok({ ...JSON.parse(opts.body), id: 'b_new' }, 201);
    if (opts?.method === 'DELETE') return ok({ success: true });
    if (url === '/api/admin/blocks') return ok(BLOCKS);
    if (url === '/api/admin/fluids') return ok([{ typeKey: 'OIL', name: 'Oil' }]);
    if (url === '/api/admin/gases') return ok([{ typeKey: 'HYDROGEN', name: 'Hydrogen' }]);
    if (url === '/api/admin/mobs') return ok([{ id: 'mob_mole', name: 'Mole Person' }]);
    if (url === '/api/admin/mining-config') return ok({ biomeBlendWidth: 0.3 });
    if (url === '/api/admin/biomes') return ok([DEFAULT, FROZEN]);
    return ok(biome);
  });
};

describe('formToBiome and previewBiome', () => {
  it('stores no palette when there are no weights or swaps, and no description when blank', () => {
    expect(formToBiome({ ...NEW_BIOME, key: 'a', name: ' A ' })).toMatchObject({ name: 'A', description: null, blockPalette: null });
  });

  it('keeps a half-typed form usable for the preview', () => {
    const draft = previewBiome({ ...NEW_BIOME, weight: NaN, noiseScale: NaN, minDepth: NaN, maxDepth: 5, fluidWeights: { OIL: NaN, WATER: 2 } }, 'draft');
    expect(draft).toMatchObject({ id: 'draft', key: 'new_biome', name: 'New biome', weight: 1, minDepth: 0, maxDepth: 5, fluidWeights: { WATER: 2 } });
  });
});

describe('BiomeDetail editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serve();
  });

  it('shows a spinner, then the biome\'s settings', async () => {
    renderAt('/biomes/b_frozen');
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Frozen Caves')).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('frozen_caves');
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByLabelText('Shallowest Row')).toHaveValue(90);
    expect(screen.getByLabelText('Deepest Row')).toHaveValue(270);
    expect(screen.getByLabelText('Weight')).toHaveValue(1.5);
    expect(screen.getByLabelText('Region Size')).toHaveValue(60);
    expect(screen.getByLabelText('Wall tint picker')).toHaveValue('#99bbff');
    expect(await screen.findByLabelText('Block Amounts: Silverium')).toHaveValue(2);
    expect(screen.getByLabelText('Fluid Pockets: Oil')).toHaveValue(0);
    expect(await screen.findByLabelText('Mob Spawns: Mole Person')).toHaveValue(1);
    expect(screen.getByLabelText('Share of Dirt swapped (%)')).toHaveValue(50);
  });

  it('shows depth in original blocks beside the field', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    expect(screen.getByText(/30\.0 original blocks/)).toBeInTheDocument();
    expect(screen.getByText(/90\.0 original blocks/)).toBeInTheDocument();
  });

  it('saves every field with PUT, and confirms', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Biome' }));
    expect(await screen.findByText('Biome saved!')).toBeInTheDocument();
    const [url, opts] = lastCall('PUT')!;
    expect(url).toBe('/api/admin/biomes/b_frozen');
    expect(JSON.parse(opts.body)).toMatchObject({
      key: 'frozen_caves', name: 'Ice', weight: 2, minDepth: 90, maxDepth: 270,
      blockPalette: FROZEN.blockPalette, fluidWeights: { OIL: 0 }, mobSpawns: { mob_mole: 1 }, ambient: FROZEN.ambient,
    });
  });

  it('saves "to the bottom" as no deepest row', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    fireEvent.change(screen.getByLabelText('Deepest Row'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Biome' }));
    await screen.findByText('Biome saved!');
    expect(JSON.parse(lastCall('PUT')![1].body).maxDepth).toBeNull();
  });

  it('clears a table by removing its last row', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByLabelText('Mob Spawns: Mole Person');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mole Person from Mob Spawns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Biome' }));
    await screen.findByText('Biome saved!');
    expect(JSON.parse(lastCall('PUT')![1].body).mobSpawns).toBeNull();
  });

  it('refuses a depth window the wrong way round, saving nothing', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    fireEvent.change(screen.getByLabelText('Shallowest Row'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Biome' }));
    expect(await screen.findByText('minDepth cannot be greater than maxDepth')).toBeInTheDocument();
    expect(lastCall('PUT')).toBeUndefined();
  });

  it('shows the server\'s problems when it refuses a save', async () => {
    serve(FROZEN, {});
    const base = mockFetchWithAuth.getMockImplementation()!;
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) =>
      opts?.method === 'PUT' ? ok({ error: 'fluidWeights names an unknown fluid: OIL', errors: ['fluidWeights names an unknown fluid: OIL'] }, 400) : base(url, opts)
    );
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    fireEvent.click(screen.getByRole('button', { name: 'Save Biome' }));
    // The list in the form, and the message as a toast
    expect(await screen.findByText('Please fix:')).toBeInTheDocument();
    expect(screen.getAllByText('fluidWeights names an unknown fluid: OIL').length).toBeGreaterThanOrEqual(1);
  });

  it('shows a spinner on the save button while saving', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    let release: (v: unknown) => void = () => undefined;
    const base = mockFetchWithAuth.getMockImplementation()!;
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) =>
      opts?.method === 'PUT' ? new Promise((resolve) => { release = resolve; }) : base(url, opts)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Biome' }));
    expect(await screen.findByText('Saving...')).toBeInTheDocument();
    release({ ok: true, status: 200, json: async () => FROZEN });
    expect(await screen.findByText('Biome saved!')).toBeInTheDocument();
  });

  it('feeds the preview the other biomes plus this one as edited, with the map\'s blend', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('default:1:D,frozen_caves:1.5:-|0.3'));
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '4' } });
    expect(screen.getByTestId('preview')).toHaveTextContent('default:1:D,frozen_caves:4:-|0.3');
  });

  it('deletes after a confirmation, then returns to the list', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Biome' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
    expect(lastCall('DELETE')![0]).toBe('/api/admin/biomes/b_frozen');
  });

  it('does not delete when the confirmation is cancelled', async () => {
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Biome' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(lastCall('DELETE')).toBeUndefined();
  });

  it('shows the server\'s reason when a delete fails', async () => {
    const base = mockFetchWithAuth.getMockImplementation()!;
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) =>
      opts?.method === 'DELETE' ? ok({ error: 'The default biome cannot be deleted' }, 400) : base(url, opts)
    );
    renderAt('/biomes/b_frozen');
    await screen.findByDisplayValue('Frozen Caves');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Biome' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('The default biome cannot be deleted')).toBeInTheDocument();
  });

  it('says the biome was not found', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/biomes/zzz' ? ok({}, 404) : ok([])));
    renderAt('/biomes/zzz');
    expect(await screen.findByText('Biome not found')).toBeInTheDocument();
  });

  it('shows an error toast when the biome cannot be loaded', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/biomes/b_frozen' ? ok({}, 500) : ok([])));
    renderAt('/biomes/b_frozen');
    expect(await screen.findByText('Failed to fetch biome')).toBeInTheDocument();
  });

  it('still edits the biome when a picker list cannot be loaded, and says so', async () => {
    serve(FROZEN, { '/api/admin/fluids': () => ok({}, 500) });
    renderAt('/biomes/b_frozen');
    expect(await screen.findByDisplayValue('Frozen Caves')).toBeInTheDocument();
    expect(await screen.findByText('Failed to fetch fluids')).toBeInTheDocument();
  });
});

describe('BiomeDetail on the default biome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serve(DEFAULT);
  });

  it('cannot be deleted or un-defaulted', async () => {
    renderAt('/biomes/b_default');
    await screen.findByDisplayValue('Default');
    expect(screen.getByRole('button', { name: 'Delete Biome' })).toBeDisabled();
    expect(screen.getByLabelText('Default biome')).toBeChecked();
    expect(screen.getByLabelText('Default biome')).toBeDisabled();
  });
});

describe('BiomeDetail creating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serve(null);
  });

  it('starts blank, with the key editable, and does not fetch a biome', async () => {
    renderAt('/biomes/new');
    expect(await screen.findByRole('heading', { name: 'New Biome' })).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toBeEnabled();
    expect(screen.getByLabelText('Region Size')).toHaveValue(45);
    expect(mockFetchWithAuth.mock.calls.some(([url]) => url === '/api/admin/biomes/new')).toBe(false);
  });

  it('lowercases the key as it is typed', async () => {
    renderAt('/biomes/new');
    await screen.findByRole('heading', { name: 'New Biome' });
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'Ice_Caves' } });
    expect(screen.getByLabelText('Key')).toHaveValue('ice_caves');
  });

  it('refuses to create without a key and a name, listing what is wrong', async () => {
    renderAt('/biomes/new');
    await screen.findByRole('heading', { name: 'New Biome' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Biome' }));
    expect(await screen.findByText(/key must be lower case/)).toBeInTheDocument();
    expect(screen.getByText('name is required')).toBeInTheDocument();
    expect(lastCall('POST')).toBeUndefined();
  });

  it('creates the biome with POST and opens it', async () => {
    renderAt('/biomes/new');
    await screen.findByRole('heading', { name: 'New Biome' });
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'ice_caves' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ice Caves' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Biome' }));
    expect(await screen.findByText('Biome created!')).toBeInTheDocument();
    const [url, opts] = lastCall('POST')!;
    expect(url).toBe('/api/admin/biomes');
    expect(JSON.parse(opts.body)).toMatchObject({ key: 'ice_caves', name: 'Ice Caves', isDefault: false, minDepth: 0, maxDepth: null, weight: 1 });
  });
});
