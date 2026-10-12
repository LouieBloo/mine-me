import { clampSoundVolume } from '@mine-me/shared';
import type { PlayLoopingSfxOptions, PlaySfxOptions } from './SoundManager';

/**
 * Options that play a sound at the volume set where it is used (0 to 1, full when unset). The
 * sound manager multiplies this with the global effects volume and any distance falloff, so the
 * player's effects slider still scales every sound relative to its own setting.
 */
export function withVolume<T extends PlaySfxOptions | PlayLoopingSfxOptions>(
  volume: number | null | undefined,
  options?: T
): T & { volumeScale: number } {
  return { ...(options as T), volumeScale: clampSoundVolume(volume) * (options?.volumeScale ?? 1) };
}
