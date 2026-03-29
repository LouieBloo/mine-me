import { Request, Response } from 'express';
import { prisma } from '../../index';
import { getPagination } from '../../services/admin.service';

export const getInventoryItems = async (req: Request, res: Response) => {
  const { skip, take } = getPagination(req, 'itemId');
  const items = await prisma.inventoryItem.findMany({
    skip, take,
    include: { character: true }
  });
  res.json(items);
};

export const getInventoryItem = async (req: Request, res: Response) => {
  const item = await prisma.inventoryItem.findUnique({ 
    where: { id: req.params.id },
    include: { character: true }
  });
  res.json(item);
};

export const createInventoryItem = async (req: Request, res: Response) => {
  const item = await prisma.inventoryItem.create({ data: req.body });
  res.json(item);
};

export const updateInventoryItem = async (req: Request, res: Response) => {
  const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: req.body });
  res.json(item);
};

export const deleteInventoryItem = async (req: Request, res: Response) => {
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.json({ success: true });
};
