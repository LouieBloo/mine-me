import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SURFACE_ENVIRONMENT, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import SurfacePreview from './SurfacePreview';

/** A recording 2D context handed out for the canvas. */
let calls: Array<[string, unknown[]]> = [];
const ctx = new Proxy({ fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' } as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    if (prop === 'createLinearGradient') return () => ({ addColorStop: vi.fn() });
    return (...args: unknown[]) => calls.push([prop, args]);
  },
  set(target, prop: string, value) {
    target[prop] = value;
    return true;
  },
});

const env = (patch: Partial<SurfaceEnvironmentDefinition> = {}): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, weather: { clear: 1 }, ...patch });
const count = (op: string) => calls.filter(([o]) => o === op).length;

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SurfacePreview', () => {
  it('draws the surface at once and keeps drawing as time passes', () => {
    render(<SurfacePreview environment={env()} />);
    expect(count('clearRect')).toBe(1);
    act(() => { vi.advanceTimersByTime(100); });
    expect(count('clearRect')).toBeGreaterThan(2);
  });

  it('shows rain when the rain weather is picked, and none in clear weather', () => {
    render(<SurfacePreview environment={env()} />);
    act(() => { vi.advanceTimersByTime(66); });
    const clearStrokes = count('stroke');
    expect(clearStrokes).toBe(0);
    fireEvent.change(screen.getByLabelText('Preview weather'), { target: { value: 'rain' } });
    act(() => { vi.advanceTimersByTime(66); });
    expect(count('stroke')).toBeGreaterThan(50);
  });

  it('lists every weather kind', () => {
    render(<SurfacePreview environment={env()} />);
    const options = [...(screen.getByLabelText('Preview weather') as HTMLSelectElement).options].map((o) => o.text);
    expect(options).toEqual(['Clear', 'Cloudy', 'Windy', 'Rain', 'Storm', 'Snow', 'Fog']);
  });

  it('weakens the weather with the strength slider', () => {
    render(<SurfacePreview environment={env()} />);
    fireEvent.change(screen.getByLabelText('Preview weather'), { target: { value: 'rain' } });
    act(() => { vi.advanceTimersByTime(33); });
    calls = [];
    act(() => { vi.advanceTimersByTime(33); });
    const full = count('stroke');
    fireEvent.change(screen.getByLabelText('Preview weather strength'), { target: { value: '0.2' } });
    expect(screen.getByText('20%')).toBeInTheDocument();
    calls = [];
    act(() => { vi.advanceTimersByTime(33); });
    expect(count('stroke')).toBeLessThan(full);
  });

  it('flashes the sky and draws a bolt on a lightning strike, then goes dark again', () => {
    render(<SurfacePreview environment={env()} />);
    act(() => { vi.advanceTimersByTime(33); });
    fireEvent.click(screen.getByText('Lightning strike'));
    calls = [];
    act(() => { vi.advanceTimersByTime(33); });
    expect(count('stroke')).toBe(1);
    act(() => { vi.advanceTimersByTime(1500); });
    calls = [];
    act(() => { vi.advanceTimersByTime(33); });
    expect(count('stroke')).toBe(0);
  });

  it('scrolls the scenery when the picture is dragged', () => {
    const layers = [{ name: 'far', parallaxFactor: 0.4, yOffset: 0, shape: 'mountains' as const, height: 30 }];
    render(<SurfacePreview environment={env({ layers })} />);
    const canvas = screen.getByLabelText('Surface preview');
    const firstTranslate = () => calls.filter(([o]) => o === 'translate').map(([, a]) => a[0]);
    act(() => { vi.advanceTimersByTime(33); });
    const before = firstTranslate().at(-1);
    calls = [];
    fireEvent.pointerDown(canvas, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 200, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(33); });
    const after = firstTranslate().at(-1);
    expect(after).not.toBe(before);
    // Letting go ends the drag
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    calls = [];
    fireEvent.pointerMove(canvas, { clientX: 50, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(33); });
    expect(firstTranslate().at(-1)).toBe(after);
  });

  it('puts the view back with the reset button', () => {
    const layers = [{ name: 'far', parallaxFactor: 0.4, yOffset: 0, shape: 'mountains' as const, height: 30 }];
    render(<SurfacePreview environment={env({ layers })} />);
    const canvas = screen.getByLabelText('Surface preview');
    act(() => { vi.advanceTimersByTime(33); });
    const start = calls.filter(([o]) => o === 'translate').at(-1)![1][0];
    fireEvent.pointerDown(canvas, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(screen.getByText('Reset view'));
    calls = [];
    act(() => { vi.advanceTimersByTime(33); });
    expect(calls.filter(([o]) => o === 'translate').at(-1)![1][0]).toBe(start);
  });

  it('follows the environment as it is edited', () => {
    const { rerender } = render(<SurfacePreview environment={env()} />);
    act(() => { vi.advanceTimersByTime(33); });
    expect(count('translate')).toBe(0);
    rerender(<SurfacePreview environment={env({ layers: [{ name: 'far', parallaxFactor: 0.4, yOffset: 0, shape: 'hills', height: 20 }] })} />);
    calls = [];
    act(() => { vi.advanceTimersByTime(33); });
    expect(count('translate')).toBeGreaterThan(0);
  });

  it('stops its timer when it goes away', () => {
    const clear = vi.spyOn(window, 'clearInterval');
    const { unmount } = render(<SurfacePreview environment={env()} />);
    unmount();
    expect(clear).toHaveBeenCalled();
    calls = [];
    act(() => { vi.advanceTimersByTime(200); });
    expect(count('clearRect')).toBe(0);
  });

  it('says so when the browser cannot draw', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<SurfacePreview environment={env()} />);
    expect(screen.getByText('This browser cannot draw the preview.')).toBeInTheDocument();
  });
});
