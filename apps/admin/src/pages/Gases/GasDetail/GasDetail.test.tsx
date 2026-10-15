import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GasDetail from './GasDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
// The preview has its own tests; here it only needs to exist
vi.mock('../../../components/GasPreview/GasPreview', () => ({
  default: ({ gas }: any) => <div data-testid="preview">{gas.color}|{gas.diffusionRate}</div>,
}));

const HYDROGEN = {
  id: 'gas_h2', typeKey: 'HYDROGEN', name: 'Hydrogen', description: 'Light', color: '#dff1ff', opacity: 0.35, density: 0.07,
  diffusionRate: 0.35, minConcentration: 0.02, ventLifetime: 6,
  flammability: { ignitionChance: 0.9, spreadChance: 1, burnDuration: 0.5, heat: 4, burnsInto: null },
  generation: { minDepth: 3, maxDepth: null, percentage: 3, minSize: 2, maxSize: 4, concentration: 1 },
};

const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/gases" element={<div>LIST PAGE</div>} />
          <Route path="/gases/:id" element={<GasDetail />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const lastCall = (method: string) => mockFetchWithAuth.mock.calls.filter(([, o]) => o?.method === method).pop();

describe('GasDetail editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((_url: string, opts?: any) => {
      if (opts?.method === 'PUT') return ok({ ...HYDROGEN, ...JSON.parse(opts.body) });
      if (opts?.method === 'DELETE') return ok({ success: true });
      return ok(HYDROGEN);
    });
  });

  it('shows a spinner, then the gas\'s settings', async () => {
    renderAt('/gases/gas_h2');
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Hydrogen')).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('HYDROGEN');
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByLabelText('Spread Rate')).toHaveValue(0.35);
    expect(screen.getByLabelText('Density')).toHaveValue(0.07);
    expect(screen.getByLabelText('Minimum Concentration')).toHaveValue(0.02);
    expect(screen.getByLabelText('Open-Air Lifetime (s)')).toHaveValue(6);
    expect(screen.getByLabelText('Can burn')).toBeChecked();
    expect(screen.getByLabelText('Appears in generated mines')).toBeChecked();
    expect(screen.getByTestId('preview')).toHaveTextContent('#dff1ff|0.35');
  });

  it('saves every field with PUT, and confirms', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.change(screen.getByLabelText('Spread Rate'), { target: { value: '0.2' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hydrogen Gas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    expect(await screen.findByText('Gas saved!')).toBeInTheDocument();
    const [url, opts] = lastCall('PUT')!;
    expect(url).toBe('/api/admin/gases/gas_h2');
    expect(JSON.parse(opts.body)).toMatchObject({ name: 'Hydrogen Gas', diffusionRate: 0.2, typeKey: 'HYDROGEN', flammability: HYDROGEN.flammability, generation: HYDROGEN.generation });
  });

  it('shows the look settings (the defaults when none are stored), saves them, and feeds the preview', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    expect(screen.getByLabelText('Softness')).toHaveValue(0.6);
    expect(screen.getByLabelText('Drift Amount')).toHaveValue(0.15);
    fireEvent.change(screen.getByLabelText('Softness'), { target: { value: '0.2' } });
    fireEvent.change(screen.getByLabelText('Drift Speed'), { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    expect(await screen.findByText('Gas saved!')).toBeInTheDocument();
    expect(JSON.parse(lastCall('PUT')![1].body).appearance).toEqual({
      softness: 0.2, driftSpeed: 0.3, driftAmount: 0.15,
    });
  });

  it('loads the look a gas already has, keeping defaults for what it leaves out', async () => {
    mockFetchWithAuth.mockImplementation(() => ok({ ...HYDROGEN, appearance: { softness: 0.1, driftAmount: 0.4 } }));
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    expect(screen.getByLabelText('Softness')).toHaveValue(0.1);
    expect(screen.getByLabelText('Drift Amount')).toHaveValue(0.4);
    expect(screen.getByLabelText('Drift Speed')).toHaveValue(0.3);
  });

  it('refuses a look setting out of range, naming it', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.change(screen.getByLabelText('Softness'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    expect(await screen.findByText(/appearance.softness/)).toBeInTheDocument();
    expect(lastCall('PUT')).toBeUndefined();
  });

  it('lets the flames be picked from the particle library and saves the choice', async () => {
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (url === '/api/admin/particle-effects') return ok([{ id: 'pe_flame', name: 'Hydrogen Flame' }, { id: 'pe_ember', name: 'Ember' }]);
      if (opts?.method === 'PUT') return ok({ ...HYDROGEN, ...JSON.parse(opts.body) });
      return ok(HYDROGEN);
    });
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    const select = await screen.findByLabelText('Flame / Explosion Effect');
    await screen.findByRole('option', { name: 'Hydrogen Flame' });
    fireEvent.change(select, { target: { value: 'pe_flame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    await screen.findByText('Gas saved!');
    expect(JSON.parse(lastCall('PUT')![1].body).flammability).toMatchObject({ flameEffectId: 'pe_flame', burnDuration: 0.5 });
  });

  it('still edits the gas when the particle library cannot be loaded', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/particle-effects' ? Promise.reject(new Error('down')) : ok(HYDROGEN)));
    renderAt('/gases/gas_h2');
    expect(await screen.findByDisplayValue('Hydrogen')).toBeInTheDocument();
    expect(screen.getByLabelText('Flame / Explosion Effect')).toBeInTheDocument();
  });

  it('shows the sounds panel for a saved gas, and keeps the sounds the server reports', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    expect(await screen.findByTestId('gas-sounds')).toBeInTheDocument();
    expect(screen.queryByText('Save the gas first, then you can give it sounds.')).not.toBeInTheDocument();
  });

  it('feeds the live preview as settings change', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.change(screen.getByLabelText('Spread Rate'), { target: { value: '0.9' } });
    fireEvent.change(screen.getByLabelText('Colour picker'), { target: { value: '#ff0000' } });
    expect(screen.getByTestId('preview')).toHaveTextContent('#ff0000|0.9');
  });

  it('saves the starting concentration of the pockets with the rest of the generation settings', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.change(screen.getByLabelText('Starting Concentration'), { target: { value: '0.6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    await screen.findByText('Gas saved!');
    expect(JSON.parse(lastCall('PUT')![1].body).generation).toEqual({ ...HYDROGEN.generation, concentration: 0.6 });
  });

  it('refuses a density of zero and an open-air lifetime of zero, naming both', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.change(screen.getByLabelText('Density'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Open-Air Lifetime (s)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('density');
    expect(alert).toHaveTextContent('ventLifetime');
    expect(lastCall('PUT')).toBeUndefined();
  });

  it('saves a gas\'s explosion settings with its flammability, and refuses a zero blast radius', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) => {
      if (opts?.method === 'PUT') return ok({ ...HYDROGEN, ...JSON.parse(opts.body) });
      return ok({ ...HYDROGEN, flammability: { ...HYDROGEN.flammability, explosion: { blastRadius: 3, damage: 8, frontSpeed: 3 } } });
    });
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    expect(screen.getByLabelText('Explodes when lit')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Damage per Cell'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Blast Radius'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('explosion.blastRadius');
    expect(lastCall('PUT')).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Blast Radius'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    await screen.findByText('Gas saved!');
    expect(JSON.parse(lastCall('PUT')![1].body).flammability.explosion).toMatchObject({ blastRadius: 4, damage: 20, frontSpeed: 3 });
  });

  it('saves null when "Can burn" and generation are switched off', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.click(screen.getByLabelText('Can burn'));
    fireEvent.click(screen.getByLabelText('Appears in generated mines'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    await screen.findByText('Gas saved!');
    expect(JSON.parse(lastCall('PUT')![1].body)).toMatchObject({ flammability: null, generation: null });
  });

  it('does not send an invalid gas, and lists every problem', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.change(screen.getByLabelText('Spread Rate'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('diffusionRate');
    expect(alert).toHaveTextContent('opacity');
    expect(lastCall('PUT')).toBeUndefined();
  });

  it('clears the problem list once the form is edited again', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.change(screen.getByLabelText('Spread Rate'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Spread Rate'), { target: { value: '0.5' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the server\'s error and its list of problems when a save is refused', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) =>
      opts?.method === 'PUT' ? ok({ error: 'diffusionRate nope', errors: ['diffusionRate nope', 'server only rule'] }, 400) : ok(HYDROGEN)
    );
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    // The problem list on the form, plus the error toast
    expect(await screen.findByText('server only rule')).toBeInTheDocument();
    expect((await screen.findAllByText('diffusionRate nope')).length).toBeGreaterThan(1);
  });

  it('shows an error when the save request itself fails, and lets the user try again', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) => (opts?.method === 'PUT' ? Promise.reject(new Error('Network down')) : ok(HYDROGEN)));
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.click(screen.getByRole('button', { name: 'Save Gas' }));
    expect(await screen.findByText('Network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Gas' })).toBeEnabled();
  });

  it('says so when the gas does not exist', async () => {
    mockFetchWithAuth.mockImplementation(() => ok({ error: 'Gas not found' }, 404));
    renderAt('/gases/nope');
    expect(await screen.findByText('Gas not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Gases' }));
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    mockFetchWithAuth.mockImplementation(() => ok({}, 500));
    renderAt('/gases/gas_h2');
    expect(await screen.findByText('Failed to fetch gas')).toBeInTheDocument();
  });

  it('asks before deleting, deletes, and goes back to the list', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gas' }));
    expect(await screen.findByText(/This cannot be undone/)).toBeInTheDocument();
    expect(lastCall('DELETE')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
    expect(lastCall('DELETE')![0]).toBe('/api/admin/gases/gas_h2');
  });

  it('cancelling the delete keeps the gas', async () => {
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gas' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/This cannot be undone/)).not.toBeInTheDocument());
    expect(lastCall('DELETE')).toBeUndefined();
  });

  it('shows the error and stays when a delete fails', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) => (opts?.method === 'DELETE' ? ok({ error: 'In use by Dirt' }, 409) : ok(HYDROGEN)));
    renderAt('/gases/gas_h2');
    await screen.findByDisplayValue('Hydrogen');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gas' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('In use by Dirt')).toBeInTheDocument();
    expect(screen.queryByText('LIST PAGE')).not.toBeInTheDocument();
  });
});

