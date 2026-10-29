import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { DEFAULT_SURFACE_ENVIRONMENT, lightningAt, strikesBetween, weatherAt, type SurfaceClientState, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { SurfaceSystem, quantizeColor, skyLightColor } from './SurfaceSystem';

const TILE = 10;
const SURFACE_ROW = 30;
const SURFACE_Y = SURFACE_ROW * TILE;
const lum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);

const env = (patch: Partial<SurfaceEnvironmentDefinition> = {}): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, weather: { clear: 1 }, ...patch });
const state = (e = env(), override: SurfaceClientState['override'] = null): SurfaceClientState => ({ environment: e, seed: 5, startedAt: 0, serverNow: 100_000, override });

const surfaceView = { left: 0, top: SURFACE_Y - 300, width: 800, height: 400 };
const deepView = { left: 0, top: SURFACE_Y + 900, width: 800, height: 400 };

let nowMs = 100_000;
const lighting = { setSkyLight: vi.fn() };
const doodads = { setSurfaceRow: vi.fn(), setWeather: vi.fn() };
const sounds = { playSfx: vi.fn(), playLoopingSfx: vi.fn(), stopLoopingSfx: vi.fn() };
let reduce = false;

const make = (s = state()) => {
  const bg = new Container();
  const front = new Container();
  const system = new SurfaceSystem(s, { backgroundParent: bg, weatherParent: front, surfaceRow: SURFACE_ROW, mapWidthCells: 80, tileSize: TILE, lighting, doodads, sounds, reduceFlashes: () => reduce, now: () => nowMs, loadTexture: () => Promise.resolve(null) });
  return { bg, front, system };
};

beforeEach(() => {
  nowMs = 100_000;
  reduce = false;
  lighting.setSkyLight.mockClear();
  doodads.setSurfaceRow.mockClear();
  doodads.setWeather.mockClear();
  sounds.playSfx.mockClear();
  sounds.playLoopingSfx.mockClear();
  sounds.stopLoopingSfx.mockClear();
});

describe('the sky light helpers', () => {
  it('quantizes colours to steps, never past white', () => {
    expect(quantizeColor(0x010203, 4)).toBe(0x000404);
    expect(quantizeColor(0xffffff, 4)).toBe(0xffffff);
    expect(quantizeColor(0xfefefe, 4)).toBe(0xffffff);
    expect(quantizeColor(0x7e7e7e, 4)).toBe(0x808080);
  });

  it('multiplies the environment tint into the weather light and brightens it with a flash', () => {
    expect(skyLightColor(0xffffff, null, 0)).toBe(0xffffff);
    expect(skyLightColor(0xffffff, '#808080', 0)).toBe(0x808080);
    expect(lum(skyLightColor(0x606060, null, 0.5))).toBeGreaterThan(lum(0x606060));
    expect(skyLightColor(0x606060, null, 1)).toBe(0xffffff);
    expect(skyLightColor(0x606060, null, 7)).toBe(0xffffff);
  });
});

describe('SurfaceSystem above the ground', () => {
  it('tells the doodad renderer where the ground is and fills its parents', () => {
    const { bg, front } = make();
    expect(doodads.setSurfaceRow).toHaveBeenCalledWith(SURFACE_ROW);
    expect(bg.children).toHaveLength(1);
    expect(front.children).toHaveLength(2);
  });

  it('works out the same weather a shared maths call gives for the clock', () => {
    const e = env({ weather: { clear: 2, rain: 1, cloudy: 1 } });
    const { system } = make(state(e));
    nowMs = 100_000 + 123_000;
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(system.weather).toEqual(weatherAt(5, e, 123 + 100, null));
  });

  it('dims the sky light in bad weather and leaves daylight white in clear weather', () => {
    const clear = make(state(env(), { weather: 'clear' }));
    clear.system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(lighting.setSkyLight).toHaveBeenLastCalledWith(0xffffff);
    const storm = make(state(env(), { weather: 'storm' }));
    storm.system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(lum(lighting.setSkyLight.mock.calls.at(-1)![0])).toBeLessThan(lum(0xffffff) - 100);
  });

  it('applies the environment\'s ambient tint', () => {
    const { system } = make(state(env({ ambientTint: '#ffe0a0' }), { weather: 'clear' }));
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(lighting.setSkyLight).toHaveBeenLastCalledWith(quantizeColor(0xffe0a0));
  });

  it('rains, fills the sky with clouds and tells the doodads about the wind', () => {
    const { system, front } = make(state(env(), { weather: 'storm' }));
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(system.stats.active).toBe(true);
    expect(system.stats.clouds).toBeGreaterThanOrEqual(2);
    expect(system.stats.particles).toBeGreaterThan(50);
    expect(front.children[0].visible).toBe(true);
    expect(doodads.setWeather).toHaveBeenLastCalledWith('storm', expect.any(Number));
    expect(doodads.setWeather.mock.calls.at(-1)![1]).toBeGreaterThan(1);
  });

  it('plays the rain and wind loops through the environment\'s sound slots', () => {
    const e = env({ sounds: { rain: { url: '/assets/sounds/rain.mp3' }, wind: { url: '/assets/sounds/wind.mp3' } } });
    const { system } = make(state(e, { weather: 'rain' }));
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(sounds.playLoopingSfx).toHaveBeenCalledWith('surface_rain', '/assets/sounds/rain.mp3', expect.anything());
  });

  it('flashes the sky light for lightning, brighter than the storm\'s own light, and thunder follows', () => {
    const e = env({ sounds: { thunder: { url: '/assets/sounds/thunder.mp3' } } });
    const { system } = make(state(e, { weather: 'storm' }));
    const [strike] = strikesBetween(5, e, 0, 600, { weather: 'storm' });
    nowMs = strike.time * 1000 + 20;
    system.update(surfaceView, SURFACE_Y - 100, 1);
    const flashed = lighting.setSkyLight.mock.calls.at(-1)![0];
    nowMs = (strike.time + 2) * 1000;
    system.update(surfaceView, SURFACE_Y - 100, 1);
    const after = lighting.setSkyLight.mock.calls.at(-1)![0];
    expect(lum(flashed)).toBeGreaterThan(lum(after));
    expect(lightningAt(5, e, strike.time, { weather: 'storm' }).flash).toBeGreaterThan(0.9);
    // Thunder is played once the delay has passed
    nowMs = (strike.time + strike.thunderDelay + 0.2) * 1000;
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(sounds.playSfx).toHaveBeenCalledWith('/assets/sounds/thunder.mp3', expect.anything());
  });

  it('caps the flash with the reduce-flashes setting', () => {
    const e = env();
    const [strike] = strikesBetween(5, e, 0, 600, { weather: 'storm' });
    const flashAt = strike.time * 1000 + 5;
    const full = make(state(e, { weather: 'storm' }));
    nowMs = flashAt;
    full.system.update(surfaceView, SURFACE_Y - 100, 1);
    const bright = lighting.setSkyLight.mock.calls.at(-1)![0];
    reduce = true;
    const dim = make(state(e, { weather: 'storm' }));
    dim.system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(lum(lighting.setSkyLight.mock.calls.at(-1)![0])).toBeLessThan(lum(bright));
  });

  it('calls a sandbox strike at the time asked for', () => {
    const { system, front } = make(state(env(), { weather: 'clear', strikeAt: 10 }));
    nowMs = 10_000 + 20;
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(front.children[1].visible).toBe(true);
  });

  it('reports each phase to the profiler as it starts', () => {
    const { system } = make(state(env(), { weather: 'rain' }));
    const phases: string[] = [];
    system.onPhase = (name) => phases.push(name);
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(phases).toEqual(['Surface Background', 'Clouds', 'Weather Particles']);
  });
});

