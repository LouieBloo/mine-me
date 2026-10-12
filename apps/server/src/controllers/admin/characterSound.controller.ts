import { Request, Response } from 'express';
import { prisma } from '../../index';
import {
  CharacterSoundError,
  getCharacterSoundRefs,
  setCharacterSoundSlot,
} from '../../services/characterSounds.service';

/** The player character's sound slots as stored (library sounds by id). */
export const getCharacterSounds = async (_req: Request, res: Response) => {
  try {
    res.json({ soundEffects: await getCharacterSoundRefs(prisma) });
  } catch (err: any) {
    console.error('[Admin] Failed to load character sounds:', err);
    res.status(500).json({ error: err.message || 'Failed to load character sounds' });
  }
};

/** Points a slot at a library sound (`soundId`), or clears it (`soundId: null`). */
export const setCharacterSound = async (req: Request, res: Response) => {
  try {
    const { soundId, loop, volume } = req.body ?? {};
    const soundEffects = await setCharacterSoundSlot(prisma, req.params.slot, soundId, loop, volume);
    res.json({ soundEffects });
  } catch (err: any) {
    if (err instanceof CharacterSoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[Admin] Failed to update character sound slot:', err);
    res.status(500).json({ error: err.message || 'Failed to update character sound slot' });
  }
};
