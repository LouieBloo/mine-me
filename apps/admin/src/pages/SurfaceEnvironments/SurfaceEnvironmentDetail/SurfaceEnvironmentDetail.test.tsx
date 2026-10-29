import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SurfaceEnvironmentDetail from './SurfaceEnvironmentDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
// The preview and the sound picker have their own tests; here they only need to show what they are given
vi.mock('../../../components/SurfacePreview/SurfacePreview', () => ({ default: ({ environment }: any) => <div data-testid="preview">{environment.key} / {environment.layers.length} layers</div> }));
vi.mock('./SurfaceSoundEffects/SurfaceSoundEffects', () => ({
  default: ({ environment, onSaved }: any) => (
    <div data-testid="sounds">
      sounds for {environment.id}
      <button onClick={() => onSaved({ ...environment, soundEffects: { rain: { soundId: 's1' } }, sounds: { rain: { url: '/a.mp3' } } })}>assign sound</button>
    </div>
  ),
}));

const ENV = {
  id: 'e1', key: 'green_valley', name: 'Green Valley', description: 'Rolling hills', weight: 2, isDefault: false,
  sky: { top: '#2f8fd8', horizon: '#9fd6ff', sunColor: '#fff2b0', sunX: 0.7, sunHeight: 22, sunSize: 3 }, ambientTint: null,
  layers: [{ name: 'far', parallaxFactor: 0.85, yOffset: 0, shape: 'mountains', height: 45 }],
  clouds: { maxCount: 8 }, weather: { clear: 3, rain: 1 }, props: [{ doodadKey: 'oak_tree', density: 5, spacing: 3 }],
};
const DOODADS = [{ key: 'oak_tree', name: 'Oak Tree', anchor: 'FLOOR' }, { key: 'bird', name: 'Bird', anchor: 'AIR' }];
const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/surface-environments" element={<div>LIST PAGE</div>} />
          <Route path="/surface-environments/:id" element={<SurfaceEnvironmentDetail />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const lastCall = (method: string) => mockFetchWithAuth.mock.calls.filter(([, o]) => o?.method === method).pop();

const serve = (env: unknown = ENV) => {
  mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
    if (opts?.method === 'PUT') return ok({ ...(env as object), ...JSON.parse(opts.body) });
    if (opts?.method === 'POST') return ok({ ...JSON.parse(opts.body), id: 'e_new' }, 201);
    if (opts?.method === 'DELETE') return ok({ success: true });
    if (url === '/api/admin/doodads') return ok(DOODADS);
    if (url.startsWith('/api/admin/surface-environments/')) return ok(env);
    return ok([]);
  });
};

