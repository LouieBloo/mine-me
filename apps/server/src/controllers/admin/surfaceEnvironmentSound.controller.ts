import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isSurfaceSoundSlot, normalizeSurfaceSoundRefs, getSurfaceSoundSlot, type SurfaceSoundSlotRefs } from '@mine-me/shared';
import { prisma } from '../../index';
import { mirrorSurfaceEnvironmentsToJson, asSurfaceEnvironment } from './surfaceEnvironment.controller';
import { readVolume } from '../../services/soundVolume';

/** Rejects unknown slots before anything is changed. */
export const requireSurfaceSoundSlot = (req: Request, res: Response, next: () => void) => {
  if (!isSurfaceSoundSlot(req.params.slot)) {
    res.status(400).json({ error: `Unknown surface sound slot "${req.params.slot}"` });
    return;
  }
  next();
};

const findEnvironment = (id: string) => prisma.surfaceEnvironment.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] } });

/**
 * Sets what an environment's slot plays and how loud: `soundId` points it at a library sound (or clears it with null),
 * `volume` (0 to 1) sets the volume on this environment. Either can be sent alone; changing the sound keeps the volume
 * already set on the slot.
 */
export const setSurfaceSoundSlot = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    const { soundId, loop } = req.body ?? {};
    const volumeInput = readVolume(req.body?.volume);
    if (!volumeInput.ok) {
      res.status(400).json({ error: volumeInput.error });
      return;
    }
    const env = await findEnvironment(id);
    if (!env) {
      res.status(404).json({ error: 'Surface environment not found' });
      return;
    }
    const refs: SurfaceSoundSlotRefs = normalizeSurfaceSoundRefs(env.soundEffects);
    const current = refs[slot as keyof SurfaceSoundSlotRefs];

    if (soundId === null) {
      delete refs[slot as keyof SurfaceSoundSlotRefs];
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
      if (getSurfaceSoundSlot(slot)?.loopToggleable && typeof keepLoop === 'boolean') ref.loop = keepLoop;
      refs[slot as keyof SurfaceSoundSlotRefs] = ref;
    }

    const saved = await prisma.surfaceEnvironment.update({
      where: { id: env.id },
      data: { soundEffects: Object.keys(refs).length > 0 ? (refs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
    });
    await mirrorSurfaceEnvironmentsToJson();
    res.json(asSurfaceEnvironment(saved));
  } catch (err: any) {
    console.error('[Admin] Failed to update surface sound slot:', err);
    res.status(500).json({ error: err.message || 'Failed to update the surface sound slot' });
  }
};
