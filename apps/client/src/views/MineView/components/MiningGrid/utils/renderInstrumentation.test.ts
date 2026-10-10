import { describe, it, expect, vi } from 'vitest';
import { installRenderInstrumentation } from './renderInstrumentation';

const fakeProfiler = () => ({ startSection: vi.fn(), endSection: vi.fn(), endFrame: vi.fn() }) as any;

describe('installRenderInstrumentation', () => {
  it('times the stage render and ends the frame after it', () => {
    const original = vi.fn(() => 'drawn');
    const renderer: any = { render: original };
    const profiler = fakeProfiler();
    installRenderInstrumentation(renderer, profiler);

    expect(renderer.render).not.toBe(original);
    expect(renderer.render({ container: 1 })).toBe('drawn');
    expect(original).toHaveBeenCalledWith({ container: 1 });
    expect(profiler.startSection).toHaveBeenCalledWith('Pixi Stage Render');
    expect(profiler.endSection).toHaveBeenCalledTimes(1);
    expect(profiler.endFrame).toHaveBeenCalledTimes(1);
  });

  it('times offscreen (lightmap) renders separately and does not end the frame for them', () => {
    const renderer: any = { render: vi.fn() };
    const profiler = fakeProfiler();
    installRenderInstrumentation(renderer, profiler);
    renderer.render({ target: {} });
    expect(profiler.startSection).toHaveBeenCalledWith('Lightmap FBO Render');
    expect(profiler.endFrame).not.toHaveBeenCalled();
  });

  it('puts the original render back when restored', () => {
    const original = vi.fn();
    const renderer: any = { render: original };
    const restore = installRenderInstrumentation(renderer, fakeProfiler());
    restore();
    expect(renderer.render).toBe(original);
  });
});
