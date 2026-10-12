import { Request, Response } from 'express';
import { isMobSoundSlot, normalizeMobSoundRefs, getMobSoundSlot, type MobSoundSlotRefs } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { MOB_INCLUDE, syncMobsJson } from './mob.controller';
import { readVolume } from '../../services/soundVolume';

/** Rejects unknown slots before anything is changed. */
export const requireMobSoundSlot = (req: Request, res: Response, next: () => void) => {
  if (!isMobSoundSlot(req.params.slot)) {
    res.status(400).json({ error: `Unknown mob sound slot "${req.params.slot}"` });
    return;
  }
  next();
};

const saveSlot = async (mobId: string, slot: string, ref: { soundId: string; loop?: boolean; volume?: number } | null) => {
  const mob = await prisma.mob.findUnique({ where: { id: mobId } });
  if (!mob) return null;
  const refs: MobSoundSlotRefs = normalizeMobSoundRefs((mob as any).soundEffects);
  if (ref) refs[slot as keyof MobSoundSlotRefs] = ref;
  else delete refs[slot as keyof MobSoundSlotRefs];
  const updated = await prisma.mob.update({
    where: { id: mobId },
    data: { soundEffects: refs } as any,
    include: MOB_INCLUDE,
  });
  await syncMobsJson();
  return updated;
};

/**
 * Sets what a slot plays and how loud: `soundId` points it at a library sound (or clears it with
 * null), `volume` (0 to 1) sets the volume on this mob. Either can be sent alone; changing the
 * sound keeps the volume already set on the slot.
 */
export const setMobSoundSlot = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    const { soundId, loop } = req.body ?? {};
    const volumeInput = readVolume(req.body?.volume);
    if (!volumeInput.ok) {
      res.status(400).json({ error: volumeInput.error });
      return;
    }

    const mob = await prisma.mob.findUnique({ where: { id } });
    if (!mob) {
      res.status(404).json({ error: 'Mob not found' });
      return;
    }
    const current = normalizeMobSoundRefs((mob as any).soundEffects)[slot as keyof MobSoundSlotRefs];

    let ref: { soundId: string; loop?: boolean; volume?: number } | null;
    if (soundId === null) {
      ref = null;
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
      ref = { soundId: nextSoundId };
      const volume = volumeInput.volume ?? current?.volume;
      if (volume !== undefined) ref.volume = volume;
      const keepLoop = soundId === undefined ? (typeof loop === 'boolean' ? loop : current?.loop) : loop;
      if (getMobSoundSlot(slot)?.loopToggleable && typeof keepLoop === 'boolean') ref.loop = keepLoop;
    }

    const saved = await saveSlot(id, slot, ref);
    if (!saved) {
      res.status(404).json({ error: 'Mob not found' });
      return;
    }
    res.json(saved);
  } catch (err: any) {
    console.error('[Admin] Failed to update mob sound slot:', err);
    res.status(500).json({ error: err.message || 'Failed to update mob sound slot' });
  }
};
