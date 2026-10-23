import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ExtractorDetail from './ExtractorDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));
vi.mock('../../../components/ExtractorPreview/ExtractorPreview', () => ({ default: () => <div data-testid="preview" /> }));
vi.mock('./ExtractorSoundEffects/ExtractorSoundEffects', () => ({ default: () => <div data-testid="sounds" /> }));

const saved = {
  id: 'e1', key: 'basic_extractor', name: 'Basic', description: 'The standard one', textureUrl: null, beltTextureUrl: null,
  width: 12, height: 9, entranceOffset: 24, landingSeconds: 3, shaftWidth: 3, buildSecondsPerSegment: 1.5, beltSpeed: 6,
  beltItemSpacing: 1.5, depositItemsPerSecond: 20, unloadItemsPerSecond: 4, beltSegmentHealth: 100, health: 500,
  landingParticleEffectId: null, isDefault: true, soundEffects: null,
};
const json = (body: unknown, ok = true, status = 200) => Promise.resolve({ ok, status, json: async () => body });

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/extractors/:id" element={<ExtractorDetail />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );

describe('ExtractorDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation((url: string) => {
      if (url === '/api/admin/particle-effects') return json([{ id: 'fx1', name: 'Dust' }]);
      if (url === '/api/admin/extractors/e1') return json(saved);
      return json({}, false, 404);
    });
  });

  it('loads an extractor into the form', async () => {
    renderAt('/extractors/e1');
    expect(await screen.findByDisplayValue('Basic')).toBeInTheDocument();
    expect(screen.getByLabelText('Belt Speed (blocks / s)')).toHaveValue(6);
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByTestId('preview')).toBeInTheDocument();
    expect(screen.getByTestId('sounds')).toBeInTheDocument();
  });

  it('saves an edit with a PUT of the whole form', async () => {
    renderAt('/extractors/e1');
    fireEvent.change(await screen.findByLabelText('Belt Speed (blocks / s)'), { target: { value: '9' } });
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ ...saved, beltSpeed: 9 }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Extractor' }));
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/extractors/e1');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toMatchObject({ beltSpeed: 9, name: 'Basic', landingParticleEffectId: null });
  });

  it('shows what is wrong and sends nothing when a value is invalid', async () => {
    renderAt('/extractors/e1');
    fireEvent.change(await screen.findByLabelText('Belt Speed (blocks / s)'), { target: { value: '0' } });
    mockFetchWithAuth.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Save Extractor' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('beltSpeed must be greater than 0');
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it('shows the server\'s answer when a save is refused', async () => {
    renderAt('/extractors/e1');
    await screen.findByDisplayValue('Basic');
    mockFetchWithAuth.mockImplementation(() => json({ error: 'The database is down' }, false, 500));
    fireEvent.click(screen.getByRole('button', { name: 'Save Extractor' }));
    expect(await screen.findByText('The database is down')).toBeInTheDocument();
  });

  it('creates a new extractor from the built-in values and opens it', async () => {
    renderAt('/extractors/new');
    fireEvent.change(await screen.findByLabelText('Key'), { target: { value: 'heavy_extractor' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Heavy' } });
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ ...saved, id: 'e2', key: 'heavy_extractor', name: 'Heavy' }, true, 201));
    fireEvent.click(screen.getByRole('button', { name: 'Create Extractor' }));
    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalled());
    const [url, opts] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('/api/admin/extractors');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ key: 'heavy_extractor', name: 'Heavy', beltSpeed: 6 });
    expect(screen.getByText('Save the extractor first, then you can give it art and sounds.')).toBeInTheDocument();
  });

  it('deletes after a confirmation', async () => {
    renderAt('/extractors/e1');
    await screen.findByDisplayValue('Basic');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Extractor' }));
    mockFetchWithAuth.mockClear();
    mockFetchWithAuth.mockImplementation(() => json({ success: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/extractors'));
    expect(mockFetchWithAuth.mock.calls[0]).toEqual(['/api/admin/extractors/e1', { method: 'DELETE' }]);
  });

  it('says so for a missing extractor', async () => {
    mockFetchWithAuth.mockImplementation((url: string) => (url === '/api/admin/particle-effects' ? json([]) : json({}, false, 404)));
    renderAt('/extractors/ghost');
    expect(await screen.findByText('Extractor not found')).toBeInTheDocument();
  });
});
