import { describe, it, expect, vi } from 'vitest';
import { WEATHER_SEGMENT_MAX_SECONDS, WEATHER_TRANSITION_SECONDS, allowedWeather, gustAt, hash01, overcastOf, weatherAt, windSwayMultiplier } from './weather';
import { WEATHER_IDS, WEATHER_TYPES, isWeatherId } from './weatherTypes';

const all = { weather: { clear: 3, cloudy: 2, windy: 1, rain: 2, storm: 1, snow: 1, fog: 1 } };

describe('the weather registry', () => {
  it('has every type with sane numbers, and neighbours that exist and are not itself', () => {
    expect(WEATHER_IDS).toEqual(['clear', 'cloudy', 'windy', 'rain', 'storm', 'snow', 'fog']);
    for (const id of WEATHER_IDS) {
      const def = WEATHER_TYPES[id];
      expect(def.id).toBe(id);
      for (const key of ['cloudDensity', 'cloudDarkness', 'rain', 'snow', 'fog', 'wind', 'dim', 'lightning'] as const) {
        expect(def[key], `${id}.${key}`).toBeGreaterThanOrEqual(0);
        expect(def[key], `${id}.${key}`).toBeLessThanOrEqual(1);
      }
      for (const n of def.neighbours) {
        expect(isWeatherId(n)).toBe(true);
        expect(n).not.toBe(id);
      }
    }
  });

  it('lets only a storm strike', () => {
    expect(WEATHER_IDS.filter((id) => WEATHER_TYPES[id].lightning > 0)).toEqual(['storm']);
  });
});

describe('allowedWeather', () => {
  it('lists the kinds with a weight above 0, sorted, ignoring unknown ones', () => {
    expect(allowedWeather({ weather: { rain: 2, clear: 1, snow: 0, bogus: 5 } as never })).toEqual([{ id: 'clear', weight: 1 }, { id: 'rain', weight: 2 }]);
  });

  it('is always clear when nothing is listed', () => {
    expect(allowedWeather({ weather: null })).toEqual([{ id: 'clear', weight: 1 }]);
    expect(allowedWeather(undefined)).toEqual([{ id: 'clear', weight: 1 }]);
    expect(allowedWeather({ weather: { rain: 0 } })).toEqual([{ id: 'clear', weight: 1 }]);
  });
});

