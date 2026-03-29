import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination } from '../../services/admin.service';
import { ITEM_TYPES, ITEM_SUBTYPES, ITEM_RARITIES } from '@nvg/shared';
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

export const getItems = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const items = await prisma.item.findMany({ skip, take, where });
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
  const item = await prisma.item.findUnique({ where: { id: req.params.id } });
  res.json(item);
};

export const createItem = async (req: Request, res: Response) => {
  const item = await prisma.item.create({ data: req.body });
  const allItems = await prisma.item.findMany();
  syncJson('items.json', allItems);
  res.json(item);
};

export const updateItem = async (req: Request, res: Response) => {
  const item = await prisma.item.update({ where: { id: req.params.id }, data: req.body });
  const allItems = await prisma.item.findMany();
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
