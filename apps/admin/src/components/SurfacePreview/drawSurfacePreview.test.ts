import { describe, it, expect } from 'vitest';
import { DEFAULT_SURFACE_ENVIRONMENT, weatherAt, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import {
  PREVIEW_HORIZON,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  drawClouds,
  drawGround,
  drawLayer,
  drawLightning,
  drawPrecipitation,
  drawSky,
  drawSurfacePreview,
  type SurfacePreviewContext,
  type SurfacePreviewState,
} from './drawSurfacePreview';

/** A stand-in context that records what is drawn and with what style. */
function recorder() {
  const calls: Array<{ op: string; args: unknown[]; fill?: unknown; alpha?: number; composite?: unknown }> = [];
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args, fill: state.fillStyle, alpha: state.globalAlpha as number, composite: state.globalCompositeOperation });
  };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient') return (...args: unknown[]) => { calls.push({ op: prop, args }); return { addColorStop: record('addColorStop') }; };
      return record(prop);
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as SurfacePreviewContext;
  return { ctx, calls, ops: () => calls.map((c) => c.op) };
}

const env = (patch: Partial<SurfaceEnvironmentDefinition> = {}): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, weather: { clear: 1 }, ...patch });
const at = (weather: Parameters<typeof weatherAt>[3], time = 5): SurfacePreviewState => ({ cameraX: 0, time, weather: weatherAt(1, {}, time, weather), flash: 0, strikeX: 0.5 });

describe('drawSky', () => {
  it('paints the sky in bands from the top colour to the horizon colour, and a sun with a halo', () => {
    const { ctx, calls } = recorder();
    drawSky(ctx, env({ sky: { top: '#000000', horizon: '#ffffff', sunColor: '#ffee00', sunX: 0.5, sunHeight: 20, sunSize: 3 } }), 0, at({ weather: 'clear' }));
    const bands = calls.filter((c) => c.op === 'fillRect');
    expect(bands).toHaveLength(24);
    expect(bands[0].fill).toBe('#000000');
    expect(bands[23].fill).toBe('#ffffff');
    expect(calls.filter((c) => c.op === 'arc')).toHaveLength(3);
  });

  it('draws no sun when there is none, and greys the sky when it is overcast', () => {
    const none = recorder();
    drawSky(none.ctx, env({ sky: { top: '#2f8fd8', horizon: '#9fd6ff', sunColor: null } }), 0, at({ weather: 'clear' }));
    expect(none.calls.filter((c) => c.op === 'arc')).toHaveLength(0);
    const clear = recorder();
    drawSky(clear.ctx, env(), 0, at({ weather: 'clear' }));
    const grey = recorder();
    drawSky(grey.ctx, env(), 1, at({ weather: 'clear' }));
    expect(grey.calls.find((c) => c.op === 'fillRect')!.fill).not.toBe(clear.calls.find((c) => c.op === 'fillRect')!.fill);
  });
});

describe('drawClouds', () => {
  it('draws more clouds in thicker cover and none in a clear sky, with puffs for each', () => {
    const none = recorder();
    expect(drawClouds(none.ctx, env(), weatherAt(1, {}, 0, { weather: 'clear', intensity: 0 }), at({ weather: 'clear' }), 3)).toBe(0);
    const thin = recorder();
    const few = drawClouds(thin.ctx, env({ clouds: { maxCount: 12 } }), weatherAt(1, {}, 0, { weather: 'cloudy' }), at({ weather: 'cloudy' }), 3);
    const thick = recorder();
    const many = drawClouds(thick.ctx, env({ clouds: { maxCount: 12 } }), weatherAt(1, {}, 0, { weather: 'storm' }), at({ weather: 'storm' }), 3);
    expect(many).toBeGreaterThanOrEqual(few);
    expect(thick.calls.filter((c) => c.op === 'ellipse').length).toBeGreaterThanOrEqual(many * 5);
  });

  it('darkens the clouds in a storm and drifts them with the time', () => {
    const calm = recorder();
    drawClouds(calm.ctx, env({ clouds: { maxCount: 12 } }), weatherAt(1, {}, 0, { weather: 'cloudy' }), at({ weather: 'cloudy' }, 10), 3);
    const storm = recorder();
    drawClouds(storm.ctx, env({ clouds: { maxCount: 12 } }), weatherAt(1, {}, 0, { weather: 'storm' }), at({ weather: 'storm' }, 10), 3);
    expect(calm.calls.find((c) => c.op === 'ellipse')!.fill).not.toBe(storm.calls.find((c) => c.op === 'ellipse')!.fill);
    const ellipses = (r: ReturnType<typeof recorder>) => r.calls.filter((c) => c.op === 'ellipse').map((c) => c.args);
    const later = recorder();
    drawClouds(later.ctx, env({ clouds: { maxCount: 12 } }), weatherAt(1, {}, 0, { weather: 'cloudy' }), at({ weather: 'cloudy' }, 30), 3);
    expect(ellipses(later)).not.toEqual(ellipses(calm));
  });
});

