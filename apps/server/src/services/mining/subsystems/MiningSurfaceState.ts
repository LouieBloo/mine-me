import {
  pickSurfaceEnvironment,
  weatherAt,
  type SurfaceClientState,
  type SurfaceEnvironmentDefinition,
  type SurfaceOverride,
  type SurfaceUpdateWire,
  type WeatherId,
  type WeatherState,
} from '@mine-me/shared';

export interface SurfaceStateOptions {
  seed: number;
  environments: readonly SurfaceEnvironmentDefinition[];
  /** Server time (ms since epoch) the weather clock starts at. */
  startedAt?: number;
  /** A particular environment to use (the sandbox). */
  preferredKey?: string | null;
}

/**
 * The surface of one room (tickets 129, 132): which environment it has, the clock its weather runs on and anything the
 * sandbox has forced. The weather itself is never stored or sent tick by tick: it is a pure function of the seed and the
 * clock (see `weatherAt`), so this only has to hand clients the starting facts once, and any later change.
 */
export class MiningSurfaceState {
  public readonly seed: number;
  public readonly startedAt: number;
  private environments: readonly SurfaceEnvironmentDefinition[];
  private current: SurfaceEnvironmentDefinition;
  private override: SurfaceOverride | null = null;
  private dirty = false;

  constructor(options: SurfaceStateOptions) {
    this.seed = options.seed;
    this.startedAt = options.startedAt ?? Date.now();
    this.environments = options.environments;
    this.current = pickSurfaceEnvironment(options.seed, options.environments, options.preferredKey);
  }

  public get environment(): SurfaceEnvironmentDefinition {
    return this.current;
  }

  public get forcedWeather(): WeatherId | null {
    return this.override?.weather ?? null;
  }

  /** Seconds on the weather clock at a server time. */
  public clockAt(nowMs: number): number {
    return Math.max(0, (nowMs - this.startedAt) / 1000);
  }

  /** The weather right now (what a client would work out for itself). */
  public weatherNow(nowMs: number = Date.now()): WeatherState {
    return weatherAt(this.seed, this.current, this.clockAt(nowMs), this.override);
  }

  /** Everything a client needs to draw and play the surface, sent once with the session. */
  public clientState(nowMs: number = Date.now()): SurfaceClientState {
    return { environment: this.current, seed: this.seed, startedAt: this.startedAt, serverNow: nowMs, override: this.override };
  }

  /** The sandbox picks another environment by key. False (nothing changes) when there is no such environment. */
  public setEnvironment(key: string): boolean {
    const found = this.environments.find((e) => e.key === key);
    if (!found) return false;
    this.current = found;
    this.dirty = true;
    return true;
  }

  /** Forces a weather (null: back to the seeded one). Keeps a pending strike. */
  public forceWeather(weather: WeatherId | null, intensity?: number): void {
    this.override = { ...(this.override ?? {}), weather, intensity: weather ? intensity ?? 1 : undefined };
    this.dirty = true;
  }

  /** Calls a lightning strike for right now. */
  public triggerLightning(nowMs: number = Date.now()): void {
    this.override = { ...(this.override ?? {}), strikeAt: this.clockAt(nowMs) + 0.05 };
    this.dirty = true;
  }

  /** Clears everything the sandbox forced. */
  public clearOverride(): void {
    if (!this.override) return;
    this.override = null;
    this.dirty = true;
  }

  /** What changed since the last call, for the next state tick (undefined when nothing did). */
  public takeUpdate(nowMs: number = Date.now()): SurfaceUpdateWire | undefined {
    if (!this.dirty) return undefined;
    this.dirty = false;
    return { environment: this.current, override: this.override, serverNow: nowMs };
  }
}
