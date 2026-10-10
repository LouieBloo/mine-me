import { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { isMobSoundSlot, normalizeMobSoundRefs, getMobSoundSlot, type MobSoundSlotRefs } from '@mine-me/shared';
import { prisma } from '../../index';
import { getSoundsDir } from '../../config/assetPaths';
import { registerSoundFile } from '../../services/soundLibrary.service';
import { syncJson } from '../../services/admin.service';
import { MOB_INCLUDE, syncMobsJson } from './mob.controller';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac', '.flac'];

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = getSoundsDir('mobs', req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    cb(null, `${req.params.id}_${req.params.slot}${ext}`);
  },
});

const audioFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('audio/') || AUDIO_EXTENSIONS.includes(ext)) cb(null, true);
  else cb(new Error('Only audio files (.mp3, .wav, .ogg, .webm, .m4a, .aac, .flac) are allowed'));
};

export const mobSoundEffectUpload = multer({
  storage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
}).single('soundEffect');

/** Rejects unknown slots before any file is written (runs ahead of the upload middleware). */
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

/** Uploads a new sound for a slot: it joins the library (category MOB) and the slot points at it. */
export const uploadMobSoundSlot = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    const file = req.file;
    const mob = await prisma.mob.findUnique({ where: { id } });
    if (!mob) {
      if (file) fs.rmSync(file.path, { force: true });
      res.status(404).json({ error: 'Mob not found' });
      return;
    }
    if (!file) {
      res.status(400).json({ error: 'No sound effect file provided' });
      return;
    }

    const sound = await registerSoundFile(prisma, {
      url: `/assets/sounds/mobs/${id}/${file.filename}`,
      fileName: file.filename,
      fileSize: file.size,
      mimeType: file.mimetype,
      category: 'MOB',
      name: `${mob.name} - ${slot}`,
    });
    syncJson('sounds.json', await prisma.sound.findMany());

    const updated = await saveSlot(id, slot, { soundId: sound.id });
    res.json(updated);
  } catch (err: any) {
    console.error('[Admin] Failed to upload mob sound:', err);
    res.status(500).json({ error: err.message || 'Failed to upload mob sound' });
  }
};
