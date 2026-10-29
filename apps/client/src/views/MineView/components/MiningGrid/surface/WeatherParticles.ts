import { Container, Sprite, Texture } from 'pixi.js';
import { hash01, skyInView } from '@mine-me/shared';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import { fogTexture, rainTexture, snowTexture, splashTexture } from './surfaceTextures';
import type { SurfaceView } from './SurfaceBackground';

/** The most rain streaks, snowflakes, splashes and fog bands drawn at once (a hard cap, whatever the weather says). */
export const MAX_RAIN = 360;
export const MAX_SNOW = 220;
export const MAX_SPLASHES = 48;
export const FOG_BANDS = 4;
/** How fast things fall, in pixels per second. */
const RAIN_SPEED = 950;
const SNOW_SPEED = 55;
/** How long a splash lasts, in seconds. */
const SPLASH_SECONDS = 0.28;
/** Sideways slant of falling rain per unit of wind (pixels across per pixel down). */
const WIND_SLANT = 0.7;
/** The view width the particle counts are made for; wider views get more, narrower fewer (within limits). */
const REFERENCE_WIDTH = 900;

/** `value` wrapped into [0, span). */
const wrap = (value: number, span: number): number => ((value % span) + span) % span;

export interface WeatherParticleState {
  rainIntensity: number;
  snow: number;
  fog: number;
  wind: number;
}

interface Splash {
  sprite: Sprite;
  age: number;
}

/**
 * Rain, snow, splashes and fog (ticket 133). Everything falls between the top of the view and the horizon only: precipitation
 * stops at the ground and never falls into the mine, shafts included. The number of streaks and flakes follows the weather's
 * intensity and is capped; with no sky in view nothing is updated and the whole layer is hidden. Particle motion is cosmetic
 * and runs on the local clock; the weather itself is the shared pure function.
 */
export class WeatherParticles {
  public readonly root = new Container();
  private readonly rain: Sprite[] = [];
  private readonly snow: Sprite[] = [];
  private readonly fog: Sprite[] = [];
  private readonly splashes: Splash[] = [];
  private readonly lastY: number[] = [];
  private activeCount = 0;
  private readonly seed: number;
  private readonly tileSize: number;
  private lastTime = 0;

  constructor(parent: Container, options: { seed: number; tileSize?: number }) {
    this.seed = options.seed;
    this.tileSize = options.tileSize ?? TILE_SIZE;
    this.root.label = 'weather-particles';
    const rainTex = rainTexture();
    const snowTex = snowTexture();
    const fogTex = fogTexture();
    const splashTex = splashTexture();
    this.fog.push(...this.makePool(FOG_BANDS, fogTex));
    this.rain.push(...this.makePool(MAX_RAIN, rainTex));
    this.snow.push(...this.makePool(MAX_SNOW, snowTex));
    for (const sprite of this.makePool(MAX_SPLASHES, splashTex)) {
      sprite.anchor.set(0.5);
      this.splashes.push({ sprite, age: SPLASH_SECONDS });
    }
    for (let i = 0; i < MAX_RAIN; i++) this.lastY.push(Number.POSITIVE_INFINITY);
    parent.addChild(this.root);
  }

  /** How many particles are showing right now (streaks, flakes, splashes and fog bands), for the performance overlay. */
  public get particleCount(): number {
    return this.activeCount;
  }

  /** How many display objects the layer holds. */
  public get objectCount(): number {
    return this.rain.length + this.snow.length + this.fog.length + this.splashes.length;
  }

  /**
   * `view` is the part of the world on screen, `horizonY` the ground surface (world pixels), `fade` the share of the
   * weather that reaches the camera (it falls away as the camera goes down), `timeSeconds` the local clock for the motion.
   */
  public update(view: SurfaceView, horizonY: number, weather: WeatherParticleState, fade: number, timeSeconds: number): void {
    const dt = this.lastTime === 0 ? 0 : Math.min(0.1, Math.max(0, timeSeconds - this.lastTime));
    this.lastTime = timeSeconds;
    const strength = Math.max(0, Math.min(1, fade));
    const inView = skyInView(view.top, horizonY) && strength > 0.001 && (weather.rainIntensity > 0.01 || weather.snow > 0.01 || weather.fog > 0.01);
    this.root.visible = inView;
    if (!inView) {
      this.activeCount = 0;
      return;
    }
    const widthScale = Math.min(2, Math.max(0.5, view.width / REFERENCE_WIDTH));
    let active = 0;
    active += this.updateRain(view, horizonY, weather, strength, widthScale, timeSeconds, dt);
    active += this.updateSnow(view, horizonY, weather, strength, widthScale, timeSeconds);
    active += this.updateSplashes(dt);
    active += this.updateFog(view, horizonY, weather.fog * strength, timeSeconds);
    this.activeCount = active;
  }

  public destroy(): void {
    this.root.destroy({ children: true });
  }

