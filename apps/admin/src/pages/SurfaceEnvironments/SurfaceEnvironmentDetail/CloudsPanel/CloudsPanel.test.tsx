import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fetchWithAuth = vi.fn();
const toast = { error: vi.fn(), success: vi.fn() };
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth }) }));
vi.mock('../../../../contexts/ToastContext', () => ({ useToast: () => toast }));

import CloudsPanel from './CloudsPanel';

const base = { cloudMax: 8, cloudMinHeight: 8, cloudMaxHeight: 22, cloudTextures: [] as string[] };
const renderIt = (form = base, environmentId: string = 'e1') => {
  const onChange = vi.fn();
  render(<CloudsPanel form={form} environmentId={environmentId} onChange={onChange} />);
  return onChange;
};

beforeEach(() => {
  fetchWithAuth.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('CloudsPanel', () => {
  it('sets how many clouds, and the band they drift in', () => {
    const onChange = renderIt();
    fireEvent.change(screen.getByLabelText('Most Clouds'), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith('cloudMax', 12);
    fireEvent.change(screen.getByLabelText('Lowest (blocks)'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith('cloudMinHeight', 5);
    fireEvent.change(screen.getByLabelText('Highest (blocks)'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('cloudMaxHeight', NaN);
  });

  it('says soft shapes are drawn when there are no pictures', () => {
    renderIt();
    expect(screen.getByText(/soft cloud shapes are drawn in code/)).toBeInTheDocument();
  });

  it('lists the pictures and removes one', () => {
    const onChange = renderIt({ ...base, cloudTextures: ['/assets/a.png', '/assets/b.png'] });
    expect(screen.getByText('/assets/b.png')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove cloud picture 1'));
    expect(onChange).toHaveBeenCalledWith('cloudTextures', ['/assets/b.png']);
  });

  it('uploads a picture and adds its url to the list', async () => {
    fetchWithAuth.mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: '/assets/sprites/surface/e1-cloud_2.png?v=3' }) });
    const onChange = renderIt({ ...base, cloudTextures: ['/assets/a.png'] });
    fireEvent.change(screen.getByLabelText('Upload cloud picture'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('cloudTextures', ['/assets/a.png', '/assets/sprites/surface/e1-cloud_2.png?v=3']));
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/admin/surface-environments/e1/images/cloud_2', expect.anything());
  });

  it('shows the server\'s reason when an upload fails', async () => {
    fetchWithAuth.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'No image file provided' }) });
    const onChange = renderIt();
    fireEvent.change(screen.getByLabelText('Upload cloud picture'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No image file provided'));
    expect(onChange).not.toHaveBeenCalledWith('cloudTextures', expect.anything());
  });

  it('cannot add pictures before the environment is saved, or past six', () => {
    renderIt(base, '');
    expect(screen.getByText('+ Add Cloud Picture')).toBeDisabled();
    expect(screen.getByText('Save the environment first, then upload pictures.')).toBeInTheDocument();
  });

  it('stops at six pictures', () => {
    renderIt({ ...base, cloudTextures: Array.from({ length: 6 }, (_, i) => `/assets/${i}.png`) });
    expect(screen.getByText('+ Add Cloud Picture')).toBeDisabled();
    expect(screen.getByText('At most 6 pictures.')).toBeInTheDocument();
  });
});
