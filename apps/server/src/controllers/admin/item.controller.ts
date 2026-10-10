import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination } from '../../services/admin.service';
import { ITEM_TYPES, ITEM_SUBTYPES, ITEM_RARITIES } from '@mine-me/shared';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { getSoundsDir, resolveAssetUrl } from '../../config/assetPaths';
import { tryRegisterSoundFile, tryUnregisterSoundFile } from '../../services/soundLibrary.service';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../../../../packages/shared/assets/icons/items');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Save as {id}_icon.png
    cb(null, `${req.params.id}_icon.png`);
  }
});

const gearStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../../../../packages/shared/assets/gear');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Save as {id}_gear.png
    cb(null, `${req.params.id}_gear.png`);
  }
});

// Since the frontend checks that it's a PNG, we can do a quick check here too just in case.
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('Only PNG images are allowed'));
  }
};

const upload = multer({ storage: storage, fileFilter });
export const itemIconUpload = upload.single('icon');

const uploadGear = multer({ storage: gearStorage, fileFilter });
export const itemGearImageUpload = uploadGear.single('gearImage');

const inGameSpriteStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../../../../packages/shared/assets/sprites/items');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${req.params.id}_ingame${ext}`);
  }
});

const uploadInGameSprite = multer({ storage: inGameSpriteStorage, fileFilter });
export const itemInGameSpriteUpload = uploadInGameSprite.single('inGameSprite');

const itemSoundEffectStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = getSoundsDir('items');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    const slot = req.params.slot || req.query.slot;
    const filename = slot ? `${req.params.id}_${slot}_sfx${ext}` : `${req.params.id}_sfx${ext}`;
    cb(null, filename);
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

const uploadSoundEffect = multer({
  storage: itemSoundEffectStorage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }
});
export const itemSoundEffectUpload = uploadSoundEffect.single('soundEffect');

export const getItems = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  // Support filtering by type and subType via query params
  if (req.query.type) {
    where.type = req.query.type as string;
  }
  if (req.query.subType) {
    where.subType = req.query.subType as string;
  }
  const items = await prisma.item.findMany({
    skip,
    take,
    where,
    include: {
      itemEffects: {
        include: {
          effect: true
        }
      },
      particleEffect: true
    }
  });
  res.json(items);
};

export const getItemEnums = (req: Request, res: Response) => {
  res.json({
    types: ITEM_TYPES,
    subTypes: ITEM_SUBTYPES,
    rarities: ITEM_RARITIES,
    triggerModes: ['SINGLE', 'HOLD'],
  });
};

export const getItem = async (req: Request, res: Response) => {
  const item = await prisma.item.findUnique({
    where: { id: req.params.id },
    include: {
      itemEffects: {
        include: {
          effect: true
        }
      },
      particleEffect: true
    }
  });
  res.json(item);
};

export const createItem = async (req: Request, res: Response) => {
  const { itemEffects, particleEffect, ...itemData } = req.body;
  if ('itemKey' in itemData) {
    itemData.itemKey = itemData.itemKey && typeof itemData.itemKey === 'string' && itemData.itemKey.trim().length > 0
      ? itemData.itemKey.trim().toLowerCase()
      : null;
  }
  const item = await prisma.item.create({
    data: {
      ...itemData,
      itemEffects: itemEffects && Array.isArray(itemEffects) ? {
        create: itemEffects.map((ie: any) => ({
          effectId: ie.effectId,
          value: Number(ie.value)
        }))
      } : undefined
    },
    include: {
      itemEffects: {
        include: {
          effect: true
        }
      },
      particleEffect: true
    }
  });
  const allItems = await prisma.item.findMany({
    include: {
      itemEffects: {
        include: {
          effect: true
        }
      },
      particleEffect: true
    }
  });
  syncJson('items.json', allItems);
  res.json(item);
};

export const updateItem = async (req: Request, res: Response) => {
  const { itemEffects, particleEffect, ...itemData } = req.body;
  if ('itemKey' in itemData) {
    itemData.itemKey = itemData.itemKey && typeof itemData.itemKey === 'string' && itemData.itemKey.trim().length > 0
      ? itemData.itemKey.trim().toLowerCase()
      : null;
  }
  const item = await prisma.item.update({
    where: { id: req.params.id },
    data: {
      ...itemData,
      itemEffects: {
        deleteMany: {},
        create: itemEffects && Array.isArray(itemEffects) ? itemEffects.map((ie: any) => ({
          effectId: ie.effectId,
          value: Number(ie.value)
        })) : []
      }
    },
    include: {
      itemEffects: {
        include: {
          effect: true
        }
      },
      particleEffect: true
    }
  });
  const allItems = await prisma.item.findMany({
    include: {
      itemEffects: {
        include: {
          effect: true
        }
      },
      particleEffect: true
    }
  });
  syncJson('items.json', allItems);
  res.json(item);
};

export const uploadItemIcon = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const file = req.file;

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
       res.status(404).json({ error: 'Item not found' });
       return;
    }

    if (!file) {
      res.status(400).json({ error: 'No icon file provided' });
      return;
    }

    const iconUrl = `/assets/icons/items/${file.filename}`;

    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: { iconUrl }
    });

    const allItems = await prisma.item.findMany();
    await syncJson('items.json', allItems);

    res.json(updatedItem);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload item icon' });
  }
};

