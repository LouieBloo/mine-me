import type { MiningProfiler } from './MiningProfiler';

/** The part of a Pixi renderer that profiling wraps. */
export interface InstrumentableRenderer {
  // Pixi's `render` is overloaded (container, or an options object), so the arguments are passed through untouched
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (...args: any[]) => unknown;
}

/**
 * Wraps `renderer.render` so the profiler can time the main stage and the offscreen lightmap pass,
 * and ends the profiler's frame after the stage is drawn. Returns a function that restores the
 * original `render`. Only call this while profiling is on: normal play must not touch the renderer.
 */
export function installRenderInstrumentation(renderer: InstrumentableRenderer, profiler: MiningProfiler): () => void {
  const original = renderer.render;
  const bound = original.bind(renderer);
  renderer.render = (...args) => {
    const isOffscreen = !!(args[0] as { target?: unknown } | undefined)?.target;
    profiler.startSection(isOffscreen ? 'Lightmap FBO Render' : 'Pixi Stage Render');
    const result = bound(...args);
    profiler.endSection();
    if (!isOffscreen) profiler.endFrame();
    return result;
  };
  return () => {
    renderer.render = original;
  };
}
