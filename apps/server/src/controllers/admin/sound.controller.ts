import { Request, Response } from 'express';
import { prisma } from '../../index';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const soundsDir = path.join(__dirname, '../../../../../packages/shared/assets/sounds');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
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

export const soundUploadMiddleware = upload.single('file');

export const getSounds = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const whereClause: any = {};
    if (type && typeof type === 'string' && (type === 'BGM' || type === 'SFX')) {
      whereClause.type = type;
    }

    const sounds = await prisma.sound.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    res.json(sounds);
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
        url: soundUrl,
        fileName: file.filename,
        fileSize: file.size,
        mimeType: file.mimetype || 'audio/mpeg',
        volume: parseFloat(volume) || 1.0,
        loop: loop === 'true' || loop === true,
        isActive: isActive === 'true' || isActive === true
      }
    });

    res.status(201).json(newSound);
  } catch (err: any) {
    console.error('Error uploading sound:', err);
    res.status(500).json({ error: err.message || 'Failed to upload sound' });
  }
};

export const updateSound = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, type, volume, loop, isActive } = req.body;

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
        ...(volume !== undefined && { volume: Math.max(0, Math.min(1, parseFloat(volume))) }),
        ...(loop !== undefined && { loop: Boolean(loop) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) })
      }
    });

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

    // Delete record from DB
    await prisma.sound.delete({ where: { id } });

    // Clean up physical file from disk
    const filePath = path.join(soundsDir, sound.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileErr) {
        console.warn('Failed to delete sound file from disk:', fileErr);
      }
    }

    res.json({ message: 'Sound deleted successfully', id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete sound' });
  }
};