describe('weatherAt', () => {
  it('gives the same weather for the same seed and time, and a different one for another seed', () => {
    const a = weatherAt(42, all, 1234);
    expect(weatherAt(42, all, 1234)).toEqual(a);
    let differs = false;
    for (let t = 0; t < 6000 && !differs; t += 100) differs = weatherAt(42, all, t).type !== weatherAt(43, all, t).type;
    expect(differs).toBe(true);
  });

  it('does not use the random number generator or the real clock', () => {
    const random = vi.spyOn(Math, 'random');
    const now = vi.spyOn(Date, 'now');
    weatherAt(7, all, 500);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });

  it('agrees whichever order the times are asked in (a late joiner sees what everyone sees)', () => {
    const early = weatherAt(9, all, 900);
    weatherAt(9, all, 5000);
    expect(weatherAt(9, all, 900)).toEqual(early);
  });

  it('only ever picks allowed weather', () => {
    const env = { weather: { rain: 1, cloudy: 1 } };
    for (let t = 0; t < 20000; t += 50) {
      const state = weatherAt(3, env, t);
      expect(['rain', 'cloudy']).toContain(state.from);
      expect(['rain', 'cloudy']).toContain(state.to);
    }
  });

  it('is always clear without any listed weather', () => {
    for (let t = 0; t < 2000; t += 100) expect(weatherAt(5, {}, t).type).toBe('clear');
  });

  it('only walks between neighbours, never clear straight to storm', () => {
    for (let seed = 1; seed < 30; seed++) {
      for (let t = 0; t < 30000; t += 40) {
        const s = weatherAt(seed, all, t);
        if (s.from !== s.to) expect(WEATHER_TYPES[s.from].neighbours).toContain(s.to);
      }
    }
  });

  it('turns continuously from one stretch into the next', () => {
    let last = weatherAt(11, all, 0);
    for (let t = 0.5; t < 6000; t += 0.5) {
      const now = weatherAt(11, all, t);
      for (const key of ['cloudDensity', 'rainIntensity', 'wind', 'dim', 'fog'] as const) expect(Math.abs(now[key] - last[key]), `${key} at ${t}`).toBeLessThan(0.08);
      last = now;
    }
  });

  it('finishes its turn within the transition time of a stretch', () => {
    let seen = false;
    for (let t = 0; t < 4000; t += 1) {
      const s = weatherAt(2, all, t);
      if (s.blend > 0 && s.blend < 1) seen = true;
    }
    expect(seen).toBe(true);
    expect(WEATHER_TRANSITION_SECONDS).toBeLessThan(WEATHER_SEGMENT_MAX_SECONDS);
  });

  it('forces a weather and scales it for the sandbox', () => {
    const full = weatherAt(1, all, 10, { weather: 'storm' });
    expect(full.type).toBe('storm');
    expect(full.rainIntensity).toBe(1);
    expect(full.lightning).toBe(1);
    const half = weatherAt(1, all, 10, { weather: 'storm', intensity: 0.5 });
    expect(half.rainIntensity).toBeCloseTo(0.5);
    expect(weatherAt(1, all, 10, { weather: null })).toEqual(weatherAt(1, all, 10));
  });

  it('dims and darkens the light in bad weather and leaves clear weather at daylight', () => {
    const lum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    expect(weatherAt(1, all, 0, { weather: 'clear' }).light).toBe(0xffffff);
    expect(lum(weatherAt(1, all, 0, { weather: 'storm' }).light)).toBeLessThan(lum(weatherAt(1, all, 0, { weather: 'rain' }).light));
    expect(lum(weatherAt(1, all, 0, { weather: 'rain' }).light)).toBeLessThan(lum(0xffffff));
  });

  it('exposes the rain intensity for later gameplay, with no side effects', () => {
    expect(weatherAt(1, all, 0, { weather: 'rain' }).rainIntensity).toBeGreaterThan(0);
    expect(weatherAt(1, all, 0, { weather: 'clear' }).rainIntensity).toBe(0);
  });
});

describe('hash01', () => {
  it('is in [0, 1) and depends on every input', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash01(i, i * 3, i * 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hash01(1, 2, 3)).not.toBe(hash01(2, 2, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(1, 3, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(1, 2, 4));
  });
});

describe('wind', () => {
  it('sways more in more wind, never below the doodads own sway, and gusts vary over time', () => {
    expect(windSwayMultiplier({ wind: 0 }, 5)).toBe(1);
    expect(windSwayMultiplier({ wind: 0.9 }, 5)).toBeGreaterThan(windSwayMultiplier({ wind: 0.1 }, 5));
    const gusts = new Set(Array.from({ length: 50 }, (_, i) => gustAt(i * 0.37).toFixed(2)));
    expect(gusts.size).toBeGreaterThan(10);
    for (let t = 0; t < 100; t += 0.5) expect(gustAt(t)).toBeGreaterThan(0.5);
  });
});

describe('overcastOf', () => {
  it('greys the sky with cloud cover and dark clouds, and stays in 0 to 1', () => {
    expect(overcastOf({ cloudDensity: 0, cloudDarkness: 0 })).toBe(0);
    expect(overcastOf({ cloudDensity: 1, cloudDarkness: 1 })).toBe(1);
    expect(overcastOf({ cloudDensity: 0.5, cloudDarkness: 0.5 })).toBeGreaterThan(overcastOf({ cloudDensity: 0.5, cloudDarkness: 0 }));
    expect(overcastOf({ cloudDensity: 5, cloudDarkness: 5 })).toBe(1);
  });

  it('is clear in clear weather and heavy in a storm', () => {
    expect(overcastOf(weatherAt(1, {}, 0, { weather: 'clear' }))).toBeLessThan(0.2);
    expect(overcastOf(weatherAt(1, {}, 0, { weather: 'storm' }))).toBeGreaterThan(0.8);
  });
});
