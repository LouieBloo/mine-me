/** The volume an admin request asked for, if it sent one. */
export type VolumeInput = { ok: true; volume: number | undefined } | { ok: false; error: string };

/**
 * Reads the optional `volume` of an admin request. Absent means "unchanged"; anything that is not
 * a number from 0 to 1 is rejected so a bad value is never saved.
 */
export function readVolume(value: unknown): VolumeInput {
  if (value === undefined) return { ok: true, volume: undefined };
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return { ok: false, error: 'volume must be a number from 0 to 1' };
  }
  return { ok: true, volume: value };
}
