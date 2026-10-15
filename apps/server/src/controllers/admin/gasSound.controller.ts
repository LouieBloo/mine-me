import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isGasSoundSlot, normalizeGasSoundRefs, getGasSoundSlot, type GasSoundSlotRefs } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { readVolume } from '../../services/soundVolume';

/** Rejects unknown slots before anything is changed. */
export const requireGasSoundSlot = (req: Request, res: Response, next: () => void) => {
  if (!isGasSoundSlot(req.params.slot)) {
    res.status(400).json({ error: `Unknown gas sound slot "${req.params.slot}"` });
    return;
  }
  next();
};

const findGas = (id: string) => prisma.gas.findFirst({ where: { OR: [{ id }, { typeKey: id.toUpperCase() }] } });

/**
 * Sets what a gas's slot plays and how loud: `soundId` points it at a library sound (or clears it with null),
 * `volume` (0 to 1) sets the volume on this gas. Either can be sent alone; changing the sound keeps the volume
 * already set on the slot.
 */
export const setGasSoundSlot = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    const { soundId, loop } = req.body ?? {};
    const volumeInput = readVolume(req.body?.volume);
    if (!volumeInput.ok) {
      res.status(400).json({ error: volumeInput.error });
      return;
    }

    const gas = await findGas(id);
    if (!gas) {
      res.status(404).json({ error: 'Gas not found' });
      return;
    }
    const refs: GasSoundSlotRefs = normalizeGasSoundRefs(gas.soundEffects);
    const current = refs[slot as keyof GasSoundSlotRefs];

    if (soundId === null) {
      delete refs[slot as keyof GasSoundSlotRefs];
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
      if (getGasSoundSlot(slot)?.loopToggleable && typeof keepLoop === 'boolean') ref.loop = keepLoop;
      refs[slot as keyof GasSoundSlotRefs] = ref;
    }

    const saved = await prisma.gas.update({
      where: { id: gas.id },
      data: { soundEffects: Object.keys(refs).length > 0 ? (refs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
    });
    syncJson('gases.json', await prisma.gas.findMany({ orderBy: { typeKey: 'asc' } }));
    res.json(saved);
  } catch (err: any) {
    console.error('[Admin] Failed to update gas sound slot:', err);
    res.status(500).json({ error: err.message || 'Failed to update gas sound slot' });
  }
};
