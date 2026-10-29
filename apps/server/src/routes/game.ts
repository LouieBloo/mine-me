import { Router, Response } from 'express';
import { prisma } from '../index';
import { listPickableBiomes } from '@mine-me/shared';
import { MiningDataManager } from '../services/mining/subsystems/MiningDataManager';
import { authenticateToken, AuthRequest } from '../middleware/auth';

export const gameRouter = Router();
gameRouter.use(authenticateToken);

// ----------------------------------------------------------------------------
// GET /api/game/cities
// Returns a list of all available cities for the UI dropdown.
// ----------------------------------------------------------------------------
gameRouter.get('/cities', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const cities = await prisma.city.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        worldPositionX: true,
        worldPositionY: true,
        mapIconUrl: true
      },
      orderBy: { name: 'asc' }
    });
    return res.json(cities);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// GET /api/game/city/:cityId
// Returns core city data for the HomeView.
// Security: Verifies the requesting user has an ACTIVE character in that city.
// ----------------------------------------------------------------------------
gameRouter.get('/city/:cityId', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { cityId } = req.params;
    const userId = req.userId!;

    // Verify this user has an active character in the requested city
    const character = await prisma.character.findFirst({
      where: {
        userId,
        cityId,
        status: 'ACTIVE',
      },
      select: { id: true }
    });

    if (!character) {
      return res.status(403).json({ error: 'Forbidden: no active character in this city' });
    }

    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: {
        id: true,
        name: true,
        description: true,
        backgroundImageUrl: true,
      }
    });

    if (!city) {
      return res.status(404).json({ error: 'City not found' });
    }

    return res.json(city);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// GET /api/game/mobs
// Returns all mobs with their animation data for rendering (no drop tables).
// ----------------------------------------------------------------------------
gameRouter.get('/mobs', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const mobs = await prisma.mob.findMany({
      select: {
        id: true,
        name: true,
        level: true,
        health: true,
        defense: true,
        attackPercentage: true,
        defendPercentage: true,
        aiType: true,
        aiConfig: true,
        abilities: true,
        moveSpeed: true,
        jumpForce: true,
        mobEffects: { include: { effect: true } },
        animations: true,
      },
      orderBy: { name: 'asc' },
    });
    return res.json(mobs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// GET /api/game/biomes
// The loaded biomes, for the Single Player biome picker (names only: nothing about how they generate).
// ----------------------------------------------------------------------------
gameRouter.get('/biomes', (_req: AuthRequest, res: Response): any => {
  try {
    return res.json(listPickableBiomes(MiningDataManager.getInstance().getBiomes()));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load the biomes' });
  }
});
