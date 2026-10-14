import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FluidDetail from './FluidDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
// The preview has its own tests; here it only needs to exist
vi.mock('../../../components/FluidPreview/FluidPreview', () => ({
  default: ({ fluid }: any) => <div data-testid="preview">{fluid.color}|{fluid.flowRate}</div>,
}));

const OIL = {
  id: 'fluid_oil', typeKey: 'OIL', name: 'Oil', description: 'Black', color: '#0b0b0d', opacity: 0.9, density: 0.8, viscosity: 0.6,
  flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02,
  flammability: { ignitionChance: 0.8, spreadChance: 0.5, burnDuration: 8, heat: 3, burnsInto: null },
  generation: { minDepth: 8, maxDepth: null, percentage: 1.5, minSize: 2, maxSize: 4 },
};

const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/fluids" element={<div>LIST PAGE</div>} />
          <Route path="/fluids/:id" element={<FluidDetail />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const lastCall = (method: string) => mockFetchWithAuth.mock.calls.filter(([, o]) => o?.method === method).pop();

describe('FluidDetail editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((_url: string, opts?: any) => {
      if (opts?.method === 'PUT') return ok({ ...OIL, ...JSON.parse(opts.body) });
      if (opts?.method === 'DELETE') return ok({ success: true });
      return ok(OIL);
    });
  });

  it('shows a spinner, then the fluid\'s settings', async () => {
    renderAt('/fluids/fluid_oil');
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Oil')).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('OIL');
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByLabelText('Flow Rate')).toHaveValue(0.35);
    expect(screen.getByLabelText('Viscosity')).toHaveValue(0.6);
    expect(screen.getByLabelText('Can burn')).toBeChecked();
    expect(screen.getByLabelText('Appears in generated mines')).toBeChecked();
    expect(screen.getByTestId('preview')).toHaveTextContent('#0b0b0d|0.35');
  });

  it('saves every field with PUT, and confirms', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.change(screen.getByLabelText('Flow Rate'), { target: { value: '0.2' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Crude Oil' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    expect(await screen.findByText('Fluid saved!')).toBeInTheDocument();
    const [url, opts] = lastCall('PUT')!;
    expect(url).toBe('/api/admin/fluids/fluid_oil');
    expect(JSON.parse(opts.body)).toMatchObject({ name: 'Crude Oil', flowRate: 0.2, typeKey: 'OIL', flammability: OIL.flammability, generation: OIL.generation });
  });

  it('shows the look settings (the defaults when none are stored), saves them, and feeds the preview', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    expect(screen.getByLabelText('Wave Height')).toHaveValue(0.06);
    expect(screen.getByLabelText('Depth Darkening')).toHaveValue(0.35);
    fireEvent.change(screen.getByLabelText('Wave Height'), { target: { value: '0.02' } });
    fireEvent.change(screen.getByLabelText('Wave Speed'), { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    expect(await screen.findByText('Fluid saved!')).toBeInTheDocument();
    expect(JSON.parse(lastCall('PUT')![1].body).appearance).toEqual({
      waveAmplitude: 0.02, waveSpeed: 0.3, highlight: 0.5, depthDarkening: 0.35, depthOpacity: 0.25,
    });
  });

  it('loads the look a fluid already has, keeping defaults for what it leaves out', async () => {
    mockFetchWithAuth.mockImplementation(() => ok({ ...OIL, appearance: { waveAmplitude: 0.01, highlight: 0.9 } }));
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    expect(screen.getByLabelText('Wave Height')).toHaveValue(0.01);
    expect(screen.getByLabelText('Surface Highlight')).toHaveValue(0.9);
    expect(screen.getByLabelText('Wave Speed')).toHaveValue(0.6);
  });

  it('refuses a look setting out of range, naming it', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.change(screen.getByLabelText('Wave Height'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    expect(await screen.findByText(/appearance.waveAmplitude/)).toBeInTheDocument();
    expect(lastCall('PUT')).toBeUndefined();
  });

  it('lets the flames be picked from the particle library and saves the choice', async () => {
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url === '/api/admin/particle-effects') return ok([{ id: 'pe_flame', name: 'Oil Fire' }, { id: 'pe_ember', name: 'Ember' }]);
      if (opts?.method === 'PUT') return ok({ ...OIL, ...JSON.parse(opts.body) });
      return ok(OIL);
    });
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    const select = await screen.findByLabelText('Flame Effect');
    await screen.findByRole('option', { name: 'Oil Fire' });
    fireEvent.change(select, { target: { value: 'pe_flame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    await screen.findByText('Fluid saved!');
    expect(JSON.parse(lastCall('PUT')![1].body).flammability).toMatchObject({ flameEffectId: 'pe_flame', burnDuration: 8 });
  });

  it('still edits the fluid when the particle library cannot be loaded', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/particle-effects' ? Promise.reject(new Error('down')) : ok(OIL)));
    renderAt('/fluids/fluid_oil');
    expect(await screen.findByDisplayValue('Oil')).toBeInTheDocument();
    expect(screen.getByLabelText('Flame Effect')).toBeInTheDocument();
  });

  it('shows the sounds panel for a saved fluid, and keeps the sounds the server reports', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    expect(await screen.findByTestId('fluid-sounds')).toBeInTheDocument();
    expect(screen.queryByText('Save the fluid first, then you can give it sounds.')).not.toBeInTheDocument();
  });

  it('feeds the live preview as settings change', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.change(screen.getByLabelText('Flow Rate'), { target: { value: '0.9' } });
    fireEvent.change(screen.getByLabelText('Colour picker'), { target: { value: '#ff0000' } });
    expect(screen.getByTestId('preview')).toHaveTextContent('#ff0000|0.9');
  });

  it('saves null when "Can burn" and generation are switched off', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.click(screen.getByLabelText('Can burn'));
    fireEvent.click(screen.getByLabelText('Appears in generated mines'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    await screen.findByText('Fluid saved!');
    expect(JSON.parse(lastCall('PUT')![1].body)).toMatchObject({ flammability: null, generation: null });
  });

  it('does not send an invalid fluid, and lists every problem', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.change(screen.getByLabelText('Flow Rate'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('flowRate');
    expect(alert).toHaveTextContent('opacity');
    expect(lastCall('PUT')).toBeUndefined();
  });

  it('clears the problem list once the form is edited again', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.change(screen.getByLabelText('Flow Rate'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Flow Rate'), { target: { value: '0.5' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the server\'s error and its list of problems when a save is refused', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) =>
      opts?.method === 'PUT' ? ok({ error: 'flowRate nope', errors: ['flowRate nope', 'server only rule'] }, 400) : ok(OIL)
    );
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    // The problem list on the form, plus the error toast
    expect(await screen.findByText('server only rule')).toBeInTheDocument();
    expect((await screen.findAllByText('flowRate nope')).length).toBeGreaterThan(1);
  });

  it('shows an error when the save request itself fails, and lets the user try again', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) => (opts?.method === 'PUT' ? Promise.reject(new Error('Network down')) : ok(OIL)));
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.click(screen.getByRole('button', { name: 'Save Fluid' }));
    expect(await screen.findByText('Network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Fluid' })).toBeEnabled();
  });

  it('says so when the fluid does not exist', async () => {
    mockFetchWithAuth.mockImplementation(() => ok({ error: 'Fluid not found' }, 404));
    renderAt('/fluids/nope');
    expect(await screen.findByText('Fluid not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Fluids' }));
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    mockFetchWithAuth.mockImplementation(() => ok({}, 500));
    renderAt('/fluids/fluid_oil');
    expect(await screen.findByText('Failed to fetch fluid')).toBeInTheDocument();
  });

  it('asks before deleting, deletes, and goes back to the list', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Fluid' }));
    expect(await screen.findByText(/This cannot be undone/)).toBeInTheDocument();
    expect(lastCall('DELETE')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
    expect(lastCall('DELETE')![0]).toBe('/api/admin/fluids/fluid_oil');
  });

  it('cancelling the delete keeps the fluid', async () => {
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Fluid' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/This cannot be undone/)).not.toBeInTheDocument());
    expect(lastCall('DELETE')).toBeUndefined();
  });

  it('shows the error and stays when a delete fails', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) => (opts?.method === 'DELETE' ? ok({ error: 'In use by Dirt' }, 409) : ok(OIL)));
    renderAt('/fluids/fluid_oil');
    await screen.findByDisplayValue('Oil');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Fluid' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('In use by Dirt')).toBeInTheDocument();
    expect(screen.queryByText('LIST PAGE')).not.toBeInTheDocument();
  });
});

