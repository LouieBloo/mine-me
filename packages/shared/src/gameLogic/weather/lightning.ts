import type { SurfaceEnvironmentDefinition, SurfaceOverride } from '../../types/surface';
import { hash01, weatherAt } from './weather';

/**
 * Lightning and thunder (ticket 134), from the same seed and clock as the weather, so every player sees the flash at the same
 * moment. Only the sound's delay depends on how far away the strike is.
 */

/** Seconds per slot; each slot may hold one strike. */
export const LIGHTNING_SLOT_SECONDS = 3;
/** The chance a slot has a strike when lightning is certain (a storm). */
export const LIGHTNING_SLOT_CHANCE = 0.3;
/** Seconds a flash takes to fade (one pulse). */
export const FLASH_FADE_SECONDS = 0.2;
/** Seconds between the two pulses of a strike. */
export const FLASH_PULSE_GAP_SECONDS = 0.24;
/** Seconds of thunder delay per unit of distance, and the least delay. */
const THUNDER_DELAY_PER_DISTANCE = 5;
const THUNDER_MIN_DELAY = 0.35;

export interface LightningStrike {
  /** Weather-clock seconds the flash starts. */
  time: number;
  /** Where along the sky it strikes, 0 (left of the screen) to 1 (right). */
  x: number;
  /** 0 = right overhead, 1 = far away. */
  distance: number;
  /** Seconds after the flash the thunder is heard. */
  thunderDelay: number;
}

const strikeOf = (time: number, x: number, distance: number): LightningStrike => ({ time, x, distance, thunderDelay: THUNDER_MIN_DELAY + distance * THUNDER_DELAY_PER_DISTANCE });

/** The strike in a slot, if lightning is likely enough there. */
function strikeInSlot(seed: number, env: Pick<SurfaceEnvironmentDefinition, 'weather'> | null | undefined, slot: number, override?: SurfaceOverride | null): LightningStrike | null {
  const start = slot * LIGHTNING_SLOT_SECONDS;
  const chance = weatherAt(seed, env, start, override).lightning * LIGHTNING_SLOT_CHANCE;
  if (chance <= 0 || hash01(seed, slot, 7) >= chance) return null;
  return strikeOf(start + hash01(seed, slot, 8) * (LIGHTNING_SLOT_SECONDS - 0.6), hash01(seed, slot, 9), hash01(seed, slot, 10));
}

/** The strikes whose flash starts in the time range (from, to], oldest first, including a strike the sandbox called for. */
export function strikesBetween(seed: number, env: Pick<SurfaceEnvironmentDefinition, 'weather'> | null | undefined, from: number, to: number, override?: SurfaceOverride | null): LightningStrike[] {
  const out: LightningStrike[] = [];
  if (!(to > from)) return out;
  const first = Math.max(0, Math.floor(from / LIGHTNING_SLOT_SECONDS) - 1);
  const last = Math.floor(to / LIGHTNING_SLOT_SECONDS);
  for (let slot = first; slot <= last; slot++) {
    const strike = strikeInSlot(seed, env, slot, override);
    if (strike && strike.time > from && strike.time <= to) out.push(strike);
  }
  if (typeof override?.strikeAt === 'number' && override.strikeAt > from && override.strikeAt <= to) out.push(strikeOf(override.strikeAt, 0.5, 0.3));
  return out.sort((a, b) => a.time - b.time);
}

/** The brightness of one strike's flash `since` seconds after it began: a sharp pulse, then a smaller second one. */
export function flashOf(since: number): number {
  if (since < 0) return 0;
  const pulse = (s: number, peak: number) => (s < 0 ? 0 : peak * Math.exp(-s / (FLASH_FADE_SECONDS / 3)));
  return Math.max(pulse(since, 1), pulse(since - FLASH_PULSE_GAP_SECONDS, 0.7));
}

/** How long a flash is still visible after it begins. */
export const FLASH_VISIBLE_SECONDS = FLASH_PULSE_GAP_SECONDS + FLASH_FADE_SECONDS * 2;

/** The flash at a moment (0 to 1) and the strike that makes it, if any. */
export function lightningAt(seed: number, env: Pick<SurfaceEnvironmentDefinition, 'weather'> | null | undefined, t: number, override?: SurfaceOverride | null): { flash: number; strike: LightningStrike | null } {
  const strikes = strikesBetween(seed, env, t - FLASH_VISIBLE_SECONDS, t, override);
  let flash = 0;
  let strike: LightningStrike | null = null;
  for (const s of strikes) {
    const f = flashOf(t - s.time);
    if (f >= flash) {
      flash = f;
      strike = s;
    }
  }
  return { flash, strike: flash > 0.01 ? strike : null };
}
