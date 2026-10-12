import type { PrismaClient } from '@prisma/client';
import { readVolume } from './soundVolume';
import {
  getCharacterSoundSlot,
  normalizeCharacterSoundRefs,
  type CharacterSoundSlotRefs,
} from '@mine-me/shared';

/** There is one set of character sounds; it lives in the row with this id. */
export const CHARACTER_SOUND_CONFIG_ID = 'default';

type CharacterSoundDb = Pick<PrismaClient, 'characterSoundConfig' | 'sound'>;

/** Thrown for problems the admin caused (bad slot, unknown sound) so the controller can answer 4xx. */
export class CharacterSoundError extends Error {
  constructor(message: string, public readonly status: 400 | 404) {
    super(message);
  }
}

/** The stored slot references (empty if nothing has been chosen yet). */
export async function getCharacterSoundRefs(db: CharacterSoundDb): Promise<CharacterSoundSlotRefs> {
  const row = await db.characterSoundConfig.findUnique({ where: { id: CHARACTER_SOUND_CONFIG_ID } });
  return normalizeCharacterSoundRefs(row?.soundEffects);
}

/** Points a slot at a library sound, or clears it with `soundId: null`. Returns the saved references. */
export async function setCharacterSoundSlot(
  db: CharacterSoundDb,
  slot: string,
  soundId: unknown,
  loop?: unknown,
  volume?: unknown
): Promise<CharacterSoundSlotRefs> {
  const definition = getCharacterSoundSlot(slot);
  if (!definition) throw new CharacterSoundError(`Unknown character sound slot "${slot}"`, 400);

  const volumeInput = readVolume(volume);
  if (!volumeInput.ok) throw new CharacterSoundError(volumeInput.error, 400);

  const refs = await getCharacterSoundRefs(db);
  const current = refs[definition.slotKey];
  if (soundId === null) {
    delete refs[definition.slotKey];
  } else {
    let nextSoundId = current?.soundId;
    if (soundId !== undefined) {
      if (typeof soundId !== 'string' || soundId.length === 0) {
        throw new CharacterSoundError('soundId must be a sound id or null', 400);
      }
      const sound = await db.sound.findUnique({ where: { id: soundId } });
      if (!sound) throw new CharacterSoundError('Sound not found in the library', 404);
      nextSoundId = soundId;
    }
    if (!nextSoundId) throw new CharacterSoundError('Choose a sound for this slot first', 400);

    const next: { soundId: string; loop?: boolean; volume?: number } = { soundId: nextSoundId };
    const nextVolume = volumeInput.volume ?? current?.volume;
    if (nextVolume !== undefined) next.volume = nextVolume;
    const nextLoop = typeof loop === 'boolean' ? loop : current?.loop;
    if (definition.loopToggleable && typeof nextLoop === 'boolean') next.loop = nextLoop;
    refs[definition.slotKey] = next;
  }

  await db.characterSoundConfig.upsert({
    where: { id: CHARACTER_SOUND_CONFIG_ID },
    create: { id: CHARACTER_SOUND_CONFIG_ID, soundEffects: refs as object },
    update: { soundEffects: refs as object },
  });
  return refs;
}
