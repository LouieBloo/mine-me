import type { Flammability, GameItem } from '@mine-me/shared';

/**
 * How strongly an item sets things alight, as a multiplier on a material's own ignition chance:
 * the sum of its `Ignites` effects, each worth value/100 (so 100 is "as flammable as the material
 * says", 50 is half as likely, 200 is twice as likely). 0 means it ignites nothing.
 */
export function getIgnitionStrength(item: Pick<GameItem, 'itemEffects'> | undefined): number {
  let strength = 0;
  for (const entry of item?.itemEffects ?? []) {
    if (entry.effect?.ignites === true && Number.isFinite(entry.value) && entry.value > 0) {
      strength += entry.value / 100;
    }
  }
  return strength;
}

/** The chance, 0 to 1, that a source of this strength sets a material alight once. */
export function ignitionChance(flammability: Pick<Flammability, 'ignitionChance'>, strength: number): number {
  if (!(strength > 0)) return 0;
  return Math.min(1, Math.max(0, flammability.ignitionChance * strength));
}