describe('FluidDetail creating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) =>
      opts?.method === 'POST' ? ok({ ...JSON.parse(opts.body), id: 'fluid_new' }, 201) : ok(OIL)
    );
  });

  it('starts with an empty, editable form that does not burn and is not generated', async () => {
    renderAt('/fluids/new');
    expect(screen.getByRole('heading', { name: 'New Fluid' })).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toBeEnabled();
    expect(screen.getByLabelText('Key')).toHaveValue('');
    expect(screen.getByLabelText('Can burn')).not.toBeChecked();
    expect(screen.getByLabelText('Appears in generated mines')).not.toBeChecked();
    // Only the particle library is fetched; there is no fluid to load
    expect(mockFetchWithAuth.mock.calls.every(([url]) => url === '/api/admin/particle-effects')).toBe(true);
  });

  it('upper-cases the key, rejects an empty name, then creates with POST and opens the new fluid', async () => {
    renderAt('/fluids/new');
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'water' } });
    expect(screen.getByLabelText('Key')).toHaveValue('WATER');
    fireEvent.click(screen.getByRole('button', { name: 'Create Fluid' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('name is required');
    expect(lastCall('POST')).toBeUndefined();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Water ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Fluid' }));
    expect(await screen.findByText('Fluid created!')).toBeInTheDocument();
    const [url, opts] = lastCall('POST')!;
    expect(url).toBe('/api/admin/fluids');
    expect(JSON.parse(opts.body)).toMatchObject({ typeKey: 'WATER', name: 'Water', flammability: null, generation: null });
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/admin/fluids/fluid_new'));
  });

  it('asks the owner to save the fluid before it can have sounds', () => {
    renderAt('/fluids/new');
    expect(screen.getByText('Save the fluid first, then you can give it sounds.')).toBeInTheDocument();
    expect(screen.queryByTestId('fluid-sounds')).not.toBeInTheDocument();
  });

  it('has no delete button until the fluid exists', () => {
    renderAt('/fluids/new');
    expect(screen.queryByRole('button', { name: 'Delete Fluid' })).not.toBeInTheDocument();
  });

  it('shows a duplicate-key refusal from the server', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) =>
      opts?.method === 'POST' ? ok({ error: 'A fluid with the key OIL already exists' }, 409) : ok(OIL)
    );
    renderAt('/fluids/new');
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'oil' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Another' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Fluid' }));
    expect(await screen.findByText('A fluid with the key OIL already exists')).toBeInTheDocument();
  });
});
