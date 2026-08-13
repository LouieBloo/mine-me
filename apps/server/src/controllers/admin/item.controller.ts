import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination } from '../../services/admin.service';
import { ITEM_TYPES, ITEM_SUBTYPES, ITEM_RARITIES } from '@mine-me/shared';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

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
      }
    }
  });
  res.json(items);
};

export const getItemEnums = (req: Request, res: Response) => {
  res.json({
    types: ITEM_TYPES,
    subTypes: ITEM_SUBTYPES,
    rarities: ITEM_RARITIES,
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
      }
    }
  });
  res.json(item);
};

export const createItem = async (req: Request, res: Response) => {
  const { itemEffects, ...itemData } = req.body;
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
      }
    }
  });
  const allItems = await prisma.item.findMany({
    include: {
      itemEffects: {
        include: {
          effect: true
        }
      }
    }
  });
  syncJson('items.json', allItems);
  res.json(item);
};

export const updateItem = async (req: Request, res: Response) => {
  const { itemEffects, ...itemData } = req.body;
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
      }
    }
  });
  const allItems = await prisma.item.findMany({
    include: {
      itemEffects: {
        include: {
          effect: true
        }
      }
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
