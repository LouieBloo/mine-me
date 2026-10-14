import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FluidPreview, { PREVIEW_STEP_MS, drawPreview, type FluidPreviewSettings } from './FluidPreview';
import { PreviewScene } from './previewScene';

const OIL: FluidPreviewSettings = { color: '#0b0b0d', opacity: 0.9, density: 0.8, flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02 };

function fakeContext() {
  const fills: Array<{ style: string; alpha: number; rect: number[] }> = [];
  const ctx: any = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect: vi.fn(),
    fillRect: vi.fn((...rect: number[]) => fills.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha, rect })),
  };
  return { ctx, fills };
}

describe('drawPreview', () => {
  it('draws walls and no fluid for an empty tank', () => {
    const { ctx, fills } = fakeContext();
    drawPreview(ctx, new PreviewScene(OIL), OIL, 10);
    expect(fills.some((f) => f.style === '#5b4636')).toBe(true);
    expect(fills.some((f) => f.style === OIL.color)).toBe(false);
  });

  it('draws fluid in its own colour and opacity once there is some', () => {
    const scene = new PreviewScene(OIL);
    scene.setPouring(true);
    scene.step();
    const { ctx, fills } = fakeContext();
    drawPreview(ctx, scene, OIL, 10);
    const fluidFills = fills.filter((f) => f.style === OIL.color);
    expect(fluidFills.length).toBeGreaterThan(0);
    expect(fluidFills[0].alpha).toBe(OIL.opacity);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('FluidPreview', () => {
  let drawn: ReturnType<typeof fakeContext>;

  beforeEach(() => {
    vi.useFakeTimers();
    drawn = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => drawn.ctx) as any);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const evaporated = () => screen.getByText('Evaporated').nextSibling?.textContent;
  const inTank = () => Number(screen.getByText('In tank').nextSibling?.textContent);

  it('steps the simulation at the game\'s fluid rate and draws every step', () => {
    render(<FluidPreview fluid={OIL} />);
    const initial = drawn.ctx.clearRect.mock.calls.length;
    act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS * 3); });
    expect(drawn.ctx.clearRect.mock.calls.length).toBe(initial + 3);
  });

  it('pours fluid into the tank until it is stopped', () => {
    render(<FluidPreview fluid={OIL} />);
    expect(inTank()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Pour' }));
    expect(screen.getByRole('button', { name: 'Stop Pouring' })).toHaveAttribute('aria-pressed', 'true');
    act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS * 6); });
    expect(inTank()).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stop Pouring' }));
    const poured = inTank();
    act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS * 3); });
    expect(inTank()).toBeLessThanOrEqual(poured);
  });

  it('opens the gate once, and Reset empties the tank and closes it again', () => {
    render(<FluidPreview fluid={OIL} />);
    const gate = screen.getByRole('button', { name: 'Open Gate' });
    fireEvent.click(gate);
    expect(gate).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Pour' }));
    act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS * 4); });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(inTank()).toBe(0);
    expect(evaporated()).toBe('0.00');
    expect(screen.getByRole('button', { name: 'Open Gate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pour' })).toBeInTheDocument();
  });

  it('starts a fresh tank when a physics setting changes, but keeps the tank for colour changes', () => {
    const { rerender } = render(<FluidPreview fluid={OIL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pour' }));
    act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS * 4); });
    expect(inTank()).toBeGreaterThan(0);
    rerender(<FluidPreview fluid={{ ...OIL, color: '#ff0000' }} />);
    expect(inTank()).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Stop Pouring' })).toBeInTheDocument();
    rerender(<FluidPreview fluid={{ ...OIL, flowRate: 0.9 }} />);
    expect(screen.getByRole('button', { name: 'Pour' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS); });
    expect(inTank()).toBe(0);
  });

  it('stops its timer when removed', () => {
    const { unmount } = render(<FluidPreview fluid={OIL} />);
    unmount();
    const calls = drawn.ctx.clearRect.mock.calls.length;
    act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS * 5); });
    expect(drawn.ctx.clearRect.mock.calls.length).toBe(calls);
  });

  it('copes with a browser that gives no canvas context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as any);
    expect(() => {
      render(<FluidPreview fluid={OIL} />);
      act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS * 2); });
    }).not.toThrow();
  });
});
