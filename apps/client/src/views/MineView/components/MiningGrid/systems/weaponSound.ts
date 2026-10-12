import { DEFAULT_DYNAMITE_SOUNDS, clampSoundVolume, type GameItem } from '@mine-me/shared';

/** A sound to play and how loud it is on the item it belongs to (0 to 1). */
export interface ItemSound {
  url: string;
  volume: number;
}

type SoundItem = Partial<Pick<GameItem, 'soundEffects' | 'soundEffectUrl'>> | null | undefined;

/**
 * The sound a weapon makes in the mine: its `shoot` slot, else the legacy single sound (which is
 * the `throw` slot, so its volume lives there). Null when it has none.
 */
export function weaponSoundOf(weapon: SoundItem): ItemSound | null {
  const shoot = weapon?.soundEffects?.shoot;
  if (shoot?.url) return { url: shoot.url, volume: clampSoundVolume(shoot.volume) };
  if (weapon?.soundEffectUrl) {
    return { url: weapon.soundEffectUrl, volume: clampSoundVolume(weapon.soundEffects?.throw?.volume) };
  }
  return null;
}

/** The sound played when a thrown item leaves the hand: its `throw` slot, the legacy sound, else dynamite's default. */
export function throwSoundOf(item: SoundItem): ItemSound | null {
  const slot = item?.soundEffects?.throw;
  if (slot?.url) return { url: slot.url, volume: clampSoundVolume(slot.volume) };
  if (item?.soundEffectUrl) return { url: item.soundEffectUrl, volume: clampSoundVolume(slot?.volume) };
  const fallback = DEFAULT_DYNAMITE_SOUNDS.throw;
  return fallback?.url ? { url: fallback.url, volume: clampSoundVolume(fallback.volume) } : null;
}
