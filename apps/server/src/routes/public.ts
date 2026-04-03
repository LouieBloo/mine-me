import { Router, Request, Response } from 'express';
import { prisma } from '../index';

export const publicRouter = Router();

publicRouter.get('/items', async (req: Request, res: Response): Promise<any> => {
  try {
    const where: any = {};
    if (req.query.isStartingPiece === 'true') {
      where.isStartingPiece = true;
    }
    if (req.query.type) {
      where.type = req.query.type as string;
    }

    const items = await prisma.item.findMany({ where });
    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