  private makePool(count: number, texture: Texture): Sprite[] {
    const pool: Sprite[] = [];
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(texture);
      sprite.visible = false;
      this.root.addChild(sprite);
      pool.push(sprite);
    }
    return pool;
  }

  private updateRain(view: SurfaceView, horizonY: number, weather: WeatherParticleState, strength: number, widthScale: number, t: number, dt: number): number {
    const wanted = Math.min(MAX_RAIN, Math.round(MAX_RAIN * Math.min(1, weather.rainIntensity * strength) * widthScale * 0.6));
    const slant = weather.wind * WIND_SLANT;
    // Every streak lives in the world, not on the screen: it falls through a fixed span and wraps round the view's edges, so
    // moving the camera moves the rain past you instead of carrying it along
    const span = Math.max(1, view.height);
    for (let i = 0; i < this.rain.length; i++) {
      const sprite = this.rain[i];
      if (i >= wanted) {
        sprite.visible = false;
        continue;
      }
      const speed = RAIN_SPEED * (0.8 + hash01(this.seed, i, 83) * 0.4);
      const y = view.top + wrap(hash01(this.seed, i, 82) * span + t * speed - view.top, span);
      const down = y - view.top;
      const x = view.left + wrap(hash01(this.seed, i, 81) * view.width - view.left, view.width) + slant * down;
      // A streak that crossed the ground since the last frame has landed: a splash where it hit
      const previousY = this.lastY[i];
      if (previousY < horizonY && y >= horizonY && y - previousY < span / 2 && dt > 0 && i % 3 === 0) this.splash(x, horizonY);
      this.lastY[i] = y;
      // Never into the mine
      sprite.visible = y <= horizonY;
      sprite.alpha = (0.35 + hash01(this.seed, i, 84) * 0.4) * Math.min(1, weather.rainIntensity * strength + 0.2);
      sprite.rotation = -Math.atan(slant);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(x, y);
    }
    return wanted;
  }

  private updateSnow(view: SurfaceView, horizonY: number, weather: WeatherParticleState, strength: number, widthScale: number, t: number): number {
    const wanted = Math.min(MAX_SNOW, Math.round(MAX_SNOW * Math.min(1, weather.snow * strength) * widthScale * 0.7));
    const span = Math.max(1, view.height);
    for (let i = 0; i < this.snow.length; i++) {
      const sprite = this.snow[i];
      if (i >= wanted) {
        sprite.visible = false;
        continue;
      }
      const speed = SNOW_SPEED * (0.6 + hash01(this.seed, i, 93) * 0.8);
      // World-anchored like the rain: the camera moving carries the flakes past, not along
      const y = view.top + wrap(hash01(this.seed, i, 92) * span + t * speed - view.top, span);
      const sway = Math.sin(t * 1.3 + hash01(this.seed, i, 94) * 6.28) * 14 + weather.wind * (y - view.top) * 0.25;
      sprite.visible = y <= horizonY;
      sprite.alpha = 0.5 + hash01(this.seed, i, 95) * 0.4;
      sprite.scale.set(0.45 + hash01(this.seed, i, 96) * 0.55);
      sprite.position.set(view.left + wrap(hash01(this.seed, i, 91) * view.width - view.left, view.width) + sway, y);
    }
    return wanted;
  }

  private splash(x: number, y: number): void {
    const free = this.splashes.find((s) => s.age >= SPLASH_SECONDS);
    if (!free) return;
    free.age = 0;
    free.sprite.visible = true;
    free.sprite.position.set(x, y);
    free.sprite.scale.set(0.4);
    free.sprite.alpha = 0.8;
  }

  private updateSplashes(dt: number): number {
    let live = 0;
    for (const s of this.splashes) {
      if (s.age >= SPLASH_SECONDS) {
        s.sprite.visible = false;
        continue;
      }
      s.age += dt;
      const t = Math.min(1, s.age / SPLASH_SECONDS);
      s.sprite.scale.set(0.4 + t * 0.9);
      s.sprite.alpha = 0.8 * (1 - t);
      if (s.age >= SPLASH_SECONDS) s.sprite.visible = false;
      else live++;
    }
    return live;
  }

  private updateFog(view: SurfaceView, horizonY: number, fog: number, t: number): number {
    if (fog <= 0.01) {
      for (const band of this.fog) band.visible = false;
      return 0;
    }
    const height = this.tileSize * 14;
    const width = view.width * 1.5;
    this.fog.forEach((band, i) => {
      band.visible = true;
      band.alpha = Math.min(0.7, fog * 0.6) * (0.6 + 0.4 * hash01(this.seed, i, 101));
      band.width = width;
      band.height = height * (0.7 + 0.3 * hash01(this.seed, i, 102));
      const drift = Math.sin(t * 0.05 + i * 1.7) * view.width * 0.15;
      band.position.set(view.left - width * 0.25 + drift, horizonY - band.height * (0.35 + i * 0.22));
    });
    return this.fog.length;
  }
}
