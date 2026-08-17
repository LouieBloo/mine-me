import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
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

export const getBlocks = async (req: Request, res: Response) => {
  try {
    const blocks = await prisma.miningBlock.findMany({
      orderBy: { typeKey: 'asc' }
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

export const updateBlock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, mineTimeMs, staminaCost } = req.body;

    const block = await prisma.miningBlock.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(mineTimeMs !== undefined && { mineTimeMs: Number(mineTimeMs) }),
        ...(staminaCost !== undefined && { staminaCost: Number(staminaCost) })
      }
    });

    const allBlocks = await prisma.miningBlock.findMany({
      orderBy: { typeKey: 'asc' }
    });
    syncJson('blocks.json', allBlocks);

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
      orderBy: { typeKey: 'asc' }
    });
    syncJson('blocks.json', allBlocks);

    res.json(updatedBlock);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload block texture' });
  }
};
