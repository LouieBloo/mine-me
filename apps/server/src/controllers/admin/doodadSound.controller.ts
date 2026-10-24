import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isDoodadSoundSlot, normalizeDoodadSoundRefs, getDoodadSoundSlot, type DoodadSoundSlotRefs } from '@mine-me/shared';
import { prisma } from '../../index';
import { mirrorDoodadsToJson, asDoodadDefinition } from './doodad.controller';
import { readVolume } from '../../services/soundVolume';

/** Rejects unknown slots before anything is changed. */
export const requireDoodadSoundSlot = (req: Request, res: Response, next: () => void) => {
  if (!isDoodadSoundSlot(req.params.slot)) {
    res.status(400).json({ error: `Unknown doodad sound slot "${req.params.slot}"` });
    return;
  }
  next();
};

const findDoodad = (id: string) => prisma.doodad.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] } });

/**
 * Sets what a doodad's slot plays and how loud: `soundId` points it at a library sound (or clears it with null),
 * `volume` (0 to 1) sets the volume on this doodad. Either can be sent alone; changing the sound keeps the volume
 * already set on the slot.
 */
export const setDoodadSoundSlot = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    const { soundId, loop } = req.body ?? {};
    const volumeInput = readVolume(req.body?.volume);
    if (!volumeInput.ok) {
      res.status(400).json({ error: volumeInput.error });
      return;
    }

    const doodad = await findDoodad(id);
    if (!doodad) {
      res.status(404).json({ error: 'Doodad not found' });
      return;
    }
    const refs: DoodadSoundSlotRefs = normalizeDoodadSoundRefs(doodad.soundEffects);
    const current = refs[slot as keyof DoodadSoundSlotRefs];

    if (soundId === null) {
      delete refs[slot as keyof DoodadSoundSlotRefs];
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
      if (getDoodadSoundSlot(slot)?.loopToggleable && typeof keepLoop === 'boolean') ref.loop = keepLoop;
      refs[slot as keyof DoodadSoundSlotRefs] = ref;
    }

    const saved = await prisma.doodad.update({
      where: { id: doodad.id },
      data: { soundEffects: Object.keys(refs).length > 0 ? (refs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
    });
    await mirrorDoodadsToJson();
    res.json(asDoodadDefinition(saved));
  } catch (err: any) {
    console.error('[Admin] Failed to update doodad sound slot:', err);
    res.status(500).json({ error: err.message || 'Failed to update doodad sound slot' });
  }
};
