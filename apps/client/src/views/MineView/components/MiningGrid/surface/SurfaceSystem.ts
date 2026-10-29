import type { Container } from 'pixi.js';
import {
  lerpColor,
  lightningAt,
  multiplyColors,
  overcastOf,
  parseCssColor,
  skyInView,
  strikesBetween,
  surfaceFade,
  weatherAt,
  windSwayMultiplier,
  type SurfaceClientState,
  type SurfaceEnvironmentDefinition,
  type SurfaceOverride,
  type SurfaceUpdateWire,
  type WeatherState,
} from '@mine-me/shared';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import { CloudField } from './CloudField';
import { LightningRenderer } from './LightningRenderer';
import { SurfaceBackground, type SurfaceTextureLoader, type SurfaceView } from './SurfaceBackground';
import { SurfaceClock } from './SurfaceClock';
import { SurfaceSounds } from './SurfaceSounds';
import { WeatherParticles } from './WeatherParticles';

/** The parts of the lighting engine, the doodad renderer and the sound manager the surface talks to (so tests can pass fakes). */
export interface SurfaceLighting {
  setSkyLight(color: number): void;
}
export interface SurfaceDoodads {
  setSurfaceRow(row: number): void;
  setWeather(type: string, windSway: number): void;
}

export interface SurfaceSystemOptions {
  /** The world container the sky and scenery go into (behind the terrain). */
  backgroundParent: Container;
  /** The world container the rain, fog and lightning go into (in front of everything on the surface). */
  weatherParent: Container;
  /** The ground surface row. */
  surfaceRow: number;
  /** The width of the map in cells. */
  mapWidthCells: number;
  lighting?: SurfaceLighting | null;
  doodads?: SurfaceDoodads | null;
  sounds?: ConstructorParameters<typeof SurfaceSounds>[0] | null;
  /** Whether the player asked for fewer lightning flashes (read every frame). */
  reduceFlashes?: () => boolean;
  /** The local clock in ms. */
  now?: () => number;
  tileSize?: number;
  loadTexture?: SurfaceTextureLoader;
}

/** What the surface is made of right now, for the performance overlay. */
export interface SurfaceStats {
  objects: number;
  clouds: number;
  particles: number;
  active: boolean;
}

/** Longest stretch of weather clock a frame looks back for lightning, so a tab coming back does not replay minutes of thunder. */
const LIGHTNING_LOOKBACK_SECONDS = 10;
/** Channel steps the sky light is rounded to, so a slow change does not redraw the lightmap every frame. */
const SKY_LIGHT_STEP = 4;

/** Rounds each colour channel to a step. */
export function quantizeColor(color: number, step: number = SKY_LIGHT_STEP): number {
  const q = (shift: number) => Math.min(255, Math.round(((color >> shift) & 0xff) / step) * step);
  return (q(16) << 16) | (q(8) << 8) | q(0);
}

/**
 * The light above the ground: the weather's light multiplied by the environment's tint, brightened towards daylight by a
 * lightning flash (0 to 1). White is full daylight.
 */
export function skyLightColor(weatherLight: number, ambientTint: string | null | undefined, flash: number): number {
  const tinted = ambientTint ? multiplyColors(weatherLight, parseCssColor(ambientTint)) : weatherLight;
  return lerpColor(tinted, 0xffffff, Math.min(1, Math.max(0, flash)));
}

/**
 * The surface above the ground (tickets 129-135), as the game draws and plays it: the sky and scenery, the clouds, rain, snow
 * and fog, lightning, the sky light, the wind on the surface doodads and the weather sounds. Every frame it works out the
 * weather from the shared pure function (the run's seed and the weather clock), so all players see the same sky without being
 * told. Underground it does next to nothing: the layers are hidden, and only the sounds are told to be quiet.
 */
export class SurfaceSystem {
  private environment: SurfaceEnvironmentDefinition;
  private override: SurfaceOverride | null;
  private clock: SurfaceClock;
  private readonly seed: number;
  private readonly background: SurfaceBackground;
  private readonly clouds: CloudField;
  private readonly particles: WeatherParticles;
  private readonly lightning: LightningRenderer;
  private readonly sounds: SurfaceSounds | null;
  private readonly lighting: SurfaceLighting | null;
  private readonly doodads: SurfaceDoodads | null;
  private readonly reduceFlashes: () => boolean;
  private readonly now: () => number;
  private readonly surfaceY: number;
  private readonly tileSize: number;
  private lastClock = -1;
  private silent = false;
  private lastWeather: WeatherState | null = null;
  /** Called with the name of each costly phase as it starts (the profiler listens, nothing else does). */
  public onPhase: ((name: string) => void) | null = null;

