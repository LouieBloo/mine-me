import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SURFACE_ENVIRONMENT, type SurfaceEnvironmentDefinition } from '@mine-me/shared';

const fetchWithAuth = vi.fn();
const toast = { error: vi.fn(), success: vi.fn() };
const navigate = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth }) }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual<any>('react-router-dom')), useNavigate: () => navigate }));

import SurfaceEnvironments, { weatherSummary } from './SurfaceEnvironments';

const env = (patch: Partial<SurfaceEnvironmentDefinition>): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, ...patch });
const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const renderIt = () => render(<MemoryRouter><SurfaceEnvironments /></MemoryRouter>);

beforeEach(() => {
  fetchWithAuth.mockReset();
  toast.error.mockReset();
  navigate.mockReset();
});

describe('weatherSummary', () => {
  it('lists the weather kinds in use, most likely first', () => {
    expect(weatherSummary({ weather: { clear: 2, rain: 5, storm: 0 } })).toBe('Rain, Clear');
  });
  it('says always clear with no weather', () => {
    expect(weatherSummary({ weather: null })).toBe('Always clear');
    expect(weatherSummary({ weather: {} })).toBe('Always clear');
  });
});

describe('SurfaceEnvironments', () => {
  it('lists each environment with its weather, scenery and props, and marks the default', async () => {
    fetchWithAuth.mockReturnValue(ok([
      env({ id: 'e1', key: 'green_valley', name: 'Green Valley', isDefault: true, weather: { clear: 3, rain: 1 }, layers: [{ name: 'a', parallaxFactor: 0.5, yOffset: 0 }, { name: 'b', parallaxFactor: 0.5, yOffset: 0 }], props: [{ doodadKey: 'tree', density: 1 }] }),
      env({ id: 'e2', key: 'snowfield', name: 'Snowfield', isDefault: false, weather: { snow: 1 }, layers: [] }),
    ]));
    renderIt();
    expect(await screen.findByText('Green Valley')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Clear, Rain')).toBeInTheDocument();
    expect(screen.getByText('2 layers')).toBeInTheDocument();
    expect(screen.getByText('0 layers')).toBeInTheDocument();
    expect(screen.getByText('Snow')).toBeInTheDocument();
  });

  it('opens an environment, and starts a new one', async () => {
    fetchWithAuth.mockReturnValue(ok([env({ id: 'e1', key: 'a', name: 'A', isDefault: false })]));
    renderIt();
    fireEvent.click(await screen.findByText('Edit'));
    expect(navigate).toHaveBeenCalledWith('/surface-environments/e1');
    fireEvent.click(screen.getByText('+ New Environment'));
    expect(navigate).toHaveBeenCalledWith('/surface-environments/new');
  });

  it('says so when there are none', async () => {
    fetchWithAuth.mockReturnValue(ok([]));
    renderIt();
    expect(await screen.findByText('No environments yet.')).toBeInTheDocument();
  });

  it('shows the error when the list cannot be loaded', async () => {
    fetchWithAuth.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    renderIt();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to fetch surface environments'));
    expect(screen.getByText('No environments yet.')).toBeInTheDocument();
  });

  it('shows the spinner while loading', () => {
    fetchWithAuth.mockReturnValue(new Promise(() => undefined));
    renderIt();
    expect(screen.queryByText('No environments yet.')).not.toBeInTheDocument();
  });
});
