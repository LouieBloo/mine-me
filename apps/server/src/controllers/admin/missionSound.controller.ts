import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isMissionSoundSlot, normalizeMissionSoundRefs, getMissionSoundSlot, type MissionSoundSlotRefs } from '@mine-me/shared';
import { prisma } from '../../index';
import { mirrorMissionsToJson, asMissionDefinition } from './mission.controller';
import { readVolume } from '../../services/soundVolume';

/** Rejects unknown slots before anything is changed. */
export const requireMissionSoundSlot = (req: Request, res: Response, next: () => void) => {
  if (!isMissionSoundSlot(req.params.slot)) {
    res.status(400).json({ error: `Unknown mission sound slot "${req.params.slot}"` });
    return;
  }
  next();
};

const findMission = (id: string) => prisma.mission.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] } });

/**
 * Sets what a mission's slot plays and how loud: `soundId` points it at a library sound (or clears it with null),
 * `volume` (0 to 1) sets the volume on this mission. Either can be sent alone; changing the sound keeps the volume
 * already set on the slot.
 */
export const setMissionSoundSlot = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    const { soundId, loop } = req.body ?? {};
    const volumeInput = readVolume(req.body?.volume);
    if (!volumeInput.ok) {
      res.status(400).json({ error: volumeInput.error });
      return;
    }

    const mission = await findMission(id);
    if (!mission) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    const refs: MissionSoundSlotRefs = normalizeMissionSoundRefs(mission.soundEffects);
    const current = refs[slot as keyof MissionSoundSlotRefs];

    if (soundId === null) {
      delete refs[slot as keyof MissionSoundSlotRefs];
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
      if (getMissionSoundSlot(slot)?.loopToggleable && typeof keepLoop === 'boolean') ref.loop = keepLoop;
      refs[slot as keyof MissionSoundSlotRefs] = ref;
    }

    const saved = await prisma.mission.update({
      where: { id: mission.id },
      data: { soundEffects: Object.keys(refs).length > 0 ? (refs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
    });
    await mirrorMissionsToJson();
    res.json(asMissionDefinition(saved));
  } catch (err: any) {
    console.error('[Admin] Failed to update mission sound slot:', err);
    res.status(500).json({ error: err.message || 'Failed to update mission sound slot' });
  }
};
