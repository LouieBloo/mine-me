import type { GameItem } from '@mine-me/shared';

/** A reload can't restart before the previous one finished, so one sound covers this long at minimum. */
const MIN_DEDUPE_MS = 600;
const DEFAULT_RELOAD_SECONDS = 1.5;

/**
 * Plays a weapon's reload sound exactly once per reload, however the reload started: the player
 * pressing R (instant local feedback) or the server reloading on its own when the last round is
 * fired. Both paths call in; whichever comes first plays, and the other is ignored for the length
 * of the reload. The server's ammo updates are fed to `observeAmmo` so server-started reloads sound
 * too.
 */
export class ReloadSoundTrigger {
  private readonly now: () => number;
  private lastPlayedAt = -Infinity;
  private wasReloading = false;
  private seenAmmo = false;

  constructor(now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    this.now = now;
  }

  /** Plays the weapon's `reload` slot unless this reload already sounded. Returns whether it played. */
  public trigger(weapon: GameItem | null | undefined, play: (url: string) => void): boolean {
    const url = weapon?.soundEffects?.reload?.url;
    if (!url) return false;

    const reloadMs = (weapon?.projectileConfig?.reloadTime ?? DEFAULT_RELOAD_SECONDS) * 1000;
    const windowMs = Math.max(MIN_DEDUPE_MS, reloadMs);
    const t = this.now();
    if (t - this.lastPlayedAt < windowMs) return false;

    this.lastPlayedAt = t;
    play(url);
    return true;
  }

  /**
   * Feed every server ammo update. Plays on the not-reloading -> reloading edge. The first update
   * only records the state, so joining a run mid-reload doesn't sound a reload that began earlier.
   */
  public observeAmmo(isReloading: boolean, weapon: GameItem | null | undefined, play: (url: string) => void): boolean {
    const started = this.seenAmmo && isReloading && !this.wasReloading;
    this.seenAmmo = true;
    this.wasReloading = isReloading;
    return started ? this.trigger(weapon, play) : false;
  }
}
