import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, buildDropTableUpsert } from '../../services/admin.service';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../../../../packages/shared/assets/mining');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Preserve extension (.png or .jpg)
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const cleanKey = (req.params.typeKey || req.params.id || 'block').toLowerCase();
    cb(null, `${cleanKey}-block${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
    cb(null, true);
  } else {
    cb(new Error('Only PNG or JPG images are allowed'));
  }
};

const upload = multer({ storage, fileFilter });
export const blockTextureUpload = upload.single('texture');

const soundEffectStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../../../../packages/shared/assets/sounds/blocks');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    const cleanKey = (req.params.typeKey || req.params.id || 'block').toLowerCase();
    cb(null, `${cleanKey}_sfx${ext}`);
  }
});

const audioFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac', '.flac'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('audio/') || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files (.mp3, .wav, .ogg, .webm, .m4a, .aac, .flac) are allowed'));
  }
};

const uploadSoundEffect = multer({ storage: soundEffectStorage, fileFilter: audioFileFilter });
export const blockSoundEffectUpload = uploadSoundEffect.single('soundEffect');

export const getBlocks = async (req: Request, res: Response) => {
  try {
    const blocks = await prisma.miningBlock.findMany({
      orderBy: { typeKey: 'asc' },
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: { include: { item: true } } } }
      }
    });
    res.json(blocks);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch blocks' });
  }
};

export const getBlock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const block = await prisma.miningBlock.findFirst({
      where: {
        OR: [
          { id },
          { typeKey: id.toUpperCase() }
        ]
      },
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: { include: { item: true } } } }
      }
    });

    if (!block) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }

    res.json(block);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch block' });
  }
};

import { MiningDataManager } from '../../services/mining/subsystems/MiningDataManager';

export const updateBlock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, health, mineTimeMs, staminaCost, idleParticleEffectId, dropTable } = req.body;

    const dataToUpdate: any = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(health !== undefined ? { health: Number(health) } : (mineTimeMs !== undefined ? { health: Math.round(Number(mineTimeMs) / 5) } : {})),
      ...(staminaCost !== undefined && { staminaCost: Number(staminaCost) }),
      ...(idleParticleEffectId !== undefined && { idleParticleEffectId: idleParticleEffectId || null }),
      ...(req.body.soundEffectUrl !== undefined && { soundEffectUrl: req.body.soundEffectUrl || null })
    };

    if (dropTable !== undefined) {
      dataToUpdate.dropTable = buildDropTableUpsert(dropTable);
    }

    const block = await prisma.miningBlock.update({
      where: { id },
      data: dataToUpdate,
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: { include: { item: true } } } }
      }
    });

    const allBlocks = await prisma.miningBlock.findMany({
      orderBy: { typeKey: 'asc' },
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: true } }
      }
    });
    syncJson('blocks.json', allBlocks);
    MiningDataManager.getInstance().clearCache();

    res.json(block);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update block' });
  }
};

export const uploadBlockTexture = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;

    const block = await prisma.miningBlock.findFirst({
      where: {
        OR: [
          { id },
          { typeKey: id.toUpperCase() }
        ]
      }
    });

    if (!block) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No texture image file provided' });
      return;
    }

    const textureUrl = `/assets/mining/${file.filename}`;

    const updatedBlock = await prisma.miningBlock.update({
      where: { id: block.id },
      data: { textureUrl }
    });

    const allBlocks = await prisma.miningBlock.findMany({
      orderBy: { typeKey: 'asc' },
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: true } }
      }
    });
    syncJson('blocks.json', allBlocks);

    res.json(updatedBlock);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload block texture' });
  }
};

export const uploadBlockSoundEffect = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;

    const block = await prisma.miningBlock.findFirst({
      where: {
        OR: [
          { id },
          { typeKey: id.toUpperCase() }
        ]
      }
    });

    if (!block) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No sound effect file provided' });
      return;
    }

    const soundEffectUrl = `/assets/sounds/blocks/${file.filename}`;

    const updatedBlock = await prisma.miningBlock.update({
      where: { id: block.id },
      data: { soundEffectUrl } as any,
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: { include: { item: true } } } }
      }
    });

    const allBlocks = await prisma.miningBlock.findMany({
      orderBy: { typeKey: 'asc' },
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: true } }
      }
    });
    syncJson('blocks.json', allBlocks);

    res.json(updatedBlock);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload block sound effect' });
  }
};

export const removeBlockSoundEffect = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const block = await prisma.miningBlock.findFirst({
      where: {
        OR: [
          { id },
          { typeKey: id.toUpperCase() }
        ]
      }
    });

    if (!block) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }

    if ((block as any).soundEffectUrl) {
      const filePath = path.join(__dirname, '../../../../../packages/shared', (block as any).soundEffectUrl);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not remove sound effect file:', e);
        }
      }
    }

    const updatedBlock = await prisma.miningBlock.update({
      where: { id: block.id },
      data: { soundEffectUrl: null } as any,
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: { include: { item: true } } } }
      }
    });

    const allBlocks = await prisma.miningBlock.findMany({
      orderBy: { typeKey: 'asc' },
      include: {
        idleParticleEffect: true,
        dropTable: { include: { items: true } }
      }
    });
    syncJson('blocks.json', allBlocks);

    res.json(updatedBlock);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to remove block sound effect' });
  }
};
