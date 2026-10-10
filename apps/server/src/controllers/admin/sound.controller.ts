import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { SOUND_CATEGORIES } from '@mine-me/shared';
import { syncSoundLibrary } from '../../services/soundLibrary.service';
import { buildSoundUsageIndex, usageForSound } from '../../services/soundUsage.service';
import { getSoundsDir } from '../../config/assetPaths';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const soundsDir = getSoundsDir();
    fs.mkdirSync(soundsDir, { recursive: true });
    cb(null, soundsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    const baseName = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 50);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac', '.flac'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (file.mimetype.startsWith('audio/') || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files (.mp3, .wav, .ogg, .webm, .m4a, .aac) are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 35 * 1024 * 1024 } // 35 MB max for music tracks
});

const isCategory = (value: unknown): value is (typeof SOUND_CATEGORIES)[number] =>
  typeof value === 'string' && (SOUND_CATEGORIES as readonly string[]).includes(value);

export const soundUploadMiddleware = upload.single('file');

export const getSounds = async (req: Request, res: Response) => {
  try {
    const { type, category } = req.query;
    const whereClause: any = {};
    if (type && typeof type === 'string' && (type === 'BGM' || type === 'SFX')) {
      whereClause.type = type;
    }
    if (typeof category === 'string' && isCategory(category)) {
      whereClause.category = category;
    }

    const sounds = await prisma.sound.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    // Where each sound is used; a failure here only hides the "used by" column
    let usage: Awaited<ReturnType<typeof buildSoundUsageIndex>> | null = null;
    try {
      usage = await buildSoundUsageIndex(prisma);
    } catch (usageErr) {
      console.warn('Could not work out sound usage:', usageErr);
    }

    res.json(sounds.map((sound: any) => ({ ...sound, usedBy: usage ? usageForSound(usage, sound) : [] })));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch sounds' });
  }
};

export const getSound = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sound = await prisma.sound.findUnique({
      where: { id }
    });

    if (!sound) {
      res.status(404).json({ error: 'Sound not found' });
      return;
    }

    res.json(sound);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch sound' });
  }
};

export const uploadSound = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const {
      name,
      description,
      type = 'BGM',
      category,
      volume = '1.0',
      loop = 'true',
      isActive = 'true'
    } = req.body;

    const soundName = name && name.trim().length > 0
      ? name.trim()
      : path.basename(file.originalname, path.extname(file.originalname));

    const soundUrl = `/assets/sounds/${file.filename}`;

    const newSound = await prisma.sound.create({
      data: {
        name: soundName,
        description: description?.trim() || null,
        type: type === 'SFX' ? 'SFX' : 'BGM',
        category: isCategory(category) ? category : 'GENERAL',
        url: soundUrl,
        fileName: file.filename,
        fileSize: file.size,
        mimeType: file.mimetype || 'audio/mpeg',
        volume: parseFloat(volume) || 1.0,
        loop: loop === 'true' || loop === true,
        isActive: isActive === 'true' || isActive === true
      }
    });

    const allSounds = await prisma.sound.findMany();
    syncJson('sounds.json', allSounds);

    res.status(201).json(newSound);
  } catch (err: any) {
    console.error('Error uploading sound:', err);
    res.status(500).json({ error: err.message || 'Failed to upload sound' });
  }
};

export const updateSound = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, type, category, volume, loop, isActive } = req.body;

    const existing = await prisma.sound.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Sound not found' });
      return;
    }

    const updated = await prisma.sound.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(type !== undefined && (type === 'BGM' || type === 'SFX') && { type }),
        ...(isCategory(category) && { category }),
        ...(volume !== undefined && { volume: Math.max(0, Math.min(1, parseFloat(volume))) }),
        ...(loop !== undefined && { loop: Boolean(loop) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) })
      }
    });

    const allSounds = await prisma.sound.findMany();
    syncJson('sounds.json', allSounds);

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update sound' });
  }
};

export const deleteSound = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sound = await prisma.sound.findUnique({ where: { id } });

    if (!sound) {
      res.status(404).json({ error: 'Sound not found' });
      return;
    }

    // A sound something plays cannot be deleted out from under it
    const usedBy = usageForSound(await buildSoundUsageIndex(prisma), sound);
    if (usedBy.length > 0) {
      res.status(409).json({ error: `"${sound.name}" is still used by: ${usedBy.join(', ')}`, usedBy });
      return;
    }

    // Delete record from DB
    await prisma.sound.delete({ where: { id } });

    // Clean up physical file from disk
    const filePath = path.join(getSoundsDir(), sound.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileErr) {
        console.warn('Failed to delete sound file from disk:', fileErr);
      }
    }

    const allSounds = await prisma.sound.findMany();
    syncJson('sounds.json', allSounds);

    res.json({ message: 'Sound deleted successfully', id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete sound' });
  }
};

/** Registers audio files on disk that have no library row. `?dryRun=true` only reports. */
export const syncSounds = async (req: Request, res: Response) => {
  try {
    const dryRun = req.query.dryRun === 'true';
    const report = await syncSoundLibrary(prisma, getSoundsDir(), { dryRun });
    if (!dryRun && report.added.length > 0) {
      syncJson('sounds.json', await prisma.sound.findMany());
    }
    res.json({ dryRun, ...report });
  } catch (err: any) {
    console.error('Error syncing sounds:', err);
    res.status(500).json({ error: err.message || 'Failed to sync sounds' });
  }
};