describe('SurfaceSystem underground', () => {
  it('draws nothing, silences the sounds once, and then does no work at all', () => {
    const { system, bg, front } = make(state(env(), { weather: 'storm' }));
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(front.children[0].visible).toBe(true);
    system.update(deepView, SURFACE_Y + 1100, 2);
    expect(bg.children[0].visible).toBe(false);
    expect(front.children[0].visible).toBe(false);
    expect(front.children[1].visible).toBe(false);
    expect(system.stats.particles).toBe(0);
    expect(lighting.setSkyLight).toHaveBeenLastCalledWith(0xffffff);
    const calls = lighting.setSkyLight.mock.calls.length;
    const weatherBefore = system.weather;
    system.update(deepView, SURFACE_Y + 1100, 3);
    system.update(deepView, SURFACE_Y + 1100, 4);
    expect(lighting.setSkyLight.mock.calls.length).toBe(calls);
    expect(system.weather).toBe(weatherBefore);
  });

  it('does not compute the weather while deep', () => {
    const { system } = make(state(env(), { weather: 'storm' }));
    system.update(deepView, SURFACE_Y + 1100, 1);
    expect(system.weather).toBeNull();
    expect(doodads.setWeather).not.toHaveBeenCalled();
  });

  it('starts again when the camera comes back up', () => {
    const { system } = make(state(env(), { weather: 'rain' }));
    system.update(deepView, SURFACE_Y + 1100, 1);
    system.update(surfaceView, SURFACE_Y - 100, 2);
    expect(system.stats.active).toBe(true);
    expect(system.weather?.type).toBe('rain');
  });

  it('keeps sounds on while the camera is just below the ground, fading with depth', () => {
    const e = env({ sounds: { rain: { url: '/assets/sounds/rain.mp3' } } });
    const { system } = make(state(e, { weather: 'rain' }));
    system.update(deepView, SURFACE_Y + 5 * TILE, 1);
    expect(sounds.playLoopingSfx).toHaveBeenCalled();
  });
});

describe('SurfaceSystem changes and cleanup', () => {
  it('takes a forced weather from the sandbox', () => {
    const { system } = make();
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(system.weather?.type).toBe('clear');
    system.apply({ override: { weather: 'snow' }, serverNow: nowMs });
    system.update(surfaceView, SURFACE_Y - 100, 2);
    expect(system.weather?.type).toBe('snow');
    system.apply({ override: null, serverNow: nowMs });
    system.update(surfaceView, SURFACE_Y - 100, 3);
    expect(system.weather?.type).toBe('clear');
  });

  it('swaps to another environment from the sandbox, with its own weather', () => {
    const { system } = make();
    const stormy = env({ key: 'storm_land', weather: { storm: 1 } });
    system.apply({ environment: stormy, override: null, serverNow: nowMs });
    expect(system.currentEnvironment.key).toBe('storm_land');
    system.update(surfaceView, SURFACE_Y - 100, 1);
    expect(system.weather?.type).toBe('storm');
  });

  it('puts the sky light back to daylight and removes its layers when destroyed', () => {
    const { system, bg, front } = make(state(env({ sounds: { rain: { url: '/assets/sounds/rain.mp3' } } }), { weather: 'storm' }));
    system.update(surfaceView, SURFACE_Y - 100, 1);
    system.destroy();
    expect(lighting.setSkyLight).toHaveBeenLastCalledWith(0xffffff);
    expect(bg.children[0]?.destroyed ?? true).toBe(true);
    expect(front.children.every((c) => c.destroyed)).toBe(true);
    expect(sounds.stopLoopingSfx).toHaveBeenCalled();
  });
});
