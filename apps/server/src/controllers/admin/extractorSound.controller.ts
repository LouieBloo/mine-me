import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isExtractorSoundSlot, normalizeExtractorSoundRefs, getExtractorSoundSlot, type ExtractorSoundSlotRefs } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { readVolume } from '../../services/soundVolume';

/** Rejects unknown slots before anything is changed. */
export const requireExtractorSoundSlot = (req: Request, res: Response, next: () => void) => {
  if (!isExtractorSoundSlot(req.params.slot)) {
    res.status(400).json({ error: `Unknown extractor sound slot "${req.params.slot}"` });
    return;
  }
  next();
};

const findExtractor = (id: string) => prisma.extractor.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] } });

/**
 * Sets what an extractor's slot plays and how loud: `soundId` points it at a library sound (or clears it with null),
 * `volume` (0 to 1) sets the volume on this extractor. Either can be sent alone; changing the sound keeps the volume
 * already set on the slot.
 */
export const setExtractorSoundSlot = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    const { soundId, loop } = req.body ?? {};
    const volumeInput = readVolume(req.body?.volume);
    if (!volumeInput.ok) {
      res.status(400).json({ error: volumeInput.error });
      return;
    }

    const extractor = await findExtractor(id);
    if (!extractor) {
      res.status(404).json({ error: 'Extractor not found' });
      return;
    }
    const refs: ExtractorSoundSlotRefs = normalizeExtractorSoundRefs(extractor.soundEffects);
    const current = refs[slot as keyof ExtractorSoundSlotRefs];

    if (soundId === null) {
      delete refs[slot as keyof ExtractorSoundSlotRefs];
    } else {
      let nextSoundId = current?.soundId;
      if (soundId !== undefined) {
        if (typeof soundId !== 'string' || soundId.length === 0) {
          res.status(400).json({ error: 'soundId must be a sound id or null' });
          return;
        }
        const sound = await prisma.sound.findUnique({ where: { id: soundId } });
        if (!sound) {
          res.status(404).json({ error: 'Sound not found in the library' });
          return;
        }
        nextSoundId = soundId;
      }
      if (!nextSoundId) {
        res.status(400).json({ error: 'Choose a sound for this slot first' });
        return;
      }
      const ref: { soundId: string; loop?: boolean; volume?: number } = { soundId: nextSoundId };
      const volume = volumeInput.volume ?? current?.volume;
      if (volume !== undefined) ref.volume = volume;
      const keepLoop = soundId === undefined ? (typeof loop === 'boolean' ? loop : current?.loop) : loop;
      if (getExtractorSoundSlot(slot)?.loopToggleable && typeof keepLoop === 'boolean') ref.loop = keepLoop;
      refs[slot as keyof ExtractorSoundSlotRefs] = ref;
    }

    const saved = await prisma.extractor.update({
      where: { id: extractor.id },
      data: { soundEffects: Object.keys(refs).length > 0 ? (refs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
    });
    syncJson('extractors.json', await prisma.extractor.findMany({ orderBy: { createdAt: 'asc' } }));
    res.json(saved);
  } catch (err: any) {
    console.error('[Admin] Failed to update extractor sound slot:', err);
    res.status(500).json({ error: err.message || 'Failed to update extractor sound slot' });
  }
};
