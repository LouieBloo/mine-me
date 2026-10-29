import { describe, it, expect } from 'vitest';
import { DEFAULT_SURFACE_ENVIRONMENT, weatherAt, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { MiningSurfaceState } from './MiningSurfaceState';

const env = (key: string, patch: Partial<SurfaceEnvironmentDefinition> = {}): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, id: key, key, isDefault: false, weight: 1, ...patch });
const stormy = env('storm_land', { weather: { storm: 1 } });
const valley = env('valley', { weather: { clear: 2, cloudy: 1, rain: 1 } });

describe('MiningSurfaceState', () => {
  it('picks an environment for the seed (the same one every time) and falls back to the built-in sky with none', () => {
    const a = new MiningSurfaceState({ seed: 7, environments: [stormy, valley] });
    const b = new MiningSurfaceState({ seed: 7, environments: [valley, stormy] });
    expect(a.environment.key).toBe(b.environment.key);
    expect(new MiningSurfaceState({ seed: 7, environments: [] }).environment.key).toBe(DEFAULT_SURFACE_ENVIRONMENT.key);
  });

  it('lets the sandbox choose an environment by key', () => {
    const s = new MiningSurfaceState({ seed: 1, environments: [stormy, valley], preferredKey: 'valley' });
    expect(s.environment.key).toBe('valley');
  });

  it('hands clients the start facts: environment, seed, the clock start and the server time', () => {
    const s = new MiningSurfaceState({ seed: 9, environments: [valley], startedAt: 1000 });
    expect(s.clientState(5000)).toEqual({ environment: valley, seed: 9, startedAt: 1000, serverNow: 5000, override: null });
  });

  it('runs the weather on a clock from the start, never before it', () => {
    const s = new MiningSurfaceState({ seed: 9, environments: [valley], startedAt: 10_000 });
    expect(s.clockAt(10_000)).toBe(0);
    expect(s.clockAt(70_000)).toBe(60);
    expect(s.clockAt(5_000)).toBe(0);
  });

  it('reports the weather a client would work out for itself', () => {
    const s = new MiningSurfaceState({ seed: 9, environments: [valley], startedAt: 0 });
    expect(s.weatherNow(900_000)).toEqual(weatherAt(9, valley, 900));
  });

  it('forces a weather and clears it, and tells clients only when something changed', () => {
    const s = new MiningSurfaceState({ seed: 3, environments: [valley], startedAt: 0 });
    expect(s.takeUpdate(1)).toBeUndefined();
    s.forceWeather('storm', 0.6);
    expect(s.forcedWeather).toBe('storm');
    expect(s.weatherNow(5000).rainIntensity).toBeCloseTo(0.6);
    expect(s.takeUpdate(2)).toEqual({ environment: valley, override: { weather: 'storm', intensity: 0.6 }, serverNow: 2 });
    expect(s.takeUpdate(3)).toBeUndefined();
    s.forceWeather(null);
    expect(s.forcedWeather).toBeNull();
    expect(s.takeUpdate(4)?.override).toMatchObject({ weather: null });
  });

  it('calls a strike for right now on the weather clock, keeping a forced weather', () => {
    const s = new MiningSurfaceState({ seed: 3, environments: [valley], startedAt: 0 });
    s.forceWeather('rain');
    s.triggerLightning(20_000);
    const update = s.takeUpdate(20_000);
    expect(update?.override?.weather).toBe('rain');
    expect(update?.override?.strikeAt).toBeCloseTo(20.05);
  });

  it('swaps the environment only for one that exists', () => {
    const s = new MiningSurfaceState({ seed: 1, environments: [stormy, valley], startedAt: 0 });
    expect(s.setEnvironment('nope')).toBe(false);
    expect(s.takeUpdate()).toBeUndefined();
    const other = s.environment.key === 'valley' ? 'storm_land' : 'valley';
    expect(s.setEnvironment(other)).toBe(true);
    expect(s.environment.key).toBe(other);
    expect(s.takeUpdate(5)).toMatchObject({ environment: { key: other }, serverNow: 5 });
  });

  it('clears everything the sandbox forced, and says so once', () => {
    const s = new MiningSurfaceState({ seed: 1, environments: [valley], startedAt: 0 });
    s.clearOverride();
    expect(s.takeUpdate()).toBeUndefined();
    s.forceWeather('fog');
    s.takeUpdate();
    s.clearOverride();
    expect(s.forcedWeather).toBeNull();
    expect(s.takeUpdate(1)?.override).toBeNull();
  });
});