describe('GasDetail creating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) =>
      opts?.method === 'POST' ? ok({ ...JSON.parse(opts.body), id: 'gas_new' }, 201) : ok(HYDROGEN)
    );
  });

  it('starts with an empty, editable form that does not burn and is not generated', async () => {
    renderAt('/gases/new');
    expect(screen.getByRole('heading', { name: 'New Gas' })).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toBeEnabled();
    expect(screen.getByLabelText('Key')).toHaveValue('');
    expect(screen.getByLabelText('Can burn')).not.toBeChecked();
    expect(screen.getByLabelText('Appears in generated mines')).not.toBeChecked();
    // Only the particle library is fetched; there is no gas to load
    expect(mockFetchWithAuth.mock.calls.every(([url]) => url === '/api/admin/particle-effects')).toBe(true);
  });

  it('upper-cases the key, rejects an empty name, then creates with POST and opens the new gas', async () => {
    renderAt('/gases/new');
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'nitrogen' } });
    expect(screen.getByLabelText('Key')).toHaveValue('NITROGEN');
    fireEvent.click(screen.getByRole('button', { name: 'Create Gas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('name is required');
    expect(lastCall('POST')).toBeUndefined();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Nitrogen ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Gas' }));
    expect(await screen.findByText('Gas created!')).toBeInTheDocument();
    const [url, opts] = lastCall('POST')!;
    expect(url).toBe('/api/admin/gases');
    expect(JSON.parse(opts.body)).toMatchObject({ typeKey: 'NITROGEN', name: 'Nitrogen', flammability: null, generation: null });
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/admin/gases/gas_new'));
  });

  it('asks the owner to save the gas before it can have sounds', () => {
    renderAt('/gases/new');
    expect(screen.getByText('Save the gas first, then you can give it sounds.')).toBeInTheDocument();
    expect(screen.queryByTestId('gas-sounds')).not.toBeInTheDocument();
  });

  it('has no delete button until the gas exists', () => {
    renderAt('/gases/new');
    expect(screen.queryByRole('button', { name: 'Delete Gas' })).not.toBeInTheDocument();
  });

  it('shows a duplicate-key refusal from the server', async () => {
    mockFetchWithAuth.mockImplementation((_u: string, opts?: any) =>
      opts?.method === 'POST' ? ok({ error: 'A gas with the key HYDROGEN already exists' }, 409) : ok(HYDROGEN)
    );
    renderAt('/gases/new');
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'oil' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Another' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Gas' }));
    expect(await screen.findByText('A gas with the key HYDROGEN already exists')).toBeInTheDocument();
  });
});