describe('SurfaceEnvironmentDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads an environment into the form, with the preview, weather, layers, props and sounds', async () => {
    serve();
    renderAt('/surface-environments/e1');
    expect(await screen.findByDisplayValue('Green Valley')).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('green_valley');
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByLabelText('Weight')).toHaveValue(2);
    expect(screen.getByLabelText('Clear')).toHaveValue(3);
    expect(screen.getByLabelText('Layer 1 name')).toHaveValue('far');
    expect(await screen.findByLabelText('Doodad')).toHaveValue('oak_tree');
    expect(screen.getByTestId('preview')).toHaveTextContent('green_valley / 1 layers');
    expect(screen.getByTestId('sounds')).toHaveTextContent('sounds for e1');
  });

  it('shows a change in the preview as it is made', async () => {
    serve();
    renderAt('/surface-environments/e1');
    await screen.findByDisplayValue('Green Valley');
    fireEvent.click(screen.getByText('+ Add Layer'));
    expect(screen.getByTestId('preview')).toHaveTextContent('2 layers');
  });

  it('saves the changes with a PUT and shows them as saved', async () => {
    serve();
    renderAt('/surface-environments/e1');
    fireEvent.change(await screen.findByLabelText('Weight'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Storm'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Save Environment'));
    await waitFor(() => expect(lastCall('PUT')).toBeTruthy());
    const [url, opts] = lastCall('PUT')!;
    expect(url).toBe('/api/admin/surface-environments/e1');
    expect(JSON.parse(opts.body)).toMatchObject({ weight: 5, weather: { clear: 3, rain: 1, storm: 2 }, props: [{ doodadKey: 'oak_tree', density: 5, spacing: 3 }] });
    expect(await screen.findByText('Environment saved!')).toBeInTheDocument();
  });

  it('creates a new environment and goes to its page', async () => {
    serve();
    renderAt('/surface-environments/new');
    fireEvent.change(await screen.findByLabelText('Key'), { target: { value: 'Snow_Field' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Snow Field' } });
    fireEvent.click(screen.getByText('Create Environment'));
    await waitFor(() => expect(lastCall('POST')).toBeTruthy());
    const [url, opts] = lastCall('POST')!;
    expect(url).toBe('/api/admin/surface-environments');
    expect(JSON.parse(opts.body)).toMatchObject({ key: 'snow_field', name: 'Snow Field' });
    expect(screen.getByText(/Save the environment first, then upload pictures and give it sounds/)).toBeInTheDocument();
  });

  it('refuses to send an environment with problems and lists them', async () => {
    serve();
    renderAt('/surface-environments/new');
    await screen.findByLabelText('Key');
    fireEvent.click(screen.getByText('Create Environment'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('key must be lower case');
    expect(alert).toHaveTextContent('name is required');
    expect(lastCall('POST')).toBeUndefined();
  });

  it('shows the server\'s problems when it refuses the save', async () => {
    mockFetchWithAuth.mockImplementation((url: string, opts?: any) => {
      if (opts?.method === 'PUT') return ok({ error: 'props names an unknown doodad: ghost', errors: ['props names an unknown doodad: ghost'] }, 400);
      if (url === '/api/admin/doodads') return ok(DOODADS);
      return ok(ENV);
    });
    renderAt('/surface-environments/e1');
    await screen.findByDisplayValue('Green Valley');
    fireEvent.click(screen.getByText('Save Environment'));
    expect(await screen.findByText('Please fix:')).toBeInTheDocument();
    expect(screen.getAllByText(/unknown doodad/).length).toBeGreaterThan(0);
  });

  it('shows the error when the doodads cannot be loaded, and still lets the rest be edited', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/doodads' ? ok({}, 500) : ok(ENV)));
    renderAt('/surface-environments/e1');
    expect(await screen.findByText('Failed to fetch doodads')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Green Valley')).toBeInTheDocument();
  });

  it('shows a spinner while loading and "not found" for an environment that is not there', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/surface-environments/gone' ? Promise.resolve({ ok: false, status: 404, json: async () => ({}) }) : ok([])));
    renderAt('/surface-environments/gone');
    expect(document.querySelector('.loading-spinner-container')).toBeInTheDocument();
    expect(await screen.findByText('Environment not found')).toBeInTheDocument();
  });

  it('keeps new sounds from the picker without reloading the page', async () => {
    serve();
    renderAt('/surface-environments/e1');
    fireEvent.click(await screen.findByText('assign sound'));
    expect(screen.getByTestId('sounds')).toBeInTheDocument();
  });

  it('deletes after a confirmation and goes back to the list', async () => {
    serve();
    renderAt('/surface-environments/e1');
    fireEvent.click(await screen.findByText('Delete Environment'));
    expect(await screen.findByText(/Runs already started keep it/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(lastCall('DELETE')).toBeTruthy());
    expect(lastCall('DELETE')![0]).toBe('/api/admin/surface-environments/e1');
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
  });

  it('can back out of a delete', async () => {
    serve();
    renderAt('/surface-environments/e1');
    fireEvent.click(await screen.findByText('Delete Environment'));
    fireEvent.click(await screen.findByText('Cancel'));
    expect(lastCall('DELETE')).toBeUndefined();
  });

  it('will not delete the default environment, or let it be switched off', async () => {
    serve({ ...ENV, isDefault: true });
    renderAt('/surface-environments/e1');
    expect(await screen.findByText('Delete Environment')).toBeDisabled();
    expect(screen.getByLabelText('The environment used when none can be picked')).toBeDisabled();
  });
});
