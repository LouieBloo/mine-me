import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SurfaceLayerDef } from '@mine-me/shared';

const fetchWithAuth = vi.fn();
const toast = { error: vi.fn(), success: vi.fn() };
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth }) }));
vi.mock('../../../../contexts/ToastContext', () => ({ useToast: () => toast }));

import LayersEditor from './LayersEditor';

const far: SurfaceLayerDef = { name: 'far', parallaxFactor: 0.85, yOffset: 0, shape: 'mountains', height: 45, tint: '#8da2c2' };
const near: SurfaceLayerDef = { name: 'near', parallaxFactor: 0.5, yOffset: 2, textureUrl: '/assets/sprites/surface/e1-near.png', scale: 2 };

const renderIt = (layers: SurfaceLayerDef[], environmentId: string | undefined = 'e1') => {
  const onChange = vi.fn();
  render(<LayersEditor layers={layers} environmentId={environmentId} onChange={onChange} />);
  return onChange;
};

beforeEach(() => {
  fetchWithAuth.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('LayersEditor', () => {
  it('says so when there is no scenery and adds the first layer (far mountains)', () => {
    const onChange = renderIt([]);
    expect(screen.getByText(/No scenery/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Add Layer'));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ shape: 'mountains', parallaxFactor: 0.85 })]);
  });

  it('adds a nearer layer after the existing ones', () => {
    const onChange = renderIt([far]);
    fireEvent.click(screen.getByText('+ Add Layer'));
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
    expect(onChange.mock.calls[0][0][1].parallaxFactor).toBeLessThan(0.85);
  });

  it('edits a layer\'s name, parallax, offset, opacity and tint without touching the others', () => {
    const onChange = renderIt([far, near]);
    fireEvent.change(screen.getByLabelText('Layer 1 name'), { target: { value: 'distant' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...far, name: 'distant' }, near]);
    fireEvent.change(screen.getAllByLabelText('Parallax (0-1)')[1], { target: { value: '0.4' } });
    expect(onChange).toHaveBeenLastCalledWith([far, { ...near, parallaxFactor: 0.4 }]);
    fireEvent.change(screen.getAllByLabelText('Offset (blocks)')[0], { target: { value: '-3' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...far, yOffset: -3 }, near]);
    fireEvent.change(screen.getAllByLabelText('Opacity (0-1)')[0], { target: { value: '0.5' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...far, alpha: 0.5 }, near]);
    fireEvent.change(screen.getAllByLabelText('Tint')[0], { target: { value: '#112233' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...far, tint: '#112233' }, near]);
    fireEvent.click(screen.getByLabelText('Clear layer 1 tint'));
    expect(onChange).toHaveBeenLastCalledWith([{ ...far, tint: null }, near]);
  });

  it('shows silhouette settings for a layer without a picture and picture scale for one with', () => {
    renderIt([far, near]);
    expect(screen.getByLabelText('Silhouette')).toHaveValue('mountains');
    expect(screen.getByLabelText('Height (blocks)')).toHaveValue(45);
    expect(screen.getByLabelText('Picture scale')).toHaveValue(2);
  });

  it('changes the silhouette, its height and the picture scale', () => {
    const onChange = renderIt([far, near]);
    fireEvent.change(screen.getByLabelText('Silhouette'), { target: { value: 'treeline' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...far, shape: 'treeline' }, near]);
    fireEvent.change(screen.getByLabelText('Height (blocks)'), { target: { value: '60' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...far, height: 60 }, near]);
    fireEvent.change(screen.getByLabelText('Picture scale'), { target: { value: '1.5' } });
    expect(onChange).toHaveBeenLastCalledWith([far, { ...near, scale: 1.5 }]);
  });

  it('moves a layer farther or nearer, with the end ones unable to go further', () => {
    const onChange = renderIt([far, near]);
    expect(screen.getByLabelText('Move layer 1 up')).toBeDisabled();
    expect(screen.getByLabelText('Move layer 2 down')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Move layer 1 down'));
    expect(onChange).toHaveBeenLastCalledWith([near, far]);
    fireEvent.click(screen.getByLabelText('Move layer 2 up'));
    expect(onChange).toHaveBeenLastCalledWith([near, far]);
  });

  it('removes a layer', () => {
    const onChange = renderIt([far, near]);
    fireEvent.click(screen.getByLabelText('Remove layer 1'));
    expect(onChange).toHaveBeenCalledWith([near]);
  });

  it('types a picture url, and clears it back to a silhouette', () => {
    const onChange = renderIt([far, near]);
    fireEvent.change(screen.getByLabelText('Layer 1 picture'), { target: { value: ' /assets/x.png ' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...far, textureUrl: '/assets/x.png' }, near]);
    fireEvent.click(screen.getByLabelText('Clear layer 2 picture'));
    expect(onChange).toHaveBeenLastCalledWith([far, { ...near, textureUrl: null }]);
    expect(screen.getByLabelText('Clear layer 1 picture')).toBeDisabled();
  });

  it('uploads a picture and sets the layer to the new url', async () => {
    fetchWithAuth.mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: '/assets/sprites/surface/e1-far.png?v=9' }) });
    const onChange = renderIt([far]);
    fireEvent.change(screen.getByLabelText('Upload layer 1 picture'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ ...far, textureUrl: '/assets/sprites/surface/e1-far.png?v=9' }]));
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/admin/surface-environments/e1/images/far', expect.objectContaining({ method: 'POST' }));
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows the reason when an upload fails, and keeps the layer as it was', async () => {
    fetchWithAuth.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'Only PNG or JPG images are allowed' }) });
    const onChange = renderIt([far]);
    fireEvent.change(screen.getByLabelText('Upload layer 1 picture'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Only PNG or JPG images are allowed'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a PNG or JPG without calling the server', async () => {
    renderIt([far]);
    fireEvent.change(screen.getByLabelText('Upload layer 1 picture'), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Only PNG or JPG images are allowed.'));
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('cannot upload before the environment is saved', () => {
    renderIt([far], '');
    expect(screen.getByText('Upload Picture')).toBeDisabled();
    expect(screen.getByText('Save the environment first, then upload pictures.')).toBeInTheDocument();
  });

  it('offers to replace a picture that is there', () => {
    renderIt([near]);
    expect(screen.getByText('Replace Picture')).toBeEnabled();
  });
});
