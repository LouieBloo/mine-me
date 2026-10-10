import { Router, Request, Response } from 'express';
import path from 'path';
import { prisma } from '../index';
import { buildAssetManifest, memoizeManifest } from '../services/assetManifest.service';

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
      orderBy: { typeKey: 'asc' },
      include: { idleParticleEffect: true }
    });
    return res.json(blocks);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

publicRouter.get('/particle-effects', async (req: Request, res: Response): Promise<any> => {
  try {
    const particleEffects = await prisma.particleEffect.findMany({
      orderBy: { name: 'asc' }
    });
    return res.json(particleEffects);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

publicRouter.get('/sounds/bgm', async (req: Request, res: Response): Promise<any> => {
  try {
    const bgmTracks = await prisma.sound.findMany({
      where: {
        type: 'BGM',
        isActive: true
      },
      orderBy: { createdAt: 'asc' }
    });
    return res.json(bgmTracks);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const ASSETS_ROOT = path.join(__dirname, '../../../../packages/shared/assets');

// The world-map art is not part of the mine; background music is streamed, so it is not preloaded.
const getAssetManifest = memoizeManifest(async () => {
  const bgm = await prisma.sound.findMany({ where: { type: 'BGM' }, select: { url: true } });
  return buildAssetManifest(ASSETS_ROOT, {
    excludeDirs: ['cities'],
    excludeUrls: bgm.map((t: { url: string }) => t.url),
  });
}, 60_000);

// GET /api/public/assets/manifest
// Every image and sound effect the mine can use, so the client can load them all up front.
publicRouter.get('/assets/manifest', async (req: Request, res: Response): Promise<any> => {
  try {
    return res.json(await getAssetManifest());
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
