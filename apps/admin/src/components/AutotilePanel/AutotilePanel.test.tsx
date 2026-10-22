import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DEFAULT_AUTOTILE_STYLE } from '@mine-me/shared';
import AutotilePanel, { drawAutotilePreview } from './AutotilePanel';

/** A canvas context that records the drawing calls it receives. */
const recordingContext = () => {
  const calls: string[] = [];
  const ctx: any = new Proxy(
    { fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '' },
    {
      get: (target: any, prop: string) => (prop in target ? target[prop] : (..._args: unknown[]) => { calls.push(prop); return { addColorStop() {} }; }),
      set: (target: any, prop: string, value: unknown) => { target[prop] = value; return true; },
    }
  );
  return { ctx, calls };
};

describe('AutotilePanel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('shows only the switch and the preview while the level uses its fallback', () => {
    render(<AutotilePanel value={null} onChange={vi.fn()} inheritLabel="Map default" />);
    expect(screen.getByLabelText('Custom look')).not.toBeChecked();
    expect(screen.getByText('Map default')).toBeInTheDocument();
    expect(screen.getByTestId('autotile-preview')).toBeInTheDocument();
    expect(screen.queryByLabelText('Corner Radius')).not.toBeInTheDocument();
  });

  it('switching to a custom look sends an empty override, and switching back clears it', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AutotilePanel value={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Custom look'));
    expect(onChange).toHaveBeenLastCalledWith({});
    rerender(<AutotilePanel value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Custom look'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows the fallback values in the fields and saves only the field that was changed', () => {
    const onChange = vi.fn();
    render(<AutotilePanel value={{}} inherited={{ radius: 0.4 }} onChange={onChange} />);
    expect(screen.getByLabelText('Corner Radius')).toHaveValue(0.4);
    expect(screen.getByLabelText('Rim Width')).toHaveValue(DEFAULT_AUTOTILE_STYLE.rimWidth);
    fireEvent.change(screen.getByLabelText('Rim Strength'), { target: { value: '0.8' } });
    expect(onChange).toHaveBeenLastCalledWith({ rimStrength: 0.8 });
  });

  it('keeps the other overrides when one field changes', () => {
    const onChange = vi.fn();
    render(<AutotilePanel value={{ radius: 0.1 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Rim Colour'), { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenLastCalledWith({ radius: 0.1, rimColor: '#ff0000' });
  });

  it('offers "Use default" only for a field that is overridden, and it drops just that field', () => {
    const onChange = vi.fn();
    render(<AutotilePanel value={{ radius: 0.1, rimWidth: 0.3 }} onChange={onChange} />);
    const resets = screen.getAllByRole('button', { name: 'Use default' });
    expect(resets).toHaveLength(2);
    fireEvent.click(resets[0]);
    expect(onChange).toHaveBeenLastCalledWith({ rimWidth: 0.3 });
  });

  it('draws the preview from the resolved look when a canvas is available', () => {
    const { ctx, calls } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    drawAutotilePreview(document.createElement('canvas'), document.createElement('canvas'), DEFAULT_AUTOTILE_STYLE);
    // Some cells of the sample cave have an exposed side, so rims (gradients) and rounded corners (arcs) are drawn
    expect(calls).toContain('createLinearGradient');
    expect(calls).toContain('arc');
    expect(calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(10);
  });

  it('does nothing, without failing, when the browser has no canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => drawAutotilePreview(document.createElement('canvas'), document.createElement('canvas'), DEFAULT_AUTOTILE_STYLE)).not.toThrow();
  });
});