export const uploadItemGearImage = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const file = req.file;

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
       res.status(404).json({ error: 'Item not found' });
       return;
    }

    if (!file) {
      res.status(400).json({ error: 'No gear image file provided' });
      return;
    }

    const gearImageUrl = `/assets/gear/${file.filename}`;

    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: { gearImageUrl }
    });

    const allItems = await prisma.item.findMany();
    await syncJson('items.json', allItems);

    res.json(updatedItem);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload item gear image' });
  }
};

export const uploadItemInGameSprite = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const file = req.file;

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No in-game sprite file provided' });
      return;
    }

    const inGameSpriteUrl = `/assets/sprites/items/${file.filename}`;

    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: { inGameSpriteUrl }
    });

    const allItems = await prisma.item.findMany({
      include: {
        itemEffects: {
          include: {
            effect: true
          }
        },
        particleEffect: true
      }
    });
    await syncJson('items.json', allItems);

    res.json(updatedItem);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload item in-game sprite' });
  }
};

export const uploadItemSoundEffect = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const slot = (req.params.slot || req.query.slot || req.body?.slot || 'throw').toString();
    const file = req.file;

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No sound effect file provided' });
      return;
    }

    const soundEffectUrl = `/assets/sounds/items/${file.filename}`;
    await tryRegisterSoundFile(prisma, {
      url: soundEffectUrl,
      fileName: file.filename,
      fileSize: file.size,
      mimeType: file.mimetype,
      category: 'ITEM',
      name: `${(item as any).name} - ${slot}`,
    });
    const rawEffects = (item as any).soundEffects;
    const currentSoundEffects: Record<string, any> =
      rawEffects && typeof rawEffects === 'object' ? { ...rawEffects } : {};

    const loopParam = req.body?.loop;
    const isLooping =
      loopParam !== undefined
        ? loopParam === 'true' || loopParam === true
        : currentSoundEffects[slot]?.loop ?? (slot === 'inGameEffect');

    currentSoundEffects[slot] = {
      url: soundEffectUrl,
      loop: isLooping,
    };

    const updateData: any = {
      soundEffects: currentSoundEffects,
    };

    if (slot === 'throw') {
      updateData.soundEffectUrl = soundEffectUrl;
    }

    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: updateData,
      include: {
        itemEffects: {
          include: {
            effect: true,
          },
        },
        particleEffect: true,
      },
    });

    const allItems = await prisma.item.findMany({
      include: {
        itemEffects: {
          include: {
            effect: true,
          },
        },
        particleEffect: true,
      },
    });
    await syncJson('items.json', allItems);

    res.json(updatedItem);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload item sound effect' });
  }
};

export const updateItemSoundEffectSlot = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const slot = req.params.slot;

    if (!slot) {
      res.status(400).json({ error: 'Slot parameter is required' });
      return;
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const rawEffects = (item as any).soundEffects;
    const currentSoundEffects: Record<string, any> =
      rawEffects && typeof rawEffects === 'object' ? { ...rawEffects } : {};

    const { loop } = req.body;
    if (loop !== undefined) {
      currentSoundEffects[slot] = {
        ...(currentSoundEffects[slot] || {}),
        url: currentSoundEffects[slot]?.url || (slot === 'throw' ? (item as any).soundEffectUrl : null),
        loop: Boolean(loop),
      };
    }

    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: { soundEffects: currentSoundEffects } as any,
      include: {
        itemEffects: {
          include: {
            effect: true,
          },
        },
        particleEffect: true,
      },
    });

    const allItems = await prisma.item.findMany({
      include: {
        itemEffects: {
          include: {
            effect: true,
          },
        },
        particleEffect: true,
      },
    });
    await syncJson('items.json', allItems);

    res.json(updatedItem);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to update sound effect slot' });
  }
};

export const removeItemSoundEffect = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const slot = (req.params.slot || req.query.slot || 'throw').toString();

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const rawEffects = (item as any).soundEffects;
    const currentSoundEffects: Record<string, any> =
      rawEffects && typeof rawEffects === 'object' ? { ...rawEffects } : {};

    const slotUrl =
      currentSoundEffects[slot]?.url || (slot === 'throw' ? (item as any).soundEffectUrl : null);
    if (slotUrl) {
      const filePath = resolveAssetUrl(slotUrl);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not remove sound effect file:', e);
        }
      }
      await tryUnregisterSoundFile(prisma, slotUrl);
    }

    currentSoundEffects[slot] = {
      url: null,
      loop: currentSoundEffects[slot]?.loop ?? (slot === 'inGameEffect'),
    };

    const updateData: any = {
      soundEffects: currentSoundEffects,
    };

    if (slot === 'throw') {
      updateData.soundEffectUrl = null;
    }

    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: updateData,
      include: {
        itemEffects: {
          include: {
            effect: true,
          },
        },
        particleEffect: true,
      },
    });

    const allItems = await prisma.item.findMany({
      include: {
        itemEffects: {
          include: {
            effect: true,
          },
        },
        particleEffect: true,
      },
    });
    await syncJson('items.json', allItems);

    res.json(updatedItem);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to remove item sound effect' });
  }
};

