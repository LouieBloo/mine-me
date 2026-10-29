import type { LightningStrike, SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { withVolume } from '../../../../../services/sound/sfxVolume';
import type { SoundManager } from '../../../../../services/sound';

type Sounds = Pick<SoundManager, 'playSfx' | 'playLoopingSfx' | 'stopLoopingSfx'>;

/** The keys of the two loops in the sound manager. */
export const RAIN_LOOP_KEY = 'surface_rain';
export const WIND_LOOP_KEY = 'surface_wind';
/** A loop quieter than this is stopped altogether. */
export const LOOP_FLOOR = 0.02;
/** Loop volumes change in steps of this, so the sound manager is not told every frame. */
const LOOP_STEP = 0.05;
/** Thunder that should have played longer ago than this (the tab was hidden) is dropped. */
const STALE_THUNDER_SECONDS = 4;
/** How much quieter thunder from the farthest strike is. */
const FAR_THUNDER = 0.55;

interface Thunder {
  playAt: number;
  distance: number;
}

/**
 * What the surface sounds like (ticket 134). Every sound comes from the environment's own sound slots (library sounds, each
 * with its own volume), so an environment with none is silent and nothing here names a sound. The rain and wind loops follow the
 * weather's intensities; thunder plays after each flash, later the farther the strike. All of it fades with the camera's depth
 * (the same fade as the weather), so underground it is silent and the loops are stopped.
 */
export class SurfaceSounds {
  private readonly sound: Sounds;
  private environment: SurfaceEnvironmentDefinition;
  private readonly loopLevel = new Map<string, number>();
  private thunder: Thunder[] = [];

  constructor(sound: Sounds, environment: SurfaceEnvironmentDefinition) {
    this.sound = sound;
    this.environment = environment;
  }

  /** How many loops are playing, and how much thunder is on its way (for tests and the overlay). */
  public get activeLoops(): number {
    return this.loopLevel.size;
  }

  public get pendingThunder(): number {
    return this.thunder.length;
  }

  public setEnvironment(environment: SurfaceEnvironmentDefinition): void {
    this.environment = environment;
    this.stopAll();
  }

  /**
   * `weather` is what the shared maths says now, `fade` how much of the surface the camera still hears (1 at the surface, 0
   * deep down), `strikes` the lightning strikes whose flash began since the last call, `clock` the weather clock in seconds.
   */
  public update(weather: { rainIntensity: number; snow: number; wind: number }, fade: number, strikes: readonly LightningStrike[], clock: number): void {
    const sounds = this.environment.sounds ?? {};
    this.setLoop(RAIN_LOOP_KEY, sounds.rain, weather.rainIntensity * fade);
    this.setLoop(WIND_LOOP_KEY, sounds.wind, Math.min(1, weather.wind + weather.snow * 0.2) * fade);
    for (const strike of strikes) this.thunder.push({ playAt: strike.time + strike.thunderDelay, distance: strike.distance });
    this.playDueThunder(sounds.thunder, fade, clock);
  }

  /** Stops every loop and forgets the thunder that was coming. */
  public stopAll(): void {
    for (const key of this.loopLevel.keys()) this.sound.stopLoopingSfx(key);
    this.loopLevel.clear();
    this.thunder = [];
  }

  private setLoop(key: string, slot: { url?: string | null; volume?: number } | undefined, level: number): void {
    const url = slot?.url;
    const stepped = Math.round(Math.min(1, Math.max(0, level)) / LOOP_STEP) * LOOP_STEP;
    if (!url || stepped < LOOP_FLOOR) {
      if (this.loopLevel.has(key)) {
        this.sound.stopLoopingSfx(key);
        this.loopLevel.delete(key);
      }
      return;
    }
    if (this.loopLevel.get(key) === stepped) return;
    this.loopLevel.set(key, stepped);
    this.sound.playLoopingSfx(key, url, withVolume(slot.volume, { volumeScale: stepped }));
  }

  private playDueThunder(slot: { url?: string | null; volume?: number } | undefined, fade: number, clock: number): void {
    if (this.thunder.length === 0) return;
    const due: Thunder[] = [];
    this.thunder = this.thunder.filter((t) => {
      if (t.playAt > clock) return true;
      due.push(t);
      return false;
    });
    if (!slot?.url || fade < LOOP_FLOOR) return;
    for (const t of due) {
      if (clock - t.playAt > STALE_THUNDER_SECONDS) continue;
      this.sound.playSfx(slot.url, withVolume(slot.volume, { volumeScale: fade * (1 - (1 - FAR_THUNDER) * t.distance) }));
    }
  }
}
