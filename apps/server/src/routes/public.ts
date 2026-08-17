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

publicRouter.get('/levels', async (req: Request, res: Response): Promise<any> => {
  try {
    const levels = await prisma.characterLevel.findMany({
      orderBy: { level: 'asc' }
    });
    return res.json(levels);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

publicRouter.get('/blocks', async (req: Request, res: Response): Promise<any> => {
  try {
    const blocks = await prisma.miningBlock.findMany({
      orderBy: { typeKey: 'asc' }
    });
    return res.json(blocks);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