  constructor(state: SurfaceClientState, options: SurfaceSystemOptions) {
    this.environment = state.environment;
    this.override = state.override ?? null;
    this.seed = state.seed;
    this.now = options.now ?? Date.now;
    this.clock = new SurfaceClock(state.startedAt, state.serverNow, this.now());
    this.tileSize = options.tileSize ?? TILE_SIZE;
    this.surfaceY = options.surfaceRow * this.tileSize;
    this.lighting = options.lighting ?? null;
    this.doodads = options.doodads ?? null;
    this.reduceFlashes = options.reduceFlashes ?? (() => false);
    this.background = new SurfaceBackground(options.backgroundParent, this.environment, {
      surfaceY: this.surfaceY,
      mapWidth: options.mapWidthCells * this.tileSize,
      seed: this.seed,
      tileSize: this.tileSize,
      loadTexture: options.loadTexture,
    });
    this.clouds = new CloudField(this.background.cloudLayer, this.environment, { surfaceY: this.surfaceY, seed: this.seed, tileSize: this.tileSize, loadTexture: options.loadTexture });
    this.particles = new WeatherParticles(options.weatherParent, { seed: this.seed, tileSize: this.tileSize });
    this.lightning = new LightningRenderer(options.weatherParent);
    this.sounds = options.sounds ? new SurfaceSounds(options.sounds, this.environment) : null;
    this.doodads?.setSurfaceRow(options.surfaceRow);
  }

  /** The environment in use. */
  public get currentEnvironment(): SurfaceEnvironmentDefinition {
    return this.environment;
  }

  /** The weather the last frame worked out (null before the first). */
  public get weather(): WeatherState | null {
    return this.lastWeather;
  }

  public get stats(): SurfaceStats {
    return {
      objects: this.background.objectCount + this.clouds.poolSize + this.particles.objectCount + 2,
      clouds: this.clouds.visibleCount,
      particles: this.particles.particleCount,
      active: this.background.active,
    };
  }

  /** The sandbox changed the surface: another environment, or a forced weather. */
  public apply(update: SurfaceUpdateWire): void {
    if (update.environment && update.environment.key !== this.environment.key) {
      this.environment = update.environment;
      this.background.setEnvironment(this.environment);
      this.clouds.setEnvironment(this.environment);
      this.sounds?.setEnvironment(this.environment);
    }
    if (update.override !== undefined) this.override = update.override;
  }

  /**
   * Brings everything up to date for the camera. `view` is the part of the world on screen (world pixels), `cameraY` the
   * camera's centre (world pixels), `timeSeconds` the local clock for the cosmetic motion.
   */
  public update(view: SurfaceView, cameraY: number, timeSeconds: number): void {
    const fade = surfaceFade(cameraY, this.surfaceY, this.tileSize);
    const skyVisible = skyInView(view.top, this.surfaceY);
    // Deep underground there is nothing to see or hear: hide the layers and silence the sounds once, then do no work at all
    if (!skyVisible && fade === 0) {
      if (!this.silent) {
        this.silent = true;
        this.background.update(view);
        this.particles.update(view, this.surfaceY, { rainIntensity: 0, snow: 0, fog: 0, wind: 0 }, 0, timeSeconds);
        this.lightning.update(view, this.surfaceY, 0, null, false);
        this.sounds?.update({ rainIntensity: 0, snow: 0, wind: 0 }, 0, [], this.lastClock);
        this.lighting?.setSkyLight(0xffffff);
      }
      return;
    }
    this.silent = false;

    const clock = this.clock.seconds(this.now());
    const weather = weatherAt(this.seed, this.environment, clock, this.override);
    this.lastWeather = weather;

    // Lightning: the flash now, and the strikes that began since the last frame (for the thunder)
    const mayStrike = weather.lightning > 0 || typeof this.override?.strikeAt === 'number';
    const flash = mayStrike ? lightningAt(this.seed, this.environment, clock, this.override) : { flash: 0, strike: null };
    const strikes = mayStrike ? strikesBetween(this.seed, this.environment, Math.max(this.lastClock, clock - LIGHTNING_LOOKBACK_SECONDS), clock, this.override) : [];
    this.lastClock = clock;

    this.onPhase?.('Surface Background');
    this.background.setOvercast(overcastOf(weather));
    this.background.update(view);
    if (this.background.active) {
      this.onPhase?.('Clouds');
      this.clouds.update(view, weather, clock);
    }
    this.onPhase?.('Weather Particles');
    this.particles.update(view, this.surfaceY, { rainIntensity: weather.rainIntensity, snow: weather.snow, fog: weather.fog, wind: weather.wind }, fade, timeSeconds);
    this.lightning.update(view, this.surfaceY, flash.flash, flash.strike, this.reduceFlashes());

    this.lighting?.setSkyLight(quantizeColor(skyLightColor(weather.light, this.environment.ambientTint, this.lightning.flashLevel)));
    this.doodads?.setWeather(weather.type, windSwayMultiplier(weather, clock));
    this.sounds?.update(weather, fade, strikes, clock);
  }

  public destroy(): void {
    this.sounds?.stopAll();
    this.lighting?.setSkyLight(0xffffff);
    this.clouds.destroy();
    this.background.destroy();
    this.particles.destroy();
    this.lightning.destroy();
  }
}
