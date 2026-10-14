import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FluidPreview, { PREVIEW_FRAME_MS, PREVIEW_STEP_MS, drawPreview, type FluidPreviewSettings } from './FluidPreview';
import { PreviewScene } from './previewScene';
import { DEFAULT_FLUID_APPEARANCE, FluidDisplay, type FluidAppearance } from '@mine-me/shared';

const OIL: FluidPreviewSettings = { color: '#0b0b0d', opacity: 0.9, density: 0.8, flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02 };

function fakeContext() {
  const fills: Array<{ style: string; alpha: number; rect: number[] }> = [];
  const polygons: string[] = [];
  const strokes: string[] = [];
  const ctx: any = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    clearRect: vi.fn(),
    fillRect: vi.fn((...rect: number[]) => fills.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha, rect })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => polygons.push(ctx.fillStyle)),
    stroke: vi.fn(() => strokes.push(ctx.strokeStyle)),
  };
  return { ctx, fills, polygons, strokes };
}

describe('drawPreview', () => {
  it('draws walls and no fluid for an empty tank', () => {
    const { ctx, fills } = fakeContext();
    drawPreview(ctx, new PreviewScene(OIL), OIL, 10);
    expect(fills.some((f) => f.style === '#5b4636')).toBe(true);
    expect(fills.some((f) => f.style === OIL.color)).toBe(false);
  });

  it('draws fluid as shaded polygons in its own colour once there is some', () => {
    const scene = new PreviewScene(OIL);
    scene.setPouring(true);
    scene.step();
    const { ctx, polygons } = fakeContext();
    drawPreview(ctx, scene, { ...OIL, appearance: { ...DEFAULT_FLUID_APPEARANCE, depthDarkening: 0, depthOpacity: 0, highlight: 0 } }, 10);
    expect(polygons.length).toBeGreaterThan(0);
    // Oil is near-black (#0b0b0d) at 0.9 opacity; with no depth shading every slice is exactly that
    expect(new Set(polygons)).toEqual(new Set(['rgba(11, 11, 13, 0.9)']));
    expect(ctx.globalAlpha).toBe(1);
  });

  it('draws the levels it is given (the eased display), not the tank\'s exact ones', () => {
    const scene = new PreviewScene(OIL);
    scene.setPouring(true);
    for (let i = 0; i < 6; i++) scene.step();
    const exact = fakeContext();
    drawPreview(exact.ctx, scene, OIL, 10);
    expect(exact.polygons.length).toBeGreaterThan(0);
    const eased = fakeContext();
    drawPreview(eased.ctx, scene, OIL, 10, 0, new FluidDisplay(24, 12)); // nothing has eased in yet
    expect(eased.polygons).toHaveLength(0);
  });

  it('draws a highlight line along the surface only when the look asks for one', () => {
    const scene = new PreviewScene(OIL);
    scene.setPouring(true);
    for (let i = 0; i < 6; i++) scene.step();
    const lit = fakeContext();
    drawPreview(lit.ctx, scene, { ...OIL, appearance: { ...DEFAULT_FLUID_APPEARANCE, highlight: 1 } }, 10);
    expect(lit.strokes.length).toBeGreaterThan(0);
    const dull = fakeContext();
    drawPreview(dull.ctx, scene, { ...OIL, appearance: { ...DEFAULT_FLUID_APPEARANCE, highlight: 0 } }, 10);
    expect(dull.strokes).toHaveLength(0);
  });

  it('moves the waves with time, and holds still with no wave amplitude', () => {
    const scene = new PreviewScene(OIL);
    scene.setPouring(true);
    for (let i = 0; i < 12; i++) scene.step();
    const surfaceAt = (appearance: FluidAppearance, t: number) => {
      const { ctx } = fakeContext();
      drawPreview(ctx, scene, { ...OIL, appearance }, 10, t);
      return JSON.stringify((ctx.lineTo as any).mock.calls);
    };
    const waving = { ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0.2 };
    expect(surfaceAt(waving, 0)).not.toBe(surfaceAt(waving, 0.7));
    const flat = { ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0 };
    expect(surfaceAt(flat, 0)).toBe(surfaceAt(flat, 0.7));
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

  it('redraws many times per simulation step, so the waves move smoothly', () => {
    render(<FluidPreview fluid={OIL} />);
    const initial = drawn.ctx.clearRect.mock.calls.length;
    act(() => { vi.advanceTimersByTime(PREVIEW_FRAME_MS * 3); });
    expect(drawn.ctx.clearRect.mock.calls.length).toBe(initial + 3);
    expect(PREVIEW_FRAME_MS).toBeLessThan(PREVIEW_STEP_MS);
  });

  it('steps the simulation at the game\'s fluid rate', () => {
    render(<FluidPreview fluid={OIL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pour' }));
    act(() => { vi.advanceTimersByTime(PREVIEW_STEP_MS - 1); });
    expect(inTank()).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(inTank()).toBeGreaterThan(0);
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
