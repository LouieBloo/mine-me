import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GasPreview, { PREVIEW_STEP_MS, drawPreview, type GasPreviewSettings } from './GasPreview';
import { PREVIEW_WIDTH, PreviewScene, SPOUT } from './previewScene';

const GAS: GasPreviewSettings = { color: '#dff1ff', opacity: 0.4, density: 0.07, diffusionRate: 0.35, minConcentration: 0.02, ventLifetime: 6 };

/** A canvas context that records what is drawn. */
function recorder() {
  const calls: Array<{ op: string; args: unknown[]; fillStyle: string }> = [];
  const ctx: any = { fillStyle: '', globalAlpha: 1 };
  for (const op of ['clearRect', 'fillRect', 'beginPath', 'arc', 'fill']) ctx[op] = (...args: unknown[]) => calls.push({ op, args, fillStyle: ctx.fillStyle });
  return { ctx, calls };
}

describe('drawPreview', () => {
  const scene = new PreviewScene({ density: 0.07, diffusionRate: 0.35, minConcentration: 0.02, ventLifetime: 6 }, 0.1);
  scene.setReleasing(true);
  scene.step();

  it('clears the box, then draws the walls', () => {
    const { ctx, calls } = recorder();
    drawPreview(ctx, scene, GAS, 10, 0);
    expect(calls[0].op).toBe('clearRect');
    const walls = calls.filter((c) => c.op === 'fillRect' && c.fillStyle === '#5b4636');
    expect(walls.length).toBeGreaterThan(PREVIEW_WIDTH);
  });

  it('draws each cell of gas as soft stacked circles in the gas colour', () => {
    const { ctx, calls } = recorder();
    drawPreview(ctx, scene, GAS, 10, 0);
    const circles = calls.filter((c) => c.op === 'arc');
    expect(circles.length).toBeGreaterThan(0);
    expect(circles.length % 3).toBe(0); // three layers a cell
    const fills = calls.filter((c) => c.op === 'fill');
    expect(fills.length).toBe(circles.length);
    expect(fills[0].fillStyle).toContain('rgba(223, 241, 255');
    // Widest layer first, then smaller ones
    expect(circles[0].args[2] as number).toBeGreaterThan(circles[2].args[2] as number);
  });

  it('draws hard squares when the gas has no softness', () => {
    const { ctx, calls } = recorder();
    drawPreview(ctx, scene, { ...GAS, appearance: { softness: 0, driftSpeed: 0.3, driftAmount: 0.1 } }, 10, 0);
    expect(calls.filter((c) => c.op === 'arc')).toHaveLength(0);
    expect(calls.some((c) => c.op === 'fillRect' && c.fillStyle.startsWith('rgba(223, 241, 255'))).toBe(true);
  });

  it('is fainter for a more transparent gas, and draws nothing for traces', () => {
    const faint = recorder();
    drawPreview(faint.ctx, scene, { ...GAS, opacity: 0.1 }, 10, 0);
    const strong = recorder();
    drawPreview(strong.ctx, scene, { ...GAS, opacity: 0.9 }, 10, 0);
    const alphaOf = (r: ReturnType<typeof recorder>) => Number(/([\d.]+)\)$/.exec(r.calls.find((c) => c.op === 'fill')!.fillStyle)![1]);
    expect(alphaOf(strong)).toBeGreaterThan(alphaOf(faint));
    const empty = recorder();
    drawPreview(empty.ctx, new PreviewScene({ density: 1, diffusionRate: 0.2, minConcentration: 0.02, ventLifetime: 6 }, 0.1), GAS, 10, 0);
    expect(empty.calls.filter((c) => c.op === 'arc')).toHaveLength(0);
  });

  it('moves the blobs as time passes (the drift)', () => {
    const a = recorder();
    drawPreview(a.ctx, scene, GAS, 10, 0);
    const b = recorder();
    drawPreview(b.ctx, scene, GAS, 10, 1.3);
    expect(a.calls.find((c) => c.op === 'arc')!.args[0]).not.toBe(b.calls.find((c) => c.op === 'arc')!.args[0]);
  });
});

describe('GasPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => recorder().ctx) as any;
  });
  afterEach(() => vi.useRealTimers());

  it('shows the box with release, roof gate and reset controls and empty stats', () => {
    render(<GasPreview gas={GAS} />);
    expect(screen.getByLabelText('Gas preview box')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Roof Gate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.getByText('In box').nextSibling).toHaveTextContent('0.00');
  });

  it('steps the real simulation while releasing and shows the gas in the box', () => {
    render(<GasPreview gas={GAS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    expect(screen.getByRole('button', { name: 'Stop Releasing' })).toHaveAttribute('aria-pressed', 'true');
    act(() => {
      vi.advanceTimersByTime(PREVIEW_STEP_MS * 4);
    });
    expect(Number(screen.getByText('In box').nextSibling!.textContent)).toBeGreaterThan(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Stop Releasing' }));
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
  });

  it('opens the roof gate once, and the gas starts to escape', () => {
    render(<GasPreview gas={GAS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Roof Gate' }));
    expect(screen.getByRole('button', { name: 'Open Roof Gate' })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(PREVIEW_STEP_MS * 300);
    });
    expect(Number(screen.getByText('Escaped').nextSibling!.textContent)).toBeGreaterThan(0);
  });

  it('reset empties the box and re-enables the gate', () => {
    render(<GasPreview gas={GAS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Roof Gate' }));
    act(() => {
      vi.advanceTimersByTime(PREVIEW_STEP_MS * 5);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('In box').nextSibling).toHaveTextContent('0.00');
    expect(screen.getByRole('button', { name: 'Open Roof Gate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
  });

  it('starts a fresh box when a physics setting changes, but keeps the box when only the look does', () => {
    const { rerender } = render(<GasPreview gas={GAS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    act(() => {
      vi.advanceTimersByTime(PREVIEW_STEP_MS * 3);
    });
    const before = screen.getByText('In box').nextSibling!.textContent;
    rerender(<GasPreview gas={{ ...GAS, color: '#ff0000' }} />);
    expect(screen.getByText('In box').nextSibling!.textContent).toBe(before);
    rerender(<GasPreview gas={{ ...GAS, density: 2 }} />);
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
    expect(SPOUT.x).toBeGreaterThan(0);
  });

  it('stops its timers when it goes away', () => {
    const { unmount } = render(<GasPreview gas={GAS} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