describe('drawLayer', () => {
  const layer = { name: 'far', parallaxFactor: 0.8, yOffset: 0, shape: 'mountains' as const, height: 30, tint: '#8da2c2' };

  it('draws a silhouette in the layer\'s tint, tiled across the picture', () => {
    const { ctx, calls } = recorder();
    drawLayer(ctx, layer, null, 0, 4, 0);
    const fills = calls.filter((c) => c.op === 'fill');
    expect(fills.length).toBeGreaterThanOrEqual(1);
    expect(fills[0].fill).toBe('#8da2c2');
    expect(calls.filter((c) => c.op === 'translate')[0].args[1]).toBe(PREVIEW_HORIZON - 30 * 4);
  });

  it('moves the scenery by its parallax when the camera is dragged: far moves less than near', () => {
    const shift = (parallax: number) => {
      const { ctx, calls } = recorder();
      drawLayer(ctx, { ...layer, parallaxFactor: parallax }, null, 100, 4, 0);
      return calls.find((c) => c.op === 'translate')!.args[0] as number;
    };
    expect(Math.abs(shift(0.9) - shift(0.9))).toBe(0);
    expect(Math.abs(shift(0.9))).toBeLessThan(Math.abs(shift(0.2)));
  });

  it('draws a loaded picture tiled across instead, and the silhouette while it has not loaded', () => {
    const picture = { width: 300, height: 60 } as unknown as CanvasImageSource;
    const withPicture = recorder();
    drawLayer(withPicture.ctx, { ...layer, textureUrl: '/assets/a.png' }, picture, 0, 4, 0);
    const draws = withPicture.calls.filter((c) => c.op === 'drawImage');
    expect(draws.length).toBeGreaterThanOrEqual(Math.floor(PREVIEW_WIDTH / 300));
    expect(draws[0].args[4]).toBe(60);
    const waiting = recorder();
    drawLayer(waiting.ctx, { ...layer, textureUrl: '/assets/a.png' }, null, 0, 4, 0);
    expect(waiting.calls.some((c) => c.op === 'drawImage')).toBe(false);
    expect(waiting.calls.some((c) => c.op === 'fill')).toBe(true);
  });

  it('stands its bottom edge on the horizon plus the offset, and fades with its alpha', () => {
    const { ctx, calls } = recorder();
    drawLayer(ctx, { ...layer, yOffset: 5, alpha: 0.5 }, null, 0, 4, 0);
    expect(calls.find((c) => c.op === 'translate')!.args[1]).toBe(PREVIEW_HORIZON + 5 * 4 - 30 * 4);
    expect(calls.find((c) => c.op === 'fill')!.alpha).toBe(0.5);
  });
});

describe('drawGround', () => {
  it('fills the ground below the horizon with a grass edge', () => {
    const { ctx, calls } = recorder();
    drawGround(ctx);
    expect(calls[0].args).toEqual([0, PREVIEW_HORIZON, PREVIEW_WIDTH, PREVIEW_HEIGHT - PREVIEW_HORIZON]);
    expect(calls).toHaveLength(2);
  });
});

