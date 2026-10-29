import type { SurfaceEnvironmentDefinition, SurfaceOverride, WeatherId } from '../../types/surface';
import { lerpColor, multiplyColors, parseCssColor } from '../surface/surfaceColor';
import { WEATHER_TYPES, isWeatherId } from './weatherTypes';

/**
 * The weather as a pure function of the run's seed and the time (ticket 132): two clients, or a client that joins late,
 * work out the same weather from the same seed and clock, so the server never sends it tick by tick. Nothing here uses
 * `Math.random` or the real clock.
 */

/** Seconds a stretch of one weather lasts (a random length in this range per stretch). */
export const WEATHER_SEGMENT_MIN_SECONDS = 300;
export const WEATHER_SEGMENT_MAX_SECONDS = 600;
/** Seconds the weather takes to turn into the next at the start of a stretch. */
export const WEATHER_TRANSITION_SECONDS = 30;

/** How strongly the next weather may be the same as the last one (against 1 for each neighbour). */
const STAY_WEIGHT = 0.5;
const MAX_SEGMENTS = 5000;

/** A well mixed number in [0, 1) for a seed and two integers. Pure. */
export function hash01(seed: number, a: number, b = 0): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(a | 0, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** What the weather is like at one moment. Every intensity runs from 0 to 1. */
export interface WeatherState {
  /** The weather it is mostly (the one it is turning into once the turn is past halfway). */
  type: WeatherId;
  from: WeatherId;
  to: WeatherId;
  /** How far the turn from `from` to `to` has got, 0 to 1. */
  blend: number;
  cloudDensity: number;
  cloudDarkness: number;
  /** How hard it rains (the hook for a later ticket that wets the surface or douses fire). */
  rainIntensity: number;
  snow: number;
  fog: number;
  wind: number;
  /** How much the surface light is dimmed. */
  dim: number;
  /** How likely lightning is. */
  lightning: number;
  /** The colour the surface light is multiplied by (1 = daylight white; dimmer and tinted in bad weather). */
  light: number;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The weather types an environment allows, with weights. No weather listed (or none above 0): always clear. */
export function allowedWeather(env: Pick<SurfaceEnvironmentDefinition, 'weather'> | null | undefined): { id: WeatherId; weight: number }[] {
  const out: { id: WeatherId; weight: number }[] = [];
  for (const [id, weight] of Object.entries(env?.weather ?? {})) {
    if (isWeatherId(id) && typeof weight === 'number' && Number.isFinite(weight) && weight > 0) out.push({ id, weight });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out.length > 0 ? out : [{ id: 'clear', weight: 1 }];
}

function pickWeighted(items: readonly { id: WeatherId; weight: number }[], roll: number): WeatherId {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let at = roll * total;
  for (const item of items) {
    at -= item.weight;
    if (at < 0) return item.id;
  }
  return items[items.length - 1].id;
}

/** The stretches of weather a seed makes, extended as far as the clock asks. */
class WeatherSchedule {
  private readonly ids: WeatherId[] = [];
  private readonly starts: number[] = [0];

  private readonly seed: number;
  private readonly allowed: readonly { id: WeatherId; weight: number }[];

  constructor(seed: number, allowed: readonly { id: WeatherId; weight: number }[]) {
    this.seed = seed;
    this.allowed = allowed;
  }

  private length(index: number): number {
    return WEATHER_SEGMENT_MIN_SECONDS + hash01(this.seed, index, 1) * (WEATHER_SEGMENT_MAX_SECONDS - WEATHER_SEGMENT_MIN_SECONDS);
  }

  private choose(index: number): WeatherId {
    if (index === 0) return pickWeighted(this.allowed, hash01(this.seed, 0, 2));
    const previous = this.ids[index - 1];
    const options: { id: WeatherId; weight: number }[] = [];
    for (const a of this.allowed) {
      if (a.id === previous) options.push({ id: a.id, weight: a.weight * STAY_WEIGHT });
      else if (WEATHER_TYPES[previous].neighbours.includes(a.id)) options.push({ id: a.id, weight: a.weight });
    }
    // Nothing allowed next door: take any other allowed weather, else stay
    if (options.length === 0) {
      const others = this.allowed.filter((a) => a.id !== previous);
      return pickWeighted(others.length > 0 ? others : this.allowed, hash01(this.seed, index, 2));
    }
    return pickWeighted(options, hash01(this.seed, index, 2));
  }

  private extendTo(index: number): void {
    while (this.ids.length <= index && this.ids.length < MAX_SEGMENTS) {
      const i = this.ids.length;
      this.ids.push(this.choose(i));
      this.starts.push(this.starts[i] + this.length(i));
    }
  }

  /** The stretch the time falls in, and when it began. */
  public segmentAt(t: number): { index: number; start: number; id: WeatherId; previous: WeatherId | null } {
    const time = Math.max(0, Number.isFinite(t) ? t : 0);
    let index = 0;
    while (index < MAX_SEGMENTS - 1) {
      this.extendTo(index);
      if (time < this.starts[index + 1]) break;
      index++;
    }
    this.extendTo(index);
    const clamped = Math.min(index, this.ids.length - 1);
    return { index: clamped, start: this.starts[clamped], id: this.ids[clamped], previous: clamped > 0 ? this.ids[clamped - 1] : null };
  }
}

const schedules = new Map<string, WeatherSchedule>();

function scheduleFor(seed: number, allowed: readonly { id: WeatherId; weight: number }[]): WeatherSchedule {
  const key = `${seed}|${allowed.map((a) => `${a.id}:${a.weight}`).join(',')}`;
  let schedule = schedules.get(key);
  if (!schedule) {
    if (schedules.size >= 12) schedules.delete(schedules.keys().next().value as string);
    schedule = new WeatherSchedule(seed, allowed);
    schedules.set(key, schedule);
  }
  return schedule;
}

/** The numbers of a weather, scaled by an intensity (a forced weather in the sandbox). */
function stateOf(from: WeatherId, to: WeatherId, blend: number, scale: number): WeatherState {
  const a = WEATHER_TYPES[from];
  const b = WEATHER_TYPES[to];
  const t = blend;
  const pick = (key: 'cloudDensity' | 'cloudDarkness' | 'rain' | 'snow' | 'fog' | 'wind' | 'dim' | 'lightning') => mix(a[key], b[key], t) * scale;
  const dim = pick('dim');
  const tintA = a.tint ? parseCssColor(a.tint) : 0xffffff;
  const tintB = b.tint ? parseCssColor(b.tint) : 0xffffff;
  const tint = lerpColor(0xffffff, lerpColor(tintA, tintB, t), scale);
  // The tint colours the light and the dimming darkens it
  const grey = Math.round(255 * (1 - 0.6 * Math.min(1, dim)));
  const light = multiplyColors(tint, (grey << 16) | (grey << 8) | grey);
  return {
    type: t < 0.5 ? from : to,
    from,
    to,
    blend: t,
    cloudDensity: pick('cloudDensity'),
    cloudDarkness: pick('cloudDarkness'),
    rainIntensity: pick('rain'),
    snow: pick('snow'),
    fog: pick('fog'),
    wind: pick('wind'),
    dim,
    lightning: pick('lightning'),
    light,
  };
}

/**
 * The weather `t` seconds after the run's weather clock started. `override` (the sandbox) forces one weather at a
 * strength; without it the seeded schedule decides, turning smoothly from one stretch's weather into the next.
 */
export function weatherAt(seed: number, env: Pick<SurfaceEnvironmentDefinition, 'weather'> | null | undefined, t: number, override?: SurfaceOverride | null): WeatherState {
  if (override?.weather && isWeatherId(override.weather)) {
    const intensity = typeof override.intensity === 'number' && Number.isFinite(override.intensity) ? Math.min(1, Math.max(0, override.intensity)) : 1;
    return stateOf(override.weather, override.weather, 1, intensity);
  }
  const schedule = scheduleFor(seed, allowedWeather(env));
  const segment = schedule.segmentAt(t);
  if (!segment.previous) return stateOf(segment.id, segment.id, 1, 1);
  const into = (Math.max(0, t) - segment.start) / WEATHER_TRANSITION_SECONDS;
  return stateOf(segment.previous, segment.id, smooth(Math.min(1, Math.max(0, into))), 1);
}

/** The gusts on top of the wind: a slow wobble, so the sway never looks mechanical. 0.6 to 1.4. */
export function gustAt(t: number): number {
  return 1 + 0.25 * Math.sin(t * 0.9) + 0.15 * Math.sin(t * 2.3 + 1.7);
}

/**
 * How much stronger than usual the surface doodads sway (1 = their own sway, no wind). Fed to the doodad motion system
 * for the doodads standing on the surface only.
 */
export function windSwayMultiplier(state: Pick<WeatherState, 'wind'>, t: number): number {
  return 1 + 2.5 * state.wind * gustAt(t);
}

/** How overcast the sky looks for a weather, 0 (blue) to 1 (grey): cloud cover and darkness both grey it. */
export function overcastOf(weather: Pick<WeatherState, 'cloudDensity' | 'cloudDarkness'>): number {
  return Math.min(1, weather.cloudDensity * 0.5 + weather.cloudDarkness * 0.7);
}
