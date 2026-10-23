import { describe, it, expect } from 'vitest';
import { MiningProfiler } from './MiningProfiler';
import { countDisplayObjects, sampleSceneGauges } from './sceneStats';

const node = (children: any[] = [], extra: any = {}) => ({ children, ...extra });

describe('countDisplayObjects', () => {
  it('counts every node, and leaves out what sits under a hidden one when counting what can be drawn', () => {
    const tree = node([node([node(), node()]), node([node(), node()], { visible: false }), node([], { renderable: false })]);
    expect(countDisplayObjects(tree)).toEqual({ total: 8, drawable: 4 });
  });

  it('handles a very large flat tree without recursion limits', () => {
    const wide = node(Array.from({ length: 100_000 }, () => node()));
    expect(countDisplayObjects(wide).total).toBe(100_001);
  });
});

describe('sampleSceneGauges', () => {
  it('publishes the scene as gauges, skipping parts that are not there', () => {
    const profiler = new MiningProfiler(1000, true);
    sampleSceneGauges(profiler, {
      stage: node([node(), node()]),
      lights: { getLightCount: () => 7 },
      particles: { getActiveParticleCount: () => 120, getEmitterCount: () => 5 },
      tileSprites: new Map([['a', 1]]),
      gridCells: 18225,
      renderer: { width: 1920, height: 1080, resolution: 2 },
    });
    expect(profiler.getStats().gauges).toEqual({
      'Display objects': 3, 'Drawable objects': 3, Lights: 7, Particles: 120, 'Particle emitters': 5,
      'Tile sprites': 1, 'Grid cells': 18225, 'Canvas pixels (millions)': 2.07, 'Pixel ratio': 2,
    });
  });

  it('publishes the belt\'s segments and items so the cost of a long belt shows next to the frame time', () => {
    const profiler = new MiningProfiler(1000, true);
    sampleSceneGauges(profiler, { belt: { segments: 40, items: 12 } });
    expect(profiler.getStats().gauges).toEqual({ 'Belt segments': 40, 'Belt items': 12 });
    const none = new MiningProfiler(1000, true);
    sampleSceneGauges(none, { belt: null });
    expect(none.getStats().gauges).toEqual({});
  });

  it('does nothing while profiling is off', () => {
    const profiler = new MiningProfiler(1000, false);
    sampleSceneGauges(profiler, { stage: node(), gridCells: 5 });
    profiler.setEnabled(true);
    expect(profiler.getStats().gauges).toEqual({});
  });
});
