import { Request, Response } from 'express';
import { isMobSoundSlot, normalizeMobSoundRefs, getMobSoundSlot, type MobSoundSlotRefs } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { MOB_INCLUDE, syncMobsJson } from './mob.controller';

/** Rejects unknown slots before anything is changed. */
export const requireMobSoundSlot = (req: Request, res: Response, next: () => void) => {
  if (!isMobSoundSlot(req.params.slot)) {
    res.status(400).json({ error: `Unknown mob sound slot "${req.params.slot}"` });
    return;
  }
  next();
};

const saveSlot = async (mobId: string, slot: string, ref: { soundId: string; loop?: boolean } | null) => {
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

/** Points a slot at a library sound (`soundId`), or clears it (`soundId: null`). */
export const setMobSoundSlot = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    const { soundId, loop } = req.body ?? {};

    let ref: { soundId: string; loop?: boolean } | null = null;
    if (soundId !== null && soundId !== undefined) {
      if (typeof soundId !== 'string' || soundId.length === 0) {
        res.status(400).json({ error: 'soundId must be a sound id or null' });
        return;
      }
      const sound = await prisma.sound.findUnique({ where: { id: soundId } });
      if (!sound) {
        res.status(404).json({ error: 'Sound not found in the library' });
        return;
      }
      ref = { soundId };
      if (getMobSoundSlot(slot)?.loopToggleable && typeof loop === 'boolean') ref.loop = loop;
    }

    const mob = await saveSlot(id, slot, ref);
    if (!mob) {
      res.status(404).json({ error: 'Mob not found' });
      return;
    }
    res.json(mob);
  } catch (err: any) {
    console.error('[Admin] Failed to update mob sound slot:', err);
    res.status(500).json({ error: err.message || 'Failed to update mob sound slot' });
  }
};