describe('drawPrecipitation', () => {
  it('draws nothing in clear weather, rain streaks in rain and flakes in snow', () => {
    const clear = recorder();
    expect(drawPrecipitation(clear.ctx, at({ weather: 'clear' }).weather, at({ weather: 'clear' }), 2)).toBe(0);
    const rain = recorder();
    const streaks = drawPrecipitation(rain.ctx, at({ weather: 'rain' }).weather, at({ weather: 'rain' }), 2);
    expect(streaks).toBeGreaterThan(50);
    expect(rain.calls.filter((c) => c.op === 'stroke').length).toBeGreaterThan(50);
    const snow = recorder();
    const flakes = drawPrecipitation(snow.ctx, at({ weather: 'snow' }).weather, at({ weather: 'snow' }), 2);
    expect(flakes).toBeGreaterThan(50);
    expect(snow.calls.some((c) => c.op === 'arc')).toBe(true);
  });

  it('keeps every streak above the ground', () => {
    const { ctx, calls } = recorder();
    drawPrecipitation(ctx, at({ weather: 'storm' }).weather, at({ weather: 'storm' }, 33), 2);
    for (const c of calls.filter((x) => x.op === 'moveTo')) expect(c.args[1] as number).toBeLessThanOrEqual(PREVIEW_HORIZON);
  });

  it('lays fog bands along the horizon', () => {
    const { ctx, calls } = recorder();
    expect(drawPrecipitation(ctx, at({ weather: 'fog' }).weather, at({ weather: 'fog' }), 2)).toBe(3);
    expect(calls.filter((c) => c.op === 'createLinearGradient')).toHaveLength(3);
  });

  it('is the same for the same time', () => {
    const a = recorder();
    const b = recorder();
    drawPrecipitation(a.ctx, at({ weather: 'rain' }).weather, at({ weather: 'rain' }, 12), 2);
    drawPrecipitation(b.ctx, at({ weather: 'rain' }).weather, at({ weather: 'rain' }, 12), 2);
    const shape = (r: ReturnType<typeof recorder>) => r.calls.map((c) => ({ op: c.op, args: c.args }));
    expect(shape(a)).toEqual(shape(b));
  });
});

describe('drawLightning', () => {
  it('does nothing without a flash', () => {
    const { ctx, calls } = recorder();
    drawLightning(ctx, { ...at({ weather: 'storm' }), flash: 0 }, 2);
    expect(calls).toHaveLength(0);
  });

  it('flashes the sky and draws a bolt for a bright flash, but only the flash for a faint one', () => {
    const bright = recorder();
    drawLightning(bright.ctx, { ...at({ weather: 'storm' }), flash: 1, strikeX: 0.3 }, 2);
    expect(bright.calls[0].op).toBe('fillRect');
    expect(bright.calls[0].args).toEqual([0, 0, PREVIEW_WIDTH, PREVIEW_HORIZON]);
    expect(bright.calls.some((c) => c.op === 'stroke')).toBe(true);
    const faint = recorder();
    drawLightning(faint.ctx, { ...at({ weather: 'storm' }), flash: 0.1 }, 2);
    expect(faint.calls.some((c) => c.op === 'stroke')).toBe(false);
  });
});

describe('drawSurfacePreview', () => {
  it('draws sky, then clouds and scenery, the ground, the weather and the dimming light, in that order', () => {
    const { ctx, calls } = recorder();
    const e = env({ layers: [{ name: 'far', parallaxFactor: 0.8, yOffset: 0, shape: 'mountains', height: 30 }], clouds: { maxCount: 8 } });
    const result = drawSurfacePreview(ctx, e, at({ weather: 'rain' }), new Map(), 2);
    expect(result.clouds).toBeGreaterThan(0);
    expect(result.particles).toBeGreaterThan(0);
    expect(calls[0].op).toBe('clearRect');
    const firstFill = calls.findIndex((c) => c.op === 'fill');
    const ground = calls.findIndex((c) => c.op === 'fillRect' && c.args[1] === PREVIEW_HORIZON);
    const multiply = calls.findIndex((c) => c.composite === 'multiply' && c.op === 'fillRect');
    expect(firstFill).toBeGreaterThan(0);
    expect(ground).toBeGreaterThan(firstFill);
    expect(multiply).toBeGreaterThan(ground);
  });

  it('leaves the light alone in clear weather (it multiplies by white) and darkens it in a storm', () => {
    const clear = recorder();
    drawSurfacePreview(clear.ctx, env(), at({ weather: 'clear' }), new Map(), 2);
    expect(clear.calls.find((c) => c.composite === 'multiply')!.fill).toBe('#ffffff');
    const storm = recorder();
    drawSurfacePreview(storm.ctx, env(), at({ weather: 'storm' }), new Map(), 2);
    expect(storm.calls.find((c) => c.composite === 'multiply')!.fill).not.toBe('#ffffff');
  });

  it('puts the lightning on top, after the dimming', () => {
    const { ctx, calls } = recorder();
    drawSurfacePreview(ctx, env(), { ...at({ weather: 'storm' }), flash: 1 }, new Map(), 2);
    const multiply = calls.findIndex((c) => c.composite === 'multiply' && c.op === 'fillRect');
    const bolt = calls.findIndex((c) => c.op === 'stroke' && c.alpha === 1 && (calls[calls.length - 1] === c || true));
    expect(calls.length - 1).toBeGreaterThan(multiply);
    expect(bolt).toBeGreaterThan(-1);
    expect(calls[calls.length - 1].op).toBe('stroke');
  });
});
